import Combine
import SwiftUI

/// Landscape "cinema mode" player. Full-bleed video; karaoke subtitle
/// strip docks on the bottom of the screen with the same 3-color
/// sentence-structure rendering and per-word Turkish gloss as the
/// portrait clip player. Top chrome auto-hides after a few seconds
/// of idle so the frame fills the device. Tapping the video toggles
/// pause/play and brings the chrome back.
///
/// Owns its own `YouTubePlayerController` + `KaraokeSync`, like
/// `ClipPlayerView`: the page ends each clip window itself (`clipEnded`)
/// and the karaoke follows every player event.
struct CinemaPlayerView: View {
    /// Sanitized once (`ClipTiming.sanitize`).
    private let clips: [LessonClip]
    /// `ClipTiming.playbackWindow` of each clip.
    private let windows: [PlaybackWindow]
    /// Resume position when the user just toggled in from portrait.
    /// Applied only to the FIRST clip we render — later clips start at
    /// the beginning of their window. nil = start at the window start.
    let initialTime: Double?
    /// Initial clip within the `clips` array, for the same resume case.
    let initialClipIndex: Int
    /// Fires on every playhead report with the current clip index +
    /// absolute video time. Lets the parent keep portrait/cinema in sync
    /// so toggling between modes doesn't restart the video.
    let onTick: ((Int, Double) -> Void)?
    /// Fires when the LAST clip in `clips` plays to its end — the
    /// cinema-mode equivalent of ClipPlayerView.onFinish. Parents
    /// use this to advance to the next video while keeping cinema on
    /// screen. If nil, cinema falls back to dismissing itself.
    let onFinish: (() -> Void)?
    let onExit: (() -> Void)?
    /// Skip for a video that can't play when there is no further clip
    /// here; falls back to `onFinish`, then to leaving cinema. Setting it
    /// also enables the error overlay's auto-skip countdown.
    let onUnplayable: (() -> Void)?

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @StateObject private var player = YouTubePlayerController()
    @StateObject private var sync = KaraokeSync()
    /// Player events re-delivered through SwiftUI (`onReceive`) so they are
    /// handled with this view's current properties.
    @State private var playerEvents = PassthroughSubject<PlayerEvent, Never>()

    @State private var index: Int
    @State private var didStart = false
    @State private var hasFirstFrame = false
    @State private var chromeHidden = false
    @State private var showTranslations = true
    @State private var hideChromeWorkItem: DispatchWorkItem? = nil

    init(
        clips: [LessonClip],
        initialTime: Double? = nil,
        initialClipIndex: Int = 0,
        onTick: ((Int, Double) -> Void)? = nil,
        onFinish: (() -> Void)? = nil,
        onExit: (() -> Void)? = nil,
        onUnplayable: (() -> Void)? = nil,
    ) {
        let prepared = clips.map { ClipTiming.sanitize($0) }
        self.clips = prepared
        self.windows = prepared.map { ClipTiming.playbackWindow(for: $0) }
        self.initialTime = initialTime
        self.initialClipIndex = initialClipIndex
        self.onTick = onTick
        self.onFinish = onFinish
        self.onExit = onExit
        self.onUnplayable = onUnplayable

        let safeIdx = max(0, min(initialClipIndex, max(0, prepared.count - 1)))
        self._index = State(initialValue: safeIdx)
    }

    private static let emptyClip = LessonClip(id: -1, youtubeVideoId: "", movieTitle: "",
                                              startTime: 0, endTime: 0, lines: [])

    private var clip: LessonClip {
        clips.indices.contains(index) ? clips[index] : Self.emptyClip
    }

    private var hasNextClip: Bool { index < clips.count - 1 }

    private var isPlaybackActive: Bool {
        player.state == .playing || player.state == .buffering
    }

    private var playerErrorMessage: String? {
        if let code = player.errorCode { return YouTubeError.message(forCode: code) }
        if clips.isEmpty { return "Bu videonun altyazıları henüz hazır değil." }
        return nil
    }

