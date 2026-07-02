import SwiftUI

/// Landscape "cinema mode" player. Full-bleed video; karaoke subtitle
/// strip docks on the bottom of the screen with the same 3-color
/// sentence-structure rendering and per-word Turkish gloss as the
/// portrait clip player. Top chrome auto-hides after a few seconds
/// of idle so the frame fills the device. Tapping the video toggles
/// pause/play and brings the chrome back.
struct CinemaPlayerView: View {
    let clips: [LessonClip]
    /// Resume position when the user just toggled in from portrait.
    /// Applied only to the FIRST clip we render — once we advance via
    /// `next()`, subsequent clips ignore it and use their natural
    /// `clip.startTime`. nil = start at the clip's natural beginning.
    var initialTime: Double? = nil
    /// Initial clip within the `clips` array, for the same resume case.
    var initialClipIndex: Int = 0
    /// Fires every player tick with the current clip index + absolute
    /// video time. Lets the parent keep portrait/cinema in sync so
    /// toggling between modes doesn't restart the video.
    var onTick: ((Int, Double) -> Void)? = nil
    /// Fires when the LAST clip in `clips` plays past its endTime —
    /// the cinema-mode equivalent of ClipPlayerView.onFinish. Parents
    /// use this to advance to the next video while keeping cinema on
    /// screen. If nil, cinema falls back to dismissing itself.
    var onFinish: (() -> Void)? = nil
    var onExit: (() -> Void)? = nil

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var index: Int
    @State private var isPlaying = false
    @State private var currentTime: Double
    @State private var command: YouTubePlayerView.PlayerCommand? = nil
    @State private var chromeHidden = false
    @State private var showTranslations = true
    @State private var advancedFromClip: Set<Int> = []
    @State private var hideChromeWorkItem: DispatchWorkItem? = nil
    /// True after we've called `next()` at least once. Distinguishes
    /// "first clip, may need to honor initialTime" from "subsequent
    /// clip, always start at clip.startTime".
    @State private var didAdvance = false

    init(
        clips: [LessonClip],
        initialTime: Double? = nil,
        initialClipIndex: Int = 0,
        onTick: ((Int, Double) -> Void)? = nil,
        onFinish: (() -> Void)? = nil,
        onExit: (() -> Void)? = nil,
    ) {
        self.clips = clips
        self.initialTime = initialTime
        self.initialClipIndex = initialClipIndex
        self.onTick = onTick
        self.onFinish = onFinish
        self.onExit = onExit

        let safeIdx = max(0, min(initialClipIndex, max(0, clips.count - 1)))
        self._index = State(initialValue: safeIdx)
        let resumeStart: Double
        if clips.indices.contains(safeIdx) {
            resumeStart = initialTime ?? clips[safeIdx].startTime
        } else {
            resumeStart = initialTime ?? 0
        }
        self._currentTime = State(initialValue: resumeStart)
    }

    private var clip: LessonClip { clips[index] }

    /// Effective YouTube `startTime` for the currently-rendered clip.
    /// Honors `initialTime` only on the very first clip, before we've
    /// auto-advanced — this is the resume-from-portrait case.
    private var effectiveStartTime: Double {
        if !didAdvance, let t = initialTime { return t }
        return clip.startTime
    }

    private var currentLineIndex: Int? {
        guard !clip.lines.isEmpty else { return nil }
        if let active = clip.lines.firstIndex(where: {
            currentTime >= $0.startTime && currentTime <= $0.endTime
        }) {
            return active
        }
        if let lastPlayed = clip.lines.lastIndex(where: { $0.endTime < currentTime }) {
            return lastPlayed
        }
        return nil
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            videoLayer
                .ignoresSafeArea()

            // Tap target — toggles chrome + play/pause
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    Haptics.light()
                    if chromeHidden {
                        revealChrome()
                    } else {
                        toggleChromeVisibility()
                    }
                }

