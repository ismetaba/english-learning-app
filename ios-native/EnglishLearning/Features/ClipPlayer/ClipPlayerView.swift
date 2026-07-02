import SwiftUI

/// V3 — Cinematic Overlay.
///
/// Three horizontal zones:
///   1. Video block (16:9) with overlay chrome, center play button, REC chip.
///   2. Subtitle panel — previous / current (karaoke) / next, left accent rail
///      on the current line only.
///   3. Transport row + secondary chip row, with a gradient fade from the
///      background at the bottom.
///
/// Karaoke: within the active line each word is colored by progress —
///   past → text-primary, active → accent w/ underline, upcoming → muted.
struct ClipPlayerView: View {
    let clips: [LessonClip]
    var onClipComplete: ((LessonClip) -> Void)? = nil
    /// Fires when the LAST clip plays past its endTime — i.e. the
    /// video has been watched through to natural completion. Parents
    /// (SetPlayerView) use this to drive the "next video in the set"
    /// transition. NOT fired by the back button — that uses `onExit`.
    var onFinish: (() -> Void)? = nil
    /// Fires when the user taps the back button in the top chrome.
    /// Separates "user wants out" from "video naturally ended", which
    /// previously shared the same `onFinish` and made the back press
    /// look indistinguishable from a finished video. Falls back to
    /// `onFinish` for callers that haven't been updated yet.
    var onExit: (() -> Void)? = nil
    /// When set, the cinema toggle button delegates to this callback
    /// instead of presenting the cinema fullScreenCover internally.
    /// SetPlayerView uses this so cinema mode can persist across
    /// video changes (the cover lives at SetPlayerView level there).
    var onCinemaRequest: (() -> Void)? = nil
    /// Resume position when remounting at a non-zero clip / mid-clip
    /// time (e.g. coming back from cinema mode at the position cinema
    /// left off). Applied only on first mount via `@State` init —
    /// subsequent advances follow the natural clip.startTime.
    var initialClipIndex: Int = 0
    var initialTime: Double? = nil
    /// Fires every player tick with the current clip index + absolute
    /// video time. Lets the parent keep portrait/cinema in sync.
    var onTick: ((Int, Double) -> Void)? = nil
    /// One-shot seek request from the parent. When set non-nil, the
    /// player seeks there and we clear the binding back to nil.
    /// Used by SetPlayerView to seek portrait to wherever cinema
    /// left off when the user toggles cinema off.
    @Binding var resumeAt: Double?
    /// True while another player (typically cinema mode at the
    /// SetPlayerView level) owns audio. Pauses this player on rising
    /// edge so the two video views don't fight over playback.
    var isPaused: Bool = false

    @State private var index: Int
    @State private var currentTime: Double
    @State private var isPlaying = false
    @State private var command: YouTubePlayerView.PlayerCommand? = nil
    /// Tracks which clip indices have already auto-advanced, so
    /// reaching `clip.endTime` only fires `next()` once per clip.
    /// currentTime callbacks come in at ~220ms cadence and a few
    /// frames can land past endTime before the reload kicks in.
    @State private var advancedFromClip: Set<Int> = []
    /// Internal cinema state — only used when `onCinemaRequest` is nil.
    /// Hosts that hoist cinema (SetPlayerView) bypass this entirely.
    @State private var showCinema = false
    /// True after the first internal advance away from the initial
    /// clip — flips us off the `initialTime` resume override and onto
    /// each clip's natural `startTime`.
    @State private var didAdvance = false
    /// Keys of starter-word occurrences we've already paused on, so the
    /// player doesn't re-pause every time the same word loops. Format:
    /// "clipId-lineId-wordIndex".
    @State private var pausedStarters: Set<String> = []
    @State private var starterBanner: StarterPause? = nil
    @State private var isLooping = false
    /// Defaults to 0.75× — comprehension over speed. Storks dialogue
    /// (and most native conversational video) is too fast for an A2
    /// learner at native rate, so we open slow and let the user dial up.
    @State private var speed: Double = 0.75
    @State private var loopRange: (Double, Double)? = nil
    @EnvironmentObject var appState: AppState