    /// The chrome stays up while an error is shown so the way out is visible.
    private var isChromeVisible: Bool {
        !chromeHidden || playerErrorMessage != nil
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

            if !hasFirstFrame && playerErrorMessage == nil {
                ProgressView()
                    .progressViewStyle(.circular)
                    .controlSize(.large)
                    .tint(.white)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }

            if let message = playerErrorMessage {
                PlayerErrorOverlay(
                    message: message,
                    onRetry: retryAction,
                    onSkip: skipAction,
                    skipLabel: skipLabel,
                    autoSkipAfter: onUnplayable != nil ? 5 : nil
                )
                .ignoresSafeArea()
                .transition(.opacity)
            }

            VStack(spacing: 0) {
                topChrome
                    .opacity(isChromeVisible ? 1 : 0)
                    .allowsHitTesting(isChromeVisible)
                Spacer(minLength: 0)
                if playerErrorMessage == nil {
                    karaokeStrip
                        .padding(.bottom, 18)
                }
            }
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.25), value: chromeHidden)
            .animation(.easeInOut(duration: 0.2), value: sync.position.lineIndex)
        }
        .background(Color.black.ignoresSafeArea())
        .animation(.easeInOut(duration: 0.2), value: player.errorCode)
        .animation(.easeInOut(duration: 0.22), value: hasFirstFrame)
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .lockToLandscape()
        .hidesTabBarWhileVisible()
        .onAppear {
            scheduleChromeHide()
            startIfNeeded()
        }
        .onDisappear {
            hideChromeWorkItem?.cancel()
        }
        .onReceive(playerEvents) { event in
            handle(event)
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
            // canvas and YouTube pillarboxes the 16:9 content. We size
            // the WebView itself at 16:9 (matched to the wider of the
            // two screen dimensions) so the video fills that 16:9 area,
            // then the outer frame + .clipped() crops whatever overflows
            // the actual screen rectangle.
            let videoAspect: CGFloat = 16.0 / 9.0
            let screenAspect = geo.size.width / max(1, geo.size.height)
            let videoSize: CGSize = screenAspect > videoAspect
                ? CGSize(width: geo.size.width,
                         height: geo.size.width / videoAspect)
                : CGSize(width: geo.size.height * videoAspect,
                         height: geo.size.height)

            YouTubePlayerView(controller: player)
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
        let position = sync.position
        if let i = position.lineIndex, clip.lines.indices.contains(i) {
            let line = clip.lines[i]
            VStack(spacing: 10) {
                CinemaKaraokeLine(
                    line: line,
                    lineIndex: i,
                    position: position,
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

    // MARK: - Error overlay actions

    private var retryAction: (() -> Void)? {
        guard !clips.isEmpty else { return nil }
        return {
            hasFirstFrame = false
            player.retry()
        }
    }

    private var skipAction: (() -> Void)? {
        if hasNextClip { return { switchToClip(index + 1) } }
        if let skip = onUnplayable ?? onFinish { return skip }
        return { exitCinema() }
    }

    private var skipLabel: String {
        if hasNextClip { return "Sonraki sahne" }
        return onUnplayable != nil || onFinish != nil ? "Sonrakine geç" : "Sinemadan çık"
    }

    // MARK: - Player plumbing

    private func startIfNeeded() {
        guard !didStart, clips.indices.contains(index) else { return }
        didStart = true

        let karaoke = sync
        let events = playerEvents
        player.onEvent = { [weak karaoke] event, hostTime in
            karaoke?.handle(event, hostTime: hostTime)
            events.send(event)
        }
        load(clipAt: index, startingAt: initialTime)
    }

    private func load(clipAt clipIndex: Int, startingAt time: Double?) {
        guard clips.indices.contains(clipIndex) else { return }
        let target = clips[clipIndex]
        let window = windows[clipIndex]
        let start = Self.startTime(time, in: window)
        hasFirstFrame = false
        sync.setLines(target.lines)
        player.load(PlayerSource(videoId: target.youtubeVideoId, start: start, end: window.end, autoplay: true))
        if start != window.start {
            // Resumed mid-clip: a replay after the end still starts at the
            // beginning of the clip.
            player.setBounds(start: window.start, end: window.end, loop: false)
        }
        sync.jump(to: start)
    }

    /// `time` when it lies in (or just before) the window with something
    /// left to play, else the window's start. A little slack below: a vocab
    /// sentence's lead-in can sit a hair before the window (`ScenePlan`).
    private static func startTime(_ time: Double?, in window: PlaybackWindow) -> Double {
        guard let time, time.isFinite, time >= max(0, window.start - 1), time < window.end - 0.25 else {
            return window.start
        }
        return time
    }

    private func handle(_ event: PlayerEvent) {
        switch event {
        case .state(let state):
            switch state {
            case .playing, .paused, .cued, .ended: markFirstFrame()
            case .unstarted, .buffering: break
            }
        case .time(let t, let playing):
            if playing { markFirstFrame() }
            onTick?(index, t)
        case .clipEnded:
            markFirstFrame()
            next()
        case .bridgeReady, .ready, .error:
            // Errors surface through `player.errorCode`.
            break
        }
    }

    private func markFirstFrame() {
        if !hasFirstFrame { hasFirstFrame = true }
    }

    private func switchToClip(_ newIndex: Int) {
        guard clips.indices.contains(newIndex) else { return }
        withAnimation { index = newIndex }
        load(clipAt: newIndex, startingAt: nil)
    }

    // MARK: - Actions

    private func next() {
        if hasNextClip {
            Haptics.medium()
            switchToClip(index + 1)
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
            if isPlaybackActive {
                player.pause()
            } else {
                player.play()
            }
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
/// Turkish gloss. Words are coloured by their karaoke phase in
/// `position`: the active word lights up in the accent colour and scales
/// subtly, upcoming words are dimmed, past words keep their structure
/// colour.
struct CinemaKaraokeLine: View {
    let line: ClipLine
    /// Index of `line` in its clip, as `SyncPosition.lineIndex` counts.
    let lineIndex: Int
    let position: SyncPosition
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
                    phase: position.phase(ofWord: i, inLine: lineIndex),
                    subjectIdx: subjectIdx,
                    auxIdx: auxIdx,
                )
            }
        }
        .frame(maxWidth: .infinity)
        // Keyed on the karaoke position (a few changes a second), never
        // on the clock.
        .animation(.easeInOut(duration: 0.15), value: position)
    }

    @ViewBuilder
    private func cinemaWord(
        word w: ClipWord,
        index idx: Int,
        phase: WordPhase,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        let isActive = phase == .active
        let isUpcoming = phase == .upcoming

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