            VStack(spacing: 0) {
                topChrome
                    .opacity(chromeHidden ? 0 : 1)
                    .allowsHitTesting(!chromeHidden)
                Spacer(minLength: 0)
                karaokeStrip
                    .padding(.bottom, 18)
            }
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.25), value: chromeHidden)
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .lockToLandscape()
        .onAppear {
            appState.isVideoPlayerActive = true
            scheduleChromeHide()
        }
        .onDisappear {
            appState.isVideoPlayerActive = false
            hideChromeWorkItem?.cancel()
        }
        .onChange(of: clip.id) { _, _ in
            currentTime = clip.startTime
            command = .reload
            advancedFromClip = []
        }
    }

    // MARK: - Video layer

    private var videoLayer: some View {
        GeometryReader { geo in
            // Aspect-fill the screen so the video fills the landscape
            // canvas edge-to-edge. Slight crop on top/bottom is
            // acceptable in cinema mode — the karaoke strip masks
            // the bottom anyway.
            //
            // Modern iPhones in landscape are ~19.5:9, so a plain
            // .frame(geo.size) hands the WebView a wider-than-16:9
            // canvas and YouTube black-bars the 16:9 content with
            // pillars on the left/right — the "shifted" look. We size
            // the WebView itself at 16:9 (matched to the wider of the
            // two screen dimensions) so the iframe's video content
            // fills that 16:9 area, then the outer frame + .clipped()
            // crops whatever overflows the actual screen rectangle.
            let videoAspect: CGFloat = 16.0 / 9.0
            let screenAspect = geo.size.width / max(1, geo.size.height)
            let videoSize: CGSize = screenAspect > videoAspect
                ? CGSize(width: geo.size.width,
                         height: geo.size.width / videoAspect)
                : CGSize(width: geo.size.height * videoAspect,
                         height: geo.size.height)

            YouTubePlayerView(
                videoId: clip.youtubeVideoId,
                startTime: effectiveStartTime,
                endTime: clip.endTime,
                autoplay: true,
                isPlaying: $isPlaying,
                currentTime: { t in
                    self.currentTime = t
                    onTick?(index, t)
                    if t >= clip.endTime - 0.05,
                       !advancedFromClip.contains(index) {
                        advancedFromClip.insert(index)
                        next()
                    }
                },
                onReady: { isPlaying = true },
                onEnded: { next() },
                command: $command,
            )
            .frame(width: videoSize.width, height: videoSize.height)
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
    }

    // MARK: - Top chrome

    private var topChrome: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                Haptics.light()
                exitCinema()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Color.black.opacity(0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text("Sahne \(index + 1) / \(clips.count)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                Haptics.selection()
                showTranslations.toggle()
                scheduleChromeHide()
            } label: {
                Image(systemName: showTranslations ? "captions.bubble.fill" : "captions.bubble")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(showTranslations ? Theme.Color.accent : .white)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Color.black.opacity(0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            Button {
                Haptics.light()
                exitCinema()
            } label: {
                Image(systemName: "rectangle.portrait")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Color.black.opacity(0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.pressable)
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.55), .clear],
                startPoint: .top,
                endPoint: .bottom,
            )
            .ignoresSafeArea(edges: .top),
        )
    }

    // MARK: - Karaoke strip

    @ViewBuilder
    private var karaokeStrip: some View {
        if let i = currentLineIndex, !clip.lines.isEmpty {
            let line = clip.lines[i]
            VStack(spacing: 10) {
                CinemaKaraokeLine(
                    line: line,
                    currentTime: currentTime,
                    showTranslations: showTranslations,
                )
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [.clear, .black.opacity(0.7), .black.opacity(0.85)],
                    startPoint: .top,
                    endPoint: .bottom,
                ),
            )
            .id(line.id) // crossfade transitions when the line swaps
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    // MARK: - Actions

    private func next() {
        didAdvance = true
        if index < clips.count - 1 {
            Haptics.medium()
            withAnimation { index += 1 }
        } else {
            Haptics.success()
            // Hand off to the parent so it can advance to the next video
            // (in the SetPlayerView flow). Falling back to exit keeps the
            // standalone cinema use cases working unchanged.
            if let onFinish {
                onFinish()
            } else {
                exitCinema()
            }
        }
    }

    private func exitCinema() {
        if let onExit { onExit() } else { dismiss() }
    }

    private func toggleChromeVisibility() {
        if chromeHidden {
            revealChrome()
        } else {
            // Single tap with chrome visible = pause/play.
            command = isPlaying ? .pause : .play
            scheduleChromeHide()
        }
    }

    private func revealChrome() {
        withAnimation(.easeInOut(duration: 0.25)) {
            chromeHidden = false
        }
        scheduleChromeHide()
    }

    private func scheduleChromeHide() {
        hideChromeWorkItem?.cancel()
        let work = DispatchWorkItem {
            withAnimation(.easeInOut(duration: 0.35)) {
                chromeHidden = true
            }
        }
        hideChromeWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: work)
    }
}