    init(
        clips: [LessonClip],
        onClipComplete: ((LessonClip) -> Void)? = nil,
        onFinish: (() -> Void)? = nil,
        onExit: (() -> Void)? = nil,
        onCinemaRequest: (() -> Void)? = nil,
        initialClipIndex: Int = 0,
        initialTime: Double? = nil,
        onTick: ((Int, Double) -> Void)? = nil,
        resumeAt: Binding<Double?> = .constant(nil),
        isPaused: Bool = false,
    ) {
        self.clips = clips
        self.onClipComplete = onClipComplete
        self.onFinish = onFinish
        self.onExit = onExit
        self.onCinemaRequest = onCinemaRequest
        self.initialClipIndex = initialClipIndex
        self.initialTime = initialTime
        self.onTick = onTick
        self._resumeAt = resumeAt
        self.isPaused = isPaused

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

    /// Active line + the starter word we just paused on, used to render the
    /// banner overlay and feed the replay/continue actions.
    struct StarterPause: Equatable {
        let line: ClipLine
        let word: ClipWord
    }

    private var clip: LessonClip { clips[index] }
    private var totalClips: Int { clips.count }

    /// Effective YouTube `startTime` for the currently-rendered clip.
    /// Honors `initialTime` only on the very first clip, before we've
    /// auto-advanced — that's the resume-from-cinema case. Once the
    /// player advances, every subsequent clip starts at its natural
    /// `clip.startTime`.
    private var effectiveStartTime: Double {
        if !didAdvance, let t = initialTime { return t }
        return clip.startTime
    }

    /// The line to keep "selected" in the UI. Strictly-active while a line is
    /// playing, and during the silent gaps between lines we keep the previous
    /// line selected so the accent rail and translation stay on-screen.
    private var currentLineIndex: Int? {
        guard !clip.lines.isEmpty else { return nil }
        if let active = clip.lines.firstIndex(where: {
            currentTime >= $0.startTime && currentTime <= $0.endTime
        }) {
            return active
        }
        // Gap handling — snap to the most recently finished line.
        if let lastPlayed = clip.lines.lastIndex(where: { $0.endTime < currentTime }) {
            return lastPlayed
        }
        return nil
    }

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .bottom) {
            Color(hex: 0x080A14).ignoresSafeArea()
            VStack(spacing: 0) {
                videoBlock
                subtitlePanel
                    .frame(maxHeight: .infinity)
            }
            controls
        }
        .preferredColorScheme(.dark)
        .onChange(of: clip.id) { _, _ in
            currentTime = clip.startTime
            command = .reload
            pausedStarters = []
            starterBanner = nil
            loopRange = nil
            advancedFromClip = []
            // YouTube's loadVideoById resets playback rate to 1.0 — reapply
            // the user's chosen speed once the new video is buffering.
            if speed != 1.0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    command = .setSpeed(speed)
                }
            }
        }
        // Pause the portrait player while Cinema is on so we don't
        // double up on audio. Hosts that hoist cinema externally
        // (SetPlayerView) signal via `isPaused`; the legacy in-view
        // cinema cover signals via `showCinema`.
        .onChange(of: showCinema) { _, on in
            if on { command = .pause }
        }
        .onChange(of: isPaused) { _, on in
            if on { command = .pause }
        }
        // One-shot seek triggered by the parent — used to resume
        // portrait playback at the position cinema mode left off.
        .onChange(of: resumeAt) { _, t in
            guard let t else { return }
            currentTime = t
            command = .seek(t)
            DispatchQueue.main.async {
                if isPaused == false { command = .play }
                resumeAt = nil
            }
        }
        .fullScreenCover(isPresented: $showCinema) {
            CinemaPlayerView(
                clips: clips,
                onExit: { showCinema = false },
            )
            .environmentObject(appState)
        }
    }

    // MARK: - Video block

    private var videoBlock: some View {
        ZStack {
            // YouTube embed
            YouTubePlayerView(
                videoId: clip.youtubeVideoId,
                startTime: effectiveStartTime,
                endTime: clip.endTime,
                autoplay: true,
                isPlaying: $isPlaying,
                currentTime: { t in
                    self.currentTime = t
                    onTick?(index, t)
                    if let loop = loopRange, t >= loop.1 {
                        command = .seek(loop.0)
                        return
                    }
                    // Auto-advance through the clip array. YouTube's
                    // ENDED state never fires for an endTime-bounded
                    // segment (the JS pauses at endTime instead), so
                    // we trip the transition ourselves here. Fires
                    // exactly once per clip via `advancedFromClip` —
                    // currentTime callbacks come in faster than the
                    // reload completes and would otherwise cascade.
                    if t >= clip.endTime - 0.05,
                       !advancedFromClip.contains(index),
                       starterBanner == nil {
                        advancedFromClip.insert(index)
                        next()
                    }
                    // Auto-pause is intentionally disabled — the new flow
                    // is tap-to-learn: starter words are highlighted in
                    // the active line and only pause + show the banner
                    // when the user explicitly taps them.
                },
                onReady: {
                    isPlaying = true
                    // Apply the current playback speed once the player is
                    // live. YouTube's setPlaybackRate is rejected before
                    // the player reaches the READY state, so we wait for
                    // this hook rather than firing it immediately on view
                    // build. Skipped at native rate to avoid a no-op JS
                    // round-trip.
                    if speed != 1.0 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            command = .setSpeed(speed)
                        }
                    }
                },
                onEnded: { next() },
                command: $command
            )

            // Letterbox bars (top / bottom)
            VStack {
                Rectangle().fill(.black).frame(height: 14)
                Spacer()
                Rectangle().fill(.black).frame(height: 14)
            }
            .allowsHitTesting(false)

            // Tap to toggle play/pause. Stays UNDER the chrome layer so the
            // back button and the rest of topChrome receive taps first —
            // earlier this catch-all sat on top and ate every tap, leaving
            // back/CC/expand inert.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    Haptics.medium()
                    command = isPlaying ? .pause : .play
                }

            // Top chrome (back + title + CC + expand)
            VStack {
                topChrome
                Spacer()
                // REC chip
                recChip
                    .padding(.bottom, 14)
                    .allowsHitTesting(false)
            }

            // Center play button — visible only when paused
            if !isPlaying {
                Button {
                    Haptics.medium()
                    command = .play
                } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 64, height: 64)
                        .background(
                            Circle()
                                .fill(Color(hex: 0x080A14, opacity: 0.55))
                                .background(Circle().fill(.ultraThinMaterial))
                        )
                        .overlay(
                            Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1.5)
                        )
                        .shadow(color: Color.black.opacity(0.6), radius: 18, x: 0, y: 6)
                }
                .transition(.opacity)
            }
        }
        .aspectRatio(16.0/9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .background(Color.black)
        .animation(.easeInOut(duration: 0.22), value: isPlaying)
    }

    private var topChrome: some View {
        HStack(alignment: .center, spacing: 10) {
            // Back button — explicit exit, not a "video done" event.
            // Falls back to onFinish for older callers that haven't
            // wired up onExit yet.
            Button {
                Haptics.light()
                (onExit ?? onFinish)?()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            // Title
            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text("Scene \(index + 1) of \(totalClips) · \(formatTime(clip.duration))")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            // Cinema-mode toggle — drops the user into a landscape
            // full-bleed player with the karaoke strip docked at the
            // bottom of the frame. Same clips array, same auto-advance,
            // just rotated and stripped of the side transcript.
            Button {
                Haptics.medium()
                if let onCinemaRequest {
                    onCinemaRequest()
                } else {
                    showCinema = true
                }
            } label: {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.pressable)
        }
        .padding(.horizontal, 12)
        .padding(.top, 20)
        .background(
            LinearGradient(
                colors: [Color(hex: 0x080A14, opacity: 0.9), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .top)
        )
    }

    private var recChip: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color(hex: 0xEF4444))
                .frame(width: 6, height: 6)
            Text("REC · \(formatTime(currentTime - clip.startTime))")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color(hex: 0x080A14, opacity: 0.65)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
    }

    // MARK: - Subtitle panel

    private var subtitlePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Transcript stays mounted at all times so the scroll
            // position survives a starter-tap → "Devam" round trip.
            // Earlier the banner replaced transcriptScroll entirely;
            // closing the banner re-mounted ScrollView from the top
            // and the active line snapped back to line 1. Now the
            // banner overlays on top, transcript keeps its anchor.
            ZStack(alignment: .top) {
                transcriptScroll
                    .opacity(starterBanner == nil ? 1 : 0.08)
                    .allowsHitTesting(starterBanner == nil)

                if let banner = starterBanner {
                    starterChoice(for: banner)
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                        .padding(.bottom, 14)
                        .background(Theme.Color.background.opacity(0.85))
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Scrollable transcript that fills the remaining screen space. Each line
    /// renders either as a dimmed context line or, when active, as the
    /// "currentLineBlock" with accent rail + karaoke. Scroll position
    /// auto-tracks the active line, anchoring it to the top of the
    /// scrollable area so upcoming lines fill the rest of the panel.
    private var transcriptScroll: some View {
        GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Small top padding so the first line has breathing room
                        // from the video block above without pushing it down.
                        Color.clear.frame(height: 12)
                        ForEach(Array(clip.lines.enumerated()), id: \.element.id) { idx, line in
                            VStack(alignment: .leading, spacing: 0) {
                                if currentLineIndex == idx {
                                    currentLineBlock
                                } else {
                                    contextRow(line, idx: idx)
                                }
                                if idx < clip.lines.count - 1 {
                                    dividerRule
                                        .padding(.leading, currentLineIndex == idx || currentLineIndex == idx + 1 ? 0 : 48)
                                }
                            }
                            .id("line-\(idx)")
                        }
                        // Bottom padding so the last line can still scroll up to anchor.
                        Color.clear.frame(height: geo.size.height * 0.45)
                    }
                    .padding(.horizontal, 20)
                }
                .mask(
                    VStack(spacing: 0) {
                        Rectangle().fill(.black)
                        LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                            .frame(height: 140)
                    }
                )
                .onChange(of: currentLineIndex) { _, newValue in
                    guard let i = newValue else { return }
                    withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                        proxy.scrollTo("line-\(i)", anchor: UnitPoint(x: 0.5, y: 0.0))
                    }
                }
            }
        }
    }

    /// Compact row for non-active lines in the scrollable transcript — timestamp
    /// on the left, text + optional translation, no chevron. Tapping seeks.
    private func contextRow(_ line: ClipLine, idx: Int) -> some View {
        let distance = currentLineIndex.map { abs(idx - $0) } ?? 0
        let opacity = max(0.35, 0.9 - Double(distance) * 0.12)
        return Button(action: {
            Haptics.selection()
            command = .seek(line.startTime)
            if !isPlaying { command = .play }
        }) {
            HStack(alignment: .top, spacing: 12) {
                Text(formatTime(line.startTime - clip.startTime))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(hex: 0x5E6B8A))
                    .frame(width: 36, alignment: .leading)
                    .padding(.top, 3)
                Text(structureAttributed(for: line))
                    .font(.system(size: 14, weight: .semibold))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .opacity(opacity)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable(scale: 0.99))
    }

    private var dividerRule: some View {
        Rectangle()
            .fill(Color(hex: 0x1E2A42))
            .frame(height: 1)
    }

    @ViewBuilder
    private var currentLineBlock: some View {
        if let i = currentLineIndex {
            let line = clip.lines[i]
            VStack(alignment: .leading, spacing: 10) {
                if !line.speaker.isEmpty {
                    Text(line.speaker.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.3)
                        .foregroundStyle(Color(hex: 0x8577FF))
                }

                tappableWordsLine(for: line)
            }
            .padding(.leading, 14)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Accent rail as an overlay so it matches the content height exactly
            // rather than stretching down through the rest of the screen.
            .overlay(alignment: .leading) {
                LinearGradient(
                    colors: [Color(hex: 0x06D6B0), Color(hex: 0xA99CFF)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(width: 3)
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                .padding(.vertical, 6)
            }
        } else {
            // Pre-first-line: a quiet placeholder so the layout doesn't jump.
            HStack(spacing: 8) {
                Image(systemName: "waveform")
                    .font(.system(size: 13, weight: .semibold))
                Text("Listening…")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(Color(hex: 0x5E6B8A))
            .padding(.vertical, 20)
        }
    }

    /// The active line rendered as wrapping rows of individual word views.
    ///
    /// Each word is colored by sentence-structure (subject blue / aux amber /
    /// rest white). The currently-spoken word gets the cyan karaoke accent
    /// and underline. Words yet to be spoken are muted gray.
    ///
    /// Starter-set words (those mapped to one of the active vocabulary
    /// targets) get an amber underline as a tap affordance. Tapping a
    /// starter word pauses the video and surfaces the meaning banner —
    /// giving the learner full control over when to break the flow,
    /// rather than auto-pausing on every starter encounter.
    @ViewBuilder
    private func tappableWordsLine(for line: ClipLine) -> some View {
        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb ?? [])

        FlowLayout(spacing: 6, lineSpacing: 4) {
            ForEach(Array(line.words.enumerated()), id: \.offset) { i, w in
                wordView(
                    word: w,
                    line: line,
                    index: w.wordIndex ?? i,
                    subjectIdx: subjectIdx,
                    auxIdx: auxIdx,
                )
            }
        }
        // Slow karaoke transitions — opacity, color, and scale all glide
        // between word states rather than snapping. ~0.28s feels
        // unhurried but still tracks the speaker; spring on the value
        // would overshoot the scale at fast playback rates.
        .animation(.easeInOut(duration: 0.28), value: currentTime)
    }

    @ViewBuilder
    private func wordView(
        word w: ClipWord,
        line: ClipLine,
        index idx: Int,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        let isActive    = currentTime >= w.startTime && currentTime < w.endTime
        let isUpcoming  = currentTime <  w.startTime
        let isStarter   = w.starterId != nil

        let bucketKind: BucketKind = {
            if subjectIdx.contains(idx) { return .subject }
            if auxIdx.contains(idx)     { return .auxVerb }
            return .rest
        }()

        let baseColor = colorFor(bucket: bucketKind)
        // Active and target now use entirely different visual languages
        // so they never compete: active = COLOR + OPACITY + SCALE,
        // target = UNDERLINE. The active word picks up the cyan accent
        // and grows ~5% — the surrounding past words stay in their
        // structure color at full opacity (re-readable), upcoming
        // words sit at 55% opacity so the karaoke "wave" of brightness
        // moves left-to-right naturally as the speaker progresses.
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let wordOpacity: Double = isUpcoming ? 0.55 : 1.0
        let wordScale: CGFloat = isActive ? 1.06 : 1.0

        VStack(alignment: .center, spacing: 1) {
            Text(displayText(for: w.word, bucket: bucketKind, activeColor: textColor))
                .font(.system(size: 20, weight: .bold))
                .scaleEffect(wordScale)
                // Target-word marker — the ONLY underline in the active
                // line. Active is signalled by color + scale instead, so
                // this amber rule unambiguously means "this is a vocab
                // target you can tap to learn". 1.5pt to feel like a
                // pen-mark, not a button border.
                .overlay(alignment: .bottom) {
                    if isStarter {
                        Rectangle()
                            .fill(Color(hex: 0xFFB347))
                            .frame(height: 1.5)
                            .opacity(0.85)
                            .offset(y: 2)
                    }
                }

            // Word-by-word Turkish gloss. Quiet supporting layer — the
            // English text is the primary read; the TR is a hint the
            // eye picks up after.
            if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 10, weight: .regular))
                    .italic()
                    .foregroundStyle(Color(hex: 0x7C8BAE))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .opacity(wordOpacity)
        .contentShape(Rectangle())
        .onTapGesture {
            guard isStarter else { return }
            Haptics.medium()
            command = .pause
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                starterBanner = StarterPause(line: line, word: w)
            }
        }
    }

    private enum BucketKind { case subject, auxVerb, rest }

    /// Static word-by-word rendering for places that show a line OUT of
    /// the karaoke flow (the starter-tap banner today, potentially
    /// review screens later). Each English word sits above its Turkish
    /// gloss with the same 3-color sentence-structure tagging as the
    /// active row, but no scale / opacity / tap behavior — it's a
    /// reference rendering, not a live one.
    @ViewBuilder
    private func staticTranslatedLine(
        for line: ClipLine,
        fontSize: CGFloat = 15,
        glossSize: CGFloat = 10,
    ) -> some View {
        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb  ?? [])

        FlowLayout(spacing: 6, lineSpacing: 6) {
            ForEach(Array(line.words.enumerated()), id: \.offset) { i, w in
                let idx = w.wordIndex ?? i
                let bucketKind: BucketKind = {
                    if subjectIdx.contains(idx) { return .subject }
                    if auxIdx.contains(idx)     { return .auxVerb }
                    return .rest
                }()
                let baseColor = colorFor(bucket: bucketKind)

                VStack(alignment: .center, spacing: 1) {
                    Text(displayText(for: w.word, bucket: bucketKind, activeColor: baseColor))
                        .font(.system(size: fontSize, weight: .semibold))

                    if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                        Text(tr)
                            .font(.system(size: glossSize, weight: .regular))
                            .italic()
                            .foregroundStyle(Color(hex: 0x7C8BAE))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    /// 3-color sentence-structure palette. Designed as a balanced triad
    /// at matched saturation (~50%) and luminance (~65%), so the line
    /// reads as one deliberate palette rather than three random accents.
    ///
    /// Verb stays in a sage-green family rather than amber/orange so it
    /// no longer collides with the amber target-word underline — the
    /// previous caramel V kept reading as "this is a target" on every
    /// verb. Each bucket now occupies its own corner of the wheel:
    /// subject → cool blue, verb → green (action / movement), rest →
    /// soft violet. The cyan karaoke accent (`Theme.Color.accent`) and
    /// the warm amber target underline both sit clear of all three.
    private func colorFor(bucket: BucketKind) -> Color {
        switch bucket {
        case .subject: return Color(hex: 0x5BA3DD)        // refined sky blue
        case .auxVerb: return Color(hex: 0x6BC084)        // sage green
        case .rest:    return Color(hex: 0xB093D2)        // refined lavender
        }
    }

    /// Builds the rendered AttributedString for a word, expanding common
    /// English contractions ("I'm" → "I am", "don't" → "do not") so the
    /// hidden verb / aux is visible to the learner. Expansion is now
    /// unconditional — earlier the active-word path skipped it, so the
    /// karaoke moment briefly snapped from "I am" back to "I'm" and
    /// then to "I am" again as the word entered and left the active
    /// window. Always expanding keeps the visible form stable across
    /// all karaoke states.
    ///
    /// First-half / second-half coloring:
    /// - When NOT active: first half stays in the token's bucket color;
    ///   for pronoun + aux contractions (subject bucket), the second
    ///   half flips to the aux color so "I'm" shows "I"(subject) +
    ///   "am"(aux). Aux + negation contractions ("don't") stay one
    ///   color since both halves belong to the aux bucket.
    /// - When ACTIVE: both halves take the cyan accent uniformly so
    ///   the active-word treatment isn't visually broken in two.
    private func displayText(for token: String, bucket: BucketKind, activeColor: Color) -> AttributedString {
        let baseColor = colorFor(bucket: bucket)
        let isOverridden = !areColorsEqual(activeColor, baseColor)

        // Strip trailing punctuation so we can match against the lowercase
        // contraction key while still preserving the original suffix on output.
        let (core, suffix) = ClipPlayerView.splitTrailingPunctuation(token)

        guard let parts = ClipPlayerView.contractionExpansion(of: core) else {
            var out = AttributedString(token)
            out.foregroundColor = activeColor
            return out
        }

        let firstColor: Color
        let secondColor: Color
        if isOverridden {
            // Active (or any non-base override): paint both halves the
            // same so the contraction reads as one karaoke unit.
            firstColor = activeColor
            secondColor = activeColor
        } else {
            firstColor = baseColor
            secondColor = (bucket == .subject) ? colorFor(bucket: .auxVerb) : baseColor
        }

        let firstWord  = ClipPlayerView.matchCase(of: parts.first, mirroring: core)
        let secondWord = parts.second

        var out = AttributedString()
        var firstChunk = AttributedString(firstWord)
        firstChunk.foregroundColor = firstColor
        out.append(firstChunk)

        out.append(AttributedString(" "))

        var secondChunk = AttributedString(secondWord + suffix)
        secondChunk.foregroundColor = secondColor
        out.append(secondChunk)
        return out
    }

    private func areColorsEqual(_ a: Color, _ b: Color) -> Bool {
        // Cheap reference comparison via description — exact only when both
        // are the same Color literal. Good enough to detect "is the active
        // override in play?" because we always pass the same instances.
        String(describing: a) == String(describing: b)
    }

    // MARK: - Contraction expansion

    /// Common English contractions, lowercase keyed. Pronoun+verb
    /// contractions reveal the hidden auxiliary in the second slot;
    /// aux+negation contractions split into modal + "not".
    private static let contractionMap: [String: (first: String, second: String)] = [
        // pronoun + be
        "i'm":      ("I", "am"),
        "you're":   ("you", "are"),
        "he's":     ("he", "is"),
        "she's":    ("she", "is"),
        "it's":     ("it", "is"),
        "we're":    ("we", "are"),
        "they're":  ("they", "are"),
        "that's":   ("that", "is"),
        "there's":  ("there", "is"),
        "here's":   ("here", "is"),
        "what's":   ("what", "is"),
        "where's":  ("where", "is"),
        "who's":    ("who", "is"),
        "how's":    ("how", "is"),
        // pronoun + will
        "i'll":     ("I", "will"),
        "you'll":   ("you", "will"),
        "he'll":    ("he", "will"),
        "she'll":   ("she", "will"),
        "it'll":    ("it", "will"),
        "we'll":    ("we", "will"),
        "they'll":  ("they", "will"),
        // pronoun + have
        "i've":     ("I", "have"),
        "you've":   ("you", "have"),
        "we've":    ("we", "have"),
        "they've":  ("they", "have"),
        // pronoun + would (or had — would is more common)
        "i'd":      ("I", "would"),
        "you'd":    ("you", "would"),
        "he'd":     ("he", "would"),
        "she'd":    ("she", "would"),
        "we'd":     ("we", "would"),
        "they'd":   ("they", "would"),
        // aux + not
        "don't":     ("do", "not"),
        "doesn't":   ("does", "not"),
        "didn't":    ("did", "not"),
        "isn't":     ("is", "not"),
        "aren't":    ("are", "not"),
        "wasn't":    ("was", "not"),
        "weren't":   ("were", "not"),
        "haven't":   ("have", "not"),
        "hasn't":    ("has", "not"),
        "hadn't":    ("had", "not"),
        "won't":     ("will", "not"),
        "wouldn't":  ("would", "not"),
        "shouldn't": ("should", "not"),
        "couldn't":  ("could", "not"),
        "can't":     ("can", "not"),
        "shan't":    ("shall", "not"),
        "mustn't":   ("must", "not"),
        // imperative-like
        "let's":    ("let", "us"),
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

    /// Mirrors the original token's leading-capitalization onto the
    /// expanded first word, so "I'm" → "I am" and "You're" → "You are"
    /// both keep proper sentence-start casing.
    private static func matchCase(of expanded: String, mirroring original: String) -> String {
        guard let first = original.first, first.isUppercase else { return expanded }
        guard let firstExp = expanded.first else { return expanded }
        return String(firstExp).uppercased() + expanded.dropFirst()
    }

    /// Builds an AttributedString rendering the line with the same 3-color
    /// sentence-structure tagging as the active row, but without the karaoke
    /// active-word / muted-upcoming overrides. Used by the non-active context
    /// rows so the structure coloring stays continuous across the whole
    /// transcript instead of lighting up only while a line is being spoken.
    ///
    /// Contractions are split exactly like in the active path: the first half
    /// keeps the token's bucket color, the second half flips to aux when the
    /// original bucket is subject (so "I'm" → "I"(S) + "am"(AUX)). When the
    /// line has no structure tag at all, every word falls back to the rest
    /// (off-white) color so untagged data still renders cleanly.
    private func structureAttributed(for line: ClipLine) -> AttributedString {
        guard !line.words.isEmpty else {
            var out = AttributedString(line.text)
            out.foregroundColor = Theme.Color.textPrimary
            return out
        }

        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb  ?? [])

        var out = AttributedString()
        for (i, w) in line.words.enumerated() {
            let idx = w.wordIndex ?? i
            let bucket: BucketKind = {
                if subjectIdx.contains(idx) { return .subject }
                if auxIdx.contains(idx)     { return .auxVerb }
                return .rest
            }()
            let baseColor = colorFor(bucket: bucket)
            let token = w.word
            let (core, suffix) = ClipPlayerView.splitTrailingPunctuation(token)

            if let parts = ClipPlayerView.contractionExpansion(of: core) {
                let secondColor: Color = (bucket == .subject)
                    ? colorFor(bucket: .auxVerb)
                    : baseColor
                let firstWord = ClipPlayerView.matchCase(of: parts.first, mirroring: core)

                var firstChunk = AttributedString(firstWord)
                firstChunk.foregroundColor = baseColor
                out.append(firstChunk)

                out.append(AttributedString(" "))

                var secondChunk = AttributedString(parts.second + suffix)
                secondChunk.foregroundColor = secondColor
                out.append(secondChunk)
            } else {
                var chunk = AttributedString(token)
                chunk.foregroundColor = baseColor
                out.append(chunk)
            }

            if i < line.words.count - 1 {
                out.append(AttributedString(" "))
            }
        }
        return out
    }

    /// Karaoke line with three-color sentence-structure coloring.
    ///
    /// Base color (already-spoken / not-active state):
    ///   • subject  → dusty sky blue (#7AB8DC) — pronouns, noun phrases
    ///   • aux_verb → soft caramel   (#E0B07A) — modals + main verb + be/have/do
    ///   • rest     → muted lavender (#B29AD6) — object, complement, modifier
    ///
    /// All three sit at matched saturation / luminance so the line reads as a
    /// single hand-picked palette rather than three loud accent colors. The
    /// hues are spaced ~120° apart on the wheel (triadic) for clean separation
    /// without crossing into the cyan active-word accent or the muted-gray
    /// upcoming color below.
    ///
    /// The base layer is overridden by:
    ///   • upcoming words → muted gray (haven't been spoken yet)
    ///   • currently-spoken word → cyan accent + underline (karaoke active)
    ///
    /// Builds the string by iterating `line.words` so the result lines up
    /// 1:1 with the structure indices, rather than searching `line.text`
    /// which can mis-locate repeated words. Falls back to `line.text` only
    /// when the word list is empty (older or untagged data).
    private func karaokeAttributed(for line: ClipLine) -> AttributedString {
        guard !line.words.isEmpty else {
            var out = AttributedString(line.text)
            out.foregroundColor = Color(hex: 0xF1F3FF)
            return out
        }

        let subjectIdx = Set(line.structure?.subject  ?? [])
        let auxIdx     = Set(line.structure?.auxVerb  ?? [])
        // Anything not in subject/aux is "rest". structure can be nil — in
        // that case every word falls into the white path below.

        var out = AttributedString()
        for (i, w) in line.words.enumerated() {
            let idx = w.wordIndex ?? i
            let isActive   = currentTime >= w.startTime && currentTime < w.endTime
            let isUpcoming = currentTime <  w.startTime

            let baseColor: Color
            if subjectIdx.contains(idx) {
                baseColor = Color(hex: 0x5BA3DD)        // refined sky blue — subject
            } else if auxIdx.contains(idx) {
                baseColor = Color(hex: 0x6BC084)        // sage green — aux/verb
            } else {
                baseColor = Color(hex: 0xB093D2)        // refined lavender — rest
            }

            var chunk = AttributedString(w.word)
            if isActive {
                chunk.foregroundColor = Theme.Color.accent
                chunk.underlineStyle  = .single
            } else if isUpcoming {
                chunk.foregroundColor = Theme.Color.textMuted
            } else {
                chunk.foregroundColor = baseColor
            }
            out.append(chunk)
            if i < line.words.count - 1 {
                out.append(AttributedString(" "))
            }
        }
        return out
    }

    // MARK: - Starter-word pause card

    /// Banner that pops up when an active starter word's endTime is reached.
    /// Shows the word + (when available) its TR translation alongside the
    /// containing line for context, plus the two repeat / continue actions
    /// the Feynman flow specifies.
    private func starterChoice(for pause: StarterPause) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
                Text("YENI KELIME")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.3)
                    .foregroundStyle(Theme.Color.accent)
            }

            // The starter word + its Turkish translation — the learning unit.
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(pause.word.word.replacingOccurrences(of: "[^A-Za-z']", with: "", options: .regularExpression))
                    .font(.system(size: 32, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
                if let tr = pause.word.starterTr, !tr.isEmpty {
                    Text(tr)
                        .font(.system(size: 18, weight: .semibold))
                        .italic()
                        .foregroundStyle(Color(hex: 0xFFB347))
                        .lineLimit(2)
                }
            }
            .padding(.top, 2)

            // The line for context — same word-by-word rendering as the
            // active row (structure colors + per-word Turkish gloss),
            // just smaller and without karaoke / tap so the banner
            // reads as a "frozen frame" of the line that contains the
            // tapped word.
            staticTranslatedLine(for: pause.line, fontSize: 16, glossSize: 10)

            HStack(spacing: 10) {
                Button {
                    Haptics.success()
                    addStarterToVocab(pause: pause)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: alreadyLearned(pause) ? "checkmark" : "plus")
                            .font(.system(size: 12, weight: .heavy))
                        Text(alreadyLearned(pause) ? "Eklendi" : "Ekle")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Color.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Theme.Color.backgroundElevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.Color.border, lineWidth: 1))
                }
                .buttonStyle(.pressable)

                Button {
                    Haptics.medium()
                    continueFromStarter()
                } label: {
                    HStack(spacing: 6) {
                        Text("Devam")
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Theme.Color.primary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .shadow(color: Theme.Color.primaryGlow, radius: 10, x: 0, y: 4)
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.Color.accent.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Controls (absolute bottom)

    private var controls: some View {
        VStack(spacing: 10) {
            transportRow
            chipRow
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 24)
        .background(
            LinearGradient(
                colors: [.clear, Color(hex: 0x080A14, opacity: 0.9), Color(hex: 0x080A14)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
        )
    }

    private var transportRow: some View {
        HStack(spacing: 10) {
            // Prev line (small)
            smallTransport(icon: "backward.end.fill") {
                seekLine(offset: -1)
            }
            // Play / Pause (primary)
            Button {
                Haptics.medium()
                if starterBanner != nil { starterBanner = nil }
                command = isPlaying ? .pause : .play
            } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(Color(hex: 0x8577FF)))
                    .shadow(color: Color(hex: 0x8577FF, opacity: 0.5), radius: 14, x: 0, y: 6)
            }
            .buttonStyle(.pressable)
            // Next line
            smallTransport(icon: "forward.end.fill") {
                seekLine(offset: 1)
            }
            // Scrubber
            scrubber
                .padding(.leading, 6)
        }
    }

    private func smallTransport(icon: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Color(hex: 0x94A0C4))
                .frame(width: 38, height: 38)
                .background(Circle().fill(Color(hex: 0x111827)))
                .overlay(Circle().strokeBorder(Color(hex: 0x1E2A42), lineWidth: 1))
        }
        .buttonStyle(.pressable)
    }

    private var scrubber: some View {
        let total = max(clip.duration, 0.01)
        let played = max(0, min(total, currentTime - clip.startTime))
        let fraction = played / total
        return HStack(spacing: 8) {
            Text(formatTime(played))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color(hex: 0x94A0C4))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(hex: 0x222D47))
                        .frame(height: 4)
                    Capsule()
                        .fill(LinearGradient(
                            colors: [Color(hex: 0x8577FF), Color(hex: 0xA99CFF)],
                            startPoint: .leading,
                            endPoint: .trailing
                        ))
                        .frame(width: max(0, geo.size.width * fraction), height: 4)
                    Circle()
                        .fill(.white)
                        .frame(width: 10, height: 10)
                        .overlay(Circle().strokeBorder(Color(hex: 0x8577FF, opacity: 0.5), lineWidth: 3))
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                        .offset(x: max(0, geo.size.width * fraction) - 5)
                }
                .frame(height: 20)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            let f = max(0, min(1, g.location.x / geo.size.width))
                            command = .seek(clip.startTime + total * f)
                        }
                )
            }
            .frame(height: 20)
            Text(formatTime(total))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color(hex: 0x5E6B8A))
        }
    }

    private var chipRow: some View {
        HStack(spacing: 6) {
            Spacer()
            chip(icon: "arrow.counterclockwise", label: "Replay line", active: false) {
                replayCurrentLine()
            }
            chip(icon: "infinity", label: "Loop", active: isLooping) {
                toggleLoop()
            }
            chip(icon: nil, label: speedLabel, active: speed != 1.0) {
                cycleSpeed()
            }
            Spacer()
        }
    }

    private var speedLabel: String {
        // %g uses the shortest representation: 0.5 → "0.5",
        // 0.75 → "0.75", 1.0 → "1" (no trailing ".00").
        String(format: "%g×", speed)
    }

    private func chip(icon: String?, label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: 5) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 11, weight: .bold))
                }
                Text(label)
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(active ? .white : Color(hex: 0x94A0C4))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(active ? Color(hex: 0x8577FF) : Color(hex: 0x111827))
            )
            .overlay(
                Capsule().strokeBorder(active ? Color(hex: 0x8577FF) : Color(hex: 0x1E2A42), lineWidth: 1)
            )
        }
        .buttonStyle(.pressable)
    }

    // MARK: - Actions

    private func seekLine(offset: Int) {
        guard !clip.lines.isEmpty else { return }
        let base = currentLineIndex ?? 0
        let target = base + offset
        guard (0..<clip.lines.count).contains(target) else { return }
        command = .seek(clip.lines[target].startTime)
        if !isPlaying { command = .play }
    }

    private func replayCurrentLine() {
        guard let i = currentLineIndex else { return }
        let line = clip.lines[i]
        command = .seek(line.startTime)
        if !isPlaying { command = .play }
    }

    private func toggleLoop() {
        if isLooping {
            isLooping = false
            loopRange = nil
        } else if let i = currentLineIndex {
            let line = clip.lines[i]
            isLooping = true
            loopRange = (line.startTime, line.endTime)
        }
    }

    private func cycleSpeed() {
        // 0.75 → 1.0 → 0.5 → 0.75. Starts at 0.75 (the default), first
        // tap goes up to native rate, next tap dives down to half-speed
        // (slow study mode), then loops back to the comfortable default.
        switch speed {
        case 0.75: speed = 1.0
        case 1.0:  speed = 0.5
        default:   speed = 0.75
        }
        command = .setSpeed(speed)
    }

    private func next() {
        onClipComplete?(clip)
        starterBanner = nil
        didAdvance = true
        if index < totalClips - 1 {
            Haptics.medium()
            withAnimation { index += 1 }
        } else {
            Haptics.success()
            onFinish?()
        }
    }

    private func previous() {
        guard index > 0 else { return }
        Haptics.medium()
        starterBanner = nil
        withAnimation { index -= 1 }
    }

    // MARK: - Starter-word auto-pause (Feynman pivot)

    /// Pauses the player at the END of a line that contains an active
    /// starter word, so the learner hears the full sentence in context
    /// before the player stops to highlight the word. We require ≥1.5s
    /// elapsed since the clip started so we don't fire on the first
    /// frame, and a 0.6s detection window past the line's end so we
    /// catch the trigger reliably without re-firing on tail seeks.
    ///
    /// Pause keys are line-scoped (`clipId-lineId`) — one pause per line,
    /// not per starter word, so a line with multiple starters still shows
    /// just one banner.
    private func checkStarterPause(at t: Double) {
        let elapsed = t - clip.startTime
        guard elapsed >= 1.5 else { return }
        guard starterBanner == nil else { return }

        for line in clip.lines {
            let lineKey = "\(clip.id)-\(line.id)"
            guard !pausedStarters.contains(lineKey) else { continue }
            // Skip lines with no starter words at all — nothing to pause for.
            guard let firstStarter = line.words.first(where: { $0.starterId != nil }) else { continue }
            // Trigger only when the LINE finishes (not the individual word).
            guard t >= line.endTime && t <= line.endTime + 0.6 else { continue }

            pausedStarters.insert(lineKey)
            Haptics.medium()
            command = .pause
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                starterBanner = StarterPause(line: line, word: firstStarter)
            }
            return
        }
    }

    /// Adds the tapped starter word to the user's vocab pool and closes
    /// the banner. Idempotent — repeated taps don't re-record. The
    /// player keeps its position so playback resumes from the same line
    /// when the user follows up with "Devam".
    private func addStarterToVocab(pause: StarterPause) {
        if let id = pause.word.starterId {
            appState.markVocabLearned(id)
        }
    }

    /// True when the tapped starter is already in the user's pool, so
    /// the button can switch its label / icon to a "checked" state
    /// instead of presenting the add affordance again.
    private func alreadyLearned(_ pause: StarterPause) -> Bool {
        guard let id = pause.word.starterId else { return false }
        return appState.progress.learnedWords.contains(id)
    }

    private func continueFromStarter() {
        withAnimation(.easeOut(duration: 0.2)) { starterBanner = nil }
        command = .play
    }

    private func formatTime(_ t: Double) -> String {
        let s = max(0, Int(t.rounded()))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}