// MARK: - Cinema karaoke line

/// Renders one subtitle line for cinema mode — bigger fonts than the
/// portrait player, centered, with the structure colors and per-word
/// Turkish gloss. Active word lights up cyan + scales subtly so the
/// karaoke moves visibly without ever fragmenting the line.
struct CinemaKaraokeLine: View {
    let line: ClipLine
    let currentTime: Double
    let showTranslations: Bool

    var body: some View {
        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb  ?? [])

        // Use FlowLayout so words wrap naturally — Turkish glosses
        // make some columns wider than the English source word.
        FlowLayout(spacing: 8, lineSpacing: 6) {
            ForEach(Array(line.words.enumerated()), id: \.offset) { i, w in
                cinemaWord(
                    word: w,
                    index: w.wordIndex ?? i,
                    subjectIdx: subjectIdx,
                    auxIdx: auxIdx,
                )
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.easeInOut(duration: 0.22), value: currentTime)
    }

    @ViewBuilder
    private func cinemaWord(
        word w: ClipWord,
        index idx: Int,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        let isActive = currentTime >= w.startTime && currentTime < w.endTime
        let isUpcoming = currentTime < w.startTime

        let bucketKind: BucketKind = {
            if subjectIdx.contains(idx) { return .subject }
            if auxIdx.contains(idx)     { return .auxVerb }
            return .rest
        }()

        let baseColor = bucketColor(bucketKind)
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let opacity: Double = isUpcoming ? 0.55 : 1.0
        let scale: CGFloat = isActive ? 1.08 : 1.0

        VStack(alignment: .center, spacing: 3) {
            Text(displayText(for: w.word, bucket: bucketKind, activeColor: textColor))
                .font(.system(size: 32, weight: .heavy))
                .scaleEffect(scale)
                .shadow(color: .black.opacity(0.95), radius: 14, x: 0, y: 2)
                .shadow(color: .black.opacity(0.85), radius: 4, x: 0, y: 1)

            if showTranslations,
               let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 15, weight: .medium))
                    .italic()
                    .foregroundStyle(Color(hex: 0x9CABCC).opacity(isUpcoming ? 0.55 : 0.9))
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.95), radius: 10, x: 0, y: 1)
                    .shadow(color: .black.opacity(0.8), radius: 3, x: 0, y: 1)
            }
        }
        .opacity(opacity)
    }

    private enum BucketKind { case subject, auxVerb, rest }

    private func bucketColor(_ b: BucketKind) -> Color {
        switch b {
        case .subject: return Color(hex: 0x5BA3DD)
        case .auxVerb: return Color(hex: 0x6BC084)
        case .rest:    return Color(hex: 0xB093D2)
        }
    }

    /// Same contraction-expansion logic as ClipPlayerView so "I'm"
    /// reads as "I am" with split coloring even in cinema mode. Kept
    /// inline (rather than imported) to avoid a wider refactor of
    /// the existing private statics — the cost is one duplicated
    /// table that drifts together with the source.
    private func displayText(for token: String, bucket: BucketKind, activeColor: Color) -> AttributedString {
        let baseColor = bucketColor(bucket)
        let isOverridden = !areColorsEqual(activeColor, baseColor)

        let (core, suffix) = Self.splitTrailingPunctuation(token)
        guard let parts = Self.contractionExpansion(of: core) else {
            var out = AttributedString(token)
            out.foregroundColor = activeColor
            return out
        }

        let firstColor: Color
        let secondColor: Color
        if isOverridden {
            firstColor = activeColor
            secondColor = activeColor
        } else {
            firstColor = baseColor
            secondColor = (bucket == .subject) ? bucketColor(.auxVerb) : baseColor
        }

        let firstWord = Self.matchCase(of: parts.first, mirroring: core)

        var out = AttributedString()
        var firstChunk = AttributedString(firstWord)
        firstChunk.foregroundColor = firstColor
        out.append(firstChunk)
        out.append(AttributedString(" "))
        var secondChunk = AttributedString(parts.second + suffix)
        secondChunk.foregroundColor = secondColor
        out.append(secondChunk)
        return out
    }

    private func areColorsEqual(_ a: Color, _ b: Color) -> Bool {
        String(describing: a) == String(describing: b)
    }

    private static let contractionMap: [String: (first: String, second: String)] = [
        "i'm": ("I", "am"), "you're": ("you", "are"), "he's": ("he", "is"),
        "she's": ("she", "is"), "it's": ("it", "is"), "we're": ("we", "are"),
        "they're": ("they", "are"), "that's": ("that", "is"), "there's": ("there", "is"),
        "here's": ("here", "is"), "what's": ("what", "is"), "where's": ("where", "is"),
        "who's": ("who", "is"), "how's": ("how", "is"),
        "i'll": ("I", "will"), "you'll": ("you", "will"), "he'll": ("he", "will"),
        "she'll": ("she", "will"), "it'll": ("it", "will"), "we'll": ("we", "will"),
        "they'll": ("they", "will"),
        "i've": ("I", "have"), "you've": ("you", "have"), "we've": ("we", "have"),
        "they've": ("they", "have"),
        "i'd": ("I", "would"), "you'd": ("you", "would"), "he'd": ("he", "would"),
        "she'd": ("she", "would"), "we'd": ("we", "would"), "they'd": ("they", "would"),
        "don't": ("do", "not"), "doesn't": ("does", "not"), "didn't": ("did", "not"),
        "isn't": ("is", "not"), "aren't": ("are", "not"), "wasn't": ("was", "not"),
        "weren't": ("were", "not"), "haven't": ("have", "not"), "hasn't": ("has", "not"),
        "hadn't": ("had", "not"), "won't": ("will", "not"), "wouldn't": ("would", "not"),
        "shouldn't": ("should", "not"), "couldn't": ("could", "not"),
        "can't": ("can", "not"), "shan't": ("shall", "not"), "mustn't": ("must", "not"),
        "let's": ("let", "us"),
    ]

    private static func contractionExpansion(of core: String) -> (first: String, second: String)? {
        contractionMap[core.lowercased()]
    }

    private static func splitTrailingPunctuation(_ token: String) -> (core: String, suffix: String) {
        guard let lastLetterIdx = token.lastIndex(where: { $0.isLetter }) else {
            return (token, "")
        }
        let after = token.index(after: lastLetterIdx)
        return (String(token[..<after]), String(token[after...]))
    }

    private static func matchCase(of expanded: String, mirroring original: String) -> String {
        guard let first = original.first, first.isUppercase else { return expanded }
        guard let firstExp = expanded.first else { return expanded }
        return String(firstExp).uppercased() + expanded.dropFirst()
    }
}
