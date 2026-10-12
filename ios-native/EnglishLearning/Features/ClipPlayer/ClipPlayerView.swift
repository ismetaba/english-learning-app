import Combine
import SwiftUI

/// V3 — Cinematic Overlay.
///
/// Three horizontal zones:
///   1. Video block (16:9) with overlay chrome, center play button, time chip.
///   2. Subtitle panel — scrolling transcript; the current line gets the
///      left accent rail and the word-by-word karaoke.
///   3. Transport row + secondary chip row, with a gradient fade from the
///      background at the bottom.
///
/// Playback runs through a `YouTubePlayerController` this screen owns; every
/// player event also drives a `KaraokeSync`, whose `position` decides which
/// line is current and which word is lit (past → structure colour, active →
/// accent + scale, upcoming → dimmed). The page ends each clip window by
/// itself (`clipEnded`), so advancing never depends on catching a tick.
struct ClipPlayerView: View {
    /// The clips as given, sanitized once (`ClipTiming.sanitize`):
    /// everything below reads these.
    private let prepared: [LessonClip]
    /// `ClipTiming.playbackWindow` of each prepared clip.
    private let windows: [PlaybackWindow]
    /// Structure-coloured text of every line of every clip, built once
    /// instead of on each karaoke update.
    private let contextTexts: [[AttributedString]]

    let onClipComplete: ((LessonClip) -> Void)?
    /// Fires when the LAST clip plays to the end of its window — i.e. the
    /// video has been watched through to natural completion. Parents
    /// (SetPlayerView) use this to drive the "next video in the set"
    /// transition. NOT fired by the back button — that uses `onExit`.
    let onFinish: (() -> Void)?
    /// Fires when the user taps the back button in the top chrome. Falls
    /// back to `onFinish` for callers that haven't wired it up.
    let onExit: (() -> Void)?
    /// When set, the cinema toggle button delegates to this callback
    /// instead of presenting the cinema fullScreenCover internally.
    /// SetPlayerView uses this so cinema mode can persist across
    /// video changes (the cover lives at SetPlayerView level there).
    let onCinemaRequest: (() -> Void)?
    /// Clip to start on, and a media time to start that clip at (e.g. the
    /// sentence a vocab card points to). Applied on first appear only;
    /// later clips start at the beginning of their window.
    let initialClipIndex: Int
    let initialTime: Double?
    /// Fires on every playhead report with the current clip index + absolute
    /// video time. Lets the parent keep portrait/cinema in sync.
    let onTick: ((Int, Double) -> Void)?
    /// One-shot seek request from the parent. When set non-nil, the
    /// player seeks there (and plays unless `isPaused`) and we clear the
    /// binding back to nil. Used by SetPlayerView to resume portrait
    /// wherever cinema left off.
    @Binding var resumeAt: Double?
    /// True while another player (typically cinema mode at the
    /// SetPlayerView level) owns audio. Pauses this player on rising
    /// edge so the two video views don't fight over playback.
    let isPaused: Bool
    /// Called when the learner skips (or the countdown skips) a video that
    /// can't play and there is no further clip here. Falls back to
    /// `onFinish`, then `onExit`. Setting it also enables the overlay's
    /// auto-skip countdown.
    let onUnplayable: (() -> Void)?

    @EnvironmentObject var appState: AppState

    @StateObject private var player = YouTubePlayerController()
    @StateObject private var sync = KaraokeSync()
    /// Player events re-delivered through SwiftUI (`onReceive`), so they are
    /// handled with this view's current properties rather than the ones
    /// captured when the controller's callback was installed.
    @State private var playerEvents = PassthroughSubject<PlayerEvent, Never>()

    @State private var index: Int
    @State private var didStart = false
    /// The current load has shown something (a frame, the cued thumbnail);
    /// until then a spinner replaces the center play button.
    @State private var hasFirstFrame = false
    /// Internal cinema state — only used when `onCinemaRequest` is nil.
    /// Hosts that hoist cinema (SetPlayerView) bypass this entirely.
    @State private var showCinema = false
    /// Where the internal cinema player got to, so portrait resumes there.
    @State private var cinemaHandoff = CinemaHandoff()
    @State private var starterBanner: StarterPause? = nil
    /// The clip ended while the starter banner was open; "Devam" moves on
    /// instead of replaying the finished window.
    @State private var advancePending = false
    @State private var isLooping = false
    /// Defaults to 0.75× — comprehension over speed. Native conversational
    /// video is too fast for an A2 learner at native rate, so we open slow
    /// and let the user dial up.
    @State private var speed: Double = 0.75
    /// Scrubber position while the learner drags; the seek happens once,
    /// on release.
    @State private var scrubPreview: Double? = nil

    /// Seeks to a line land this far before it so its first word isn't clipped.
    private static let lineLeadIn: Double = 0.15
    /// A looped line keeps playing this long after its last word.
    private static let loopTail: Double = 0.2

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
        onUnplayable: (() -> Void)? = nil,
    ) {
        let prepared = clips.map { ClipTiming.sanitize($0) }
        self.prepared = prepared
        self.windows = prepared.map { ClipTiming.playbackWindow(for: $0) }
        self.contextTexts = prepared.map { clip in
            clip.lines.map { ClipPlayerView.structureAttributed(for: $0) }
        }
        self.onClipComplete = onClipComplete
        self.onFinish = onFinish
        self.onExit = onExit
        self.onCinemaRequest = onCinemaRequest
        self.initialClipIndex = initialClipIndex
        self.initialTime = initialTime
        self.onTick = onTick
        self._resumeAt = resumeAt
        self.isPaused = isPaused
        self.onUnplayable = onUnplayable

        let safeIdx = max(0, min(initialClipIndex, max(0, prepared.count - 1)))
        self._index = State(initialValue: safeIdx)
    }

    /// Active line + the starter word the learner tapped, used to render the
    /// banner overlay and feed the add / continue actions.
    struct StarterPause: Equatable {
        let line: ClipLine
        let word: ClipWord
    }

    private static let emptyClip = LessonClip(id: -1, youtubeVideoId: "", movieTitle: "",
                                              startTime: 0, endTime: 0, lines: [])

    private var clip: LessonClip {
        prepared.indices.contains(index) ? prepared[index] : Self.emptyClip
    }

    private var window: PlaybackWindow {
        windows.indices.contains(index) ? windows[index] : PlaybackWindow(start: 0, end: 0)
    }

    private var totalClips: Int { prepared.count }
    private var hasNextClip: Bool { index < prepared.count - 1 }

    /// Playing, or about to (buffering): the play/pause controls offer pause.
    private var isPlaybackActive: Bool {
        player.state == .playing || player.state == .buffering
    }

    private var playerErrorMessage: String? {
        if let code = player.errorCode { return YouTubeError.message(forCode: code) }
        if prepared.isEmpty { return "Bu videonun altyazıları henüz hazır değil." }
        return nil
    }

    private var showsLoadingSpinner: Bool {
        !hasFirstFrame && playerErrorMessage == nil
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
            errorLayer
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.2), value: player.errorCode)
        .onAppear(perform: startIfNeeded)
        .onReceive(playerEvents) { event in
            handle(event)
        }
        // Pause the portrait player while Cinema is on so we don't
        // double up on audio. Hosts that hoist cinema externally
        // (SetPlayerView) signal via `isPaused`; the in-view cinema
        // cover signals via `showCinema`.
        .onChange(of: isPaused) { _, paused in
            if paused { player.pause() }
        }
        .onChange(of: showCinema) { _, on in
            if on {
                player.pause()
            } else {
                resumeFromCinema()
            }
        }
        // One-shot seek triggered by the parent — used to resume
        // portrait playback at the position cinema mode left off.
        .onChange(of: resumeAt) { _, t in
            guard let t else { return }
            resume(at: t)
            resumeAt = nil
        }
        .fullScreenCover(isPresented: $showCinema) {
            CinemaPlayerView(
                clips: prepared,
                initialTime: cinemaHandoff.startTime,
                initialClipIndex: cinemaHandoff.clipIndex,
                onTick: { clipIndex, t in
                    cinemaHandoff.clipIndex = clipIndex
                    cinemaHandoff.time = t
                },
                onExit: { showCinema = false },
            )
            .environmentObject(appState)
        }
    }

    // MARK: - Video block

    private var videoBlock: some View {
        ZStack {
            YouTubePlayerView(controller: player)

            // Letterbox bars (top / bottom)
            VStack {
                Rectangle().fill(.black).frame(height: 14)
                Spacer()
                Rectangle().fill(.black).frame(height: 14)
            }
            .allowsHitTesting(false)

            // Tap to toggle play/pause. Stays UNDER the chrome layer so the
            // back button and the rest of topChrome receive taps first.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    Haptics.medium()
                    togglePlayback()
                }

            // Top chrome (back + title + expand) and the time chip
            VStack {
                topChrome
                Spacer()
                timeChip
                    .padding(.bottom, 14)
                    .allowsHitTesting(false)
            }

            if showsLoadingSpinner {
                // First frame still loading — a spinner, not a play button
                // that would do nothing yet.
                ProgressView()
                    .progressViewStyle(.circular)
                    .controlSize(.large)
                    .tint(.white)
                    .padding(18)
                    .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                    .allowsHitTesting(false)
                    .transition(.opacity)
            } else if !isPlaybackActive && playerErrorMessage == nil {
                // Center play button — visible only when paused
                Button {
                    Haptics.medium()
                    togglePlayback()
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
        .animation(.easeInOut(duration: 0.22), value: isPlaybackActive)
        .animation(.easeInOut(duration: 0.22), value: hasFirstFrame)
    }

    private var backButton: some View {
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
    }

    private var topChrome: some View {
        HStack(alignment: .center, spacing: 10) {
            backButton

            // Title
            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text("Sahne \(index + 1) / \(totalClips) · \(formatTime(window.duration))")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            // Cinema-mode toggle — drops the user into a landscape
            // full-bleed player with the karaoke strip docked at the
            // bottom of the frame.
            Button {
                Haptics.medium()
                if let onCinemaRequest {
                    onCinemaRequest()
                } else {
                    cinemaHandoff.clipIndex = index
                    cinemaHandoff.startTime = sync.time
                    cinemaHandoff.time = nil
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

    /// Elapsed time in the clip.
    private var timeChip: some View {
        Text(formatTime((scrubPreview ?? sync.coarseTime) - window.start))
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color(hex: 0x080A14, opacity: 0.65)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
    }

    // MARK: - Error layer

    /// Covers the whole player (the transcript and controls are useless
    /// without a video) but keeps a way back.
    @ViewBuilder
    private var errorLayer: some View {
        if let message = playerErrorMessage {
            PlayerErrorOverlay(
                message: message,
                onRetry: retryAction,
                onSkip: skipAction,
                skipLabel: skipLabel,
                autoSkipAfter: onUnplayable != nil ? 5 : nil
            )
            .overlay(alignment: .topLeading) {
                backButton
                    .padding(.leading, 12)
                    .padding(.top, 20)
            }
            .transition(.opacity)
        }
    }

    private var retryAction: (() -> Void)? {
        guard !prepared.isEmpty else { return nil }
        return { retryPlayback() }
    }

    private var skipAction: (() -> Void)? {
        if hasNextClip { return { skipToNextClip() } }
        return onUnplayable ?? onFinish ?? onExit
    }

    private var skipLabel: String {
        if hasNextClip { return "Sonraki sahne" }
        return onUnplayable != nil ? "Sonrakine geç" : "Geri dön"
    }

    // MARK: - Subtitle panel

    private var subtitlePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Transcript stays mounted at all times so the scroll
            // position survives a starter-tap → "Devam" round trip;
            // the banner overlays on top, transcript keeps its anchor.
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
    /// renders either as a dimmed context line or, when current, as the
    /// "currentLineBlock" with accent rail + karaoke. Scroll position
    /// auto-tracks the current line, anchoring it to the top of the
    /// scrollable area so upcoming lines fill the rest of the panel.
    private var transcriptScroll: some View {
        let lines = clip.lines
        let currentLine = sync.position.lineIndex
        return GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Small top padding so the first line has breathing room
                        // from the video block above without pushing it down.
                        Color.clear.frame(height: 12)
                            .id("transcript-top")
                        if currentLine == nil {
                            sceneStartingPlaceholder
                        }
                        ForEach(Array(lines.enumerated()), id: \.element.id) { idx, line in
                            VStack(alignment: .leading, spacing: 0) {
                                if currentLine == idx {
                                    currentLineBlock(line, lineIndex: idx)
                                } else {
                                    contextRow(line, idx: idx, currentLine: currentLine)
                                }
                                if idx < lines.count - 1 {
                                    dividerRule
                                        .padding(.leading, currentLine == idx || currentLine == idx + 1 ? 0 : 48)
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
                .onChange(of: sync.position.lineIndex) { _, newValue in
                    guard let i = newValue else { return }
                    withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                        proxy.scrollTo("line-\(i)", anchor: UnitPoint(x: 0.5, y: 0.0))
                    }
                }
                .onChange(of: index) { _, _ in
                    proxy.scrollTo("transcript-top", anchor: .top)
                }
            }
        }
    }

    /// Before the first subtitle line starts.
    private var sceneStartingPlaceholder: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .font(.system(size: 13, weight: .semibold))
            Text("Sahne başlıyor…")
                .font(.system(size: 14, weight: .medium))
        }
        .foregroundStyle(Color(hex: 0x5E6B8A))
        .padding(.vertical, 14)
    }

    /// Compact row for non-current lines in the scrollable transcript —
    /// timestamp on the left, structure-coloured text. Tapping seeks.
    private func contextRow(_ line: ClipLine, idx: Int, currentLine: Int?) -> some View {
        let distance = currentLine.map { abs(idx - $0) } ?? 0
        let opacity = max(0.35, 0.9 - Double(distance) * 0.12)
        return Button(action: {
            Haptics.selection()
            jumpToLine(idx)
        }) {
            HStack(alignment: .top, spacing: 12) {
                Text(formatTime(line.startTime - window.start))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(hex: 0x5E6B8A))
                    .frame(width: 36, alignment: .leading)
                    .padding(.top, 3)
                Text(contextText(lineIndex: idx, line: line))
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

    private func contextText(lineIndex: Int, line: ClipLine) -> AttributedString {
        if contextTexts.indices.contains(index), contextTexts[index].indices.contains(lineIndex) {
            return contextTexts[index][lineIndex]
        }
        return Self.structureAttributed(for: line)
    }

    private var dividerRule: some View {
        Rectangle()
            .fill(Color(hex: 0x1E2A42))
            .frame(height: 1)
    }

    private func currentLineBlock(_ line: ClipLine, lineIndex: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !line.speaker.isEmpty {
                Text(line.speaker.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.3)
                    .foregroundStyle(Color(hex: 0x8577FF))
            }

            tappableWordsLine(for: line, lineIndex: lineIndex)
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
    }

    /// The current line rendered as wrapping rows of individual word views.
    ///
    /// Each word is coloured by sentence structure (subject blue / aux green
    /// / rest lavender) once spoken; the word being spoken gets the accent
    /// colour and grows slightly; words yet to be spoken are dimmed.
    ///
    /// Starter-set words get an amber underline as a tap affordance. Tapping
    /// one pauses the video and surfaces the meaning banner.
    @ViewBuilder
    private func tappableWordsLine(for line: ClipLine, lineIndex: Int) -> some View {
        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb ?? [])
        let position   = sync.position

        if line.words.isEmpty {
            Text(line.text)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            FlowLayout(spacing: 6, lineSpacing: 4) {
                ForEach(Array(line.words.enumerated()), id: \.offset) { i, w in
                    wordView(
                        word: w,
                        line: line,
                        structureIndex: w.wordIndex ?? i,
                        phase: position.phase(ofWord: i, inLine: lineIndex),
                        subjectIdx: subjectIdx,
                        auxIdx: auxIdx,
                    )
                }
            }
            // Short glide between word states; keyed on the karaoke
            // position (a few changes a second), never on the clock.
            .animation(.easeInOut(duration: 0.15), value: position)
        }
    }

    @ViewBuilder
    private func wordView(
        word w: ClipWord,
        line: ClipLine,
        structureIndex idx: Int,
        phase: WordPhase,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        let isActive    = phase == .active
        let isUpcoming  = phase == .upcoming
        let isStarter   = w.starterId != nil

        let bucketKind: BucketKind = {
            if subjectIdx.contains(idx) { return .subject }
            if auxIdx.contains(idx)     { return .auxVerb }
            return .rest
        }()

        let baseColor = Self.colorFor(bucket: bucketKind)
        // Active and target use different visual languages so they never
        // compete: active = COLOR + SCALE, target = UNDERLINE. Past words
        // stay in their structure colour at full opacity (re-readable),
        // upcoming words sit at 55% opacity so the karaoke "wave" of
        // brightness moves left-to-right as the speaker progresses.
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let wordOpacity: Double = isUpcoming ? 0.55 : 1.0
        let wordScale: CGFloat = isActive ? 1.06 : 1.0

        VStack(alignment: .center, spacing: 1) {
            Text(Self.displayText(for: w.word, bucket: bucketKind, activeColor: textColor))
                .font(.system(size: 20, weight: .bold))
                .scaleEffect(wordScale)
                // Target-word marker — the ONLY underline in the current
                // line, so this amber rule unambiguously means "this is a
                // vocab target you can tap to learn".
                .overlay(alignment: .bottom) {
                    if isStarter {
                        Rectangle()
                            .fill(Color(hex: 0xFFB347))
                            .frame(height: 1.5)
                            .opacity(0.85)
                            .offset(y: 2)
                    }
                }

            // Word-by-word Turkish gloss. Quiet supporting layer.
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
            player.pause()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                starterBanner = StarterPause(line: line, word: w)
            }
        }
    }

    private enum BucketKind { case subject, auxVerb, rest }

    /// Static word-by-word rendering for places that show a line OUT of
    /// the karaoke flow (the starter-tap banner). Each English word sits
    /// above its Turkish gloss with the same 3-color structure tagging,
    /// but no scale / opacity / tap behavior.
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
                let baseColor = Self.colorFor(bucket: bucketKind)

                VStack(alignment: .center, spacing: 1) {
                    Text(Self.displayText(for: w.word, bucket: bucketKind, activeColor: baseColor))
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

    /// 3-color sentence-structure palette: a balanced triad at matched
    /// saturation and luminance. Subject → cool blue, verb → sage green,
    /// rest → soft violet. The cyan karaoke accent (`Theme.Color.accent`)
    /// and the warm amber target underline both sit clear of all three.
    private static func colorFor(bucket: BucketKind) -> Color {
        switch bucket {
        case .subject: return Color(hex: 0x5BA3DD)        // refined sky blue
        case .auxVerb: return Color(hex: 0x6BC084)        // sage green
        case .rest:    return Color(hex: 0xB093D2)        // refined lavender
        }
    }

    /// Builds the rendered AttributedString for a word, expanding common
    /// English contractions ("I'm" → "I am", "don't" → "do not") so the
    /// hidden verb / aux is visible to the learner. Expansion is
    /// unconditional so the visible form stays stable across karaoke states.
    ///
    /// - NOT active: first half keeps the token's bucket colour; for
    ///   pronoun + aux contractions (subject bucket) the second half flips
    ///   to the aux colour ("I"(subject) + "am"(aux)).
    /// - ACTIVE: both halves take the accent uniformly.
    private static func displayText(for token: String, bucket: BucketKind, activeColor: Color) -> AttributedString {
        let baseColor = colorFor(bucket: bucket)
        let isOverridden = !areColorsEqual(activeColor, baseColor)

        // Strip trailing punctuation so we can match against the lowercase
        // contraction key while still preserving the original suffix on output.
        let (core, suffix) = splitTrailingPunctuation(token)

        guard let parts = contractionExpansion(of: core) else {
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
            secondColor = (bucket == .subject) ? colorFor(bucket: .auxVerb) : baseColor
        }

        let firstWord  = matchCase(of: parts.first, mirroring: core)
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

    private static func areColorsEqual(_ a: Color, _ b: Color) -> Bool {
        // Cheap comparison via description — exact only when both are the
        // same Color literal, which is all we need to detect "is the active
        // override in play?".
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

    /// The line with the same 3-color sentence-structure tagging as the
    /// current row, without the karaoke overrides. Used by the context rows
    /// so the structure colouring stays continuous across the transcript.
    /// Contractions are split like in the current row. Untagged lines fall
    /// back to the rest colour.
    private static func structureAttributed(for line: ClipLine) -> AttributedString {
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
            let (core, suffix) = splitTrailingPunctuation(token)

            if let parts = contractionExpansion(of: core) {
                let secondColor: Color = (bucket == .subject)
                    ? colorFor(bucket: .auxVerb)
                    : baseColor
                let firstWord = matchCase(of: parts.first, mirroring: core)

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

    // MARK: - Starter-word card

    /// Banner shown when the learner taps a starter word. Shows the word +
    /// (when available) its TR translation alongside the containing line
    /// for context, plus the add / continue actions.
    private func starterChoice(for pause: StarterPause) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
                Text("YENİ KELİME")
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
            // current row (structure colours + per-word Turkish gloss),
            // just smaller and without karaoke / tap.
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
                togglePlayback()
            } label: {
                Image(systemName: isPlaybackActive ? "pause.fill" : "play.fill")
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

    /// Shows the ~4 Hz playhead within the clip window. Dragging only moves
    /// a local preview; the player seeks once, on release.
    private var scrubber: some View {
        let window = self.window
        let total = max(window.duration, 0.01)
        let shown = scrubPreview ?? sync.coarseTime
        let played = max(0, min(total, shown - window.start))
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
                            let f = max(0, min(1, g.location.x / max(geo.size.width, 1)))
                            scrubPreview = window.start + total * f
                        }
                        .onEnded { g in
                            let f = max(0, min(1, g.location.x / max(geo.size.width, 1)))
                            scrubPreview = nil
                            scrub(to: window.start + total * f)
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
            chip(icon: "arrow.counterclockwise", label: "Satırı tekrarla", active: false) {
                replayCurrentLine()
            }
            chip(icon: "infinity", label: "Döngü", active: isLooping) {
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

    // MARK: - Player plumbing

    /// Runs once per screen: wires the controller to the karaoke and loads
    /// the first clip (at `initialTime` when given).
    private func startIfNeeded() {
        guard !didStart, prepared.indices.contains(index) else { return }
        didStart = true

        let karaoke = sync
        let events = playerEvents
        player.onEvent = { [weak karaoke] event, hostTime in
            karaoke?.handle(event, hostTime: hostTime)
            events.send(event)
        }
        player.setRate(speed)
        sync.setRate(speed)
        load(clipAt: index, startingAt: initialTime, autoplay: !isPaused)
    }

    /// Loads `prepared[clipIndex]`'s window into the player and the karaoke.
    private func load(clipAt clipIndex: Int, startingAt time: Double?, autoplay: Bool) {
        guard prepared.indices.contains(clipIndex) else { return }
        let target = prepared[clipIndex]
        let window = windows[clipIndex]
        let start = Self.startTime(time, in: window)
        hasFirstFrame = false
        sync.setLines(target.lines)
        player.load(PlayerSource(videoId: target.youtubeVideoId, start: start, end: window.end, autoplay: autoplay))
        if start != window.start {
            // Started mid-clip: a replay after the end still starts at the
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
            clipDidEnd()
        case .bridgeReady, .ready, .error:
            // Errors surface through `player.errorCode`.
            break
        }
    }

    private func markFirstFrame() {
        if !hasFirstFrame { hasFirstFrame = true }
    }

    /// The page reached the end of the clip window (never fires while a
    /// line loops).
    private func clipDidEnd() {
        guard starterBanner == nil else {
            // The learner is reading the word card; move on when they
            // tap "Devam".
            advancePending = true
            return
        }
        advance()
    }

    /// Natural end of the current clip: next clip, or the end of the video.
    private func advance() {
        advancePending = false
        onClipComplete?(clip)
        if hasNextClip {
            Haptics.medium()
            switchToClip(index + 1, startingAt: nil)
        } else {
            Haptics.success()
            onFinish?()
        }
    }

    private func switchToClip(_ newIndex: Int, startingAt time: Double?) {
        guard prepared.indices.contains(newIndex) else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            index = newIndex
            starterBanner = nil
        }
        advancePending = false
        isLooping = false
        scrubPreview = nil
        load(clipAt: newIndex, startingAt: time, autoplay: !isPaused)
    }

    /// Error overlay "skip" with a further clip in this player.
    private func skipToNextClip() {
        guard hasNextClip else { return }
        switchToClip(index + 1, startingAt: nil)
    }

    private func retryPlayback() {
        hasFirstFrame = false
        player.retry()
    }

    // MARK: - Actions

    private func togglePlayback() {
        if isPlaybackActive {
            player.pause()
        } else {
            closeStarterBanner()
            resumePlayback()
        }
    }

    /// Play, or — when the clip ended while the word card was open — move on.
    private func resumePlayback() {
        if advancePending {
            advance()
        } else {
            player.play()
        }
    }

    private func closeStarterBanner() {
        guard starterBanner != nil else { return }
        withAnimation(.easeOut(duration: 0.2)) { starterBanner = nil }
    }

    private func seek(to t: Double, play: Bool) {
        player.seek(to: t)
        if play { player.play() }
        sync.jump(to: t)
    }

    /// Plays line `i` from its start. A running loop moves to that line.
    private func jumpToLine(_ i: Int) {
        let lines = clip.lines
        guard lines.indices.contains(i) else { return }
        let line = lines[i]
        let start = max(0, line.startTime - Self.lineLeadIn)
        if isLooping {
            player.setBounds(start: start, end: line.endTime + Self.loopTail, loop: true)
        }
        closeStarterBanner()
        advancePending = false
        seek(to: start, play: true)
    }

    private func seekLine(offset: Int) {
        let lines = clip.lines
        guard !lines.isEmpty else { return }
        let target: Int
        if let current = sync.position.lineIndex {
            target = current + offset
        } else {
            // Before the first line: "next" goes to it, "previous" has nowhere to go.
            target = offset > 0 ? 0 : -1
        }
        guard lines.indices.contains(target) else { return }
        jumpToLine(target)
    }

    private func replayCurrentLine() {
        guard !clip.lines.isEmpty else { return }
        jumpToLine(sync.position.lineIndex ?? 0)
    }

    private func toggleLoop() {
        if isLooping {
            stopLooping()
        } else if let i = sync.position.lineIndex, clip.lines.indices.contains(i) {
            let line = clip.lines[i]
            let start = max(0, line.startTime - Self.lineLeadIn)
            isLooping = true
            player.setBounds(start: start, end: line.endTime + Self.loopTail, loop: true)
            closeStarterBanner()
            advancePending = false
            seek(to: start, play: true)
        }
    }

    /// Back to playing the whole clip window.
    private func stopLooping() {
        guard isLooping else { return }
        isLooping = false
        player.setBounds(start: window.start, end: window.end, loop: false)
    }

    private func scrub(to t: Double) {
        // Scrubbing leaves the looped line.
        stopLooping()
        advancePending = false
        seek(to: t, play: false)
    }

    /// Parent-requested resume (portrait after cinema).
    private func resume(at t: Double) {
        stopLooping()
        advancePending = false
        seek(to: t, play: !isPaused)
    }

    /// The internal cinema cover closed: carry on from where it got to.
    private func resumeFromCinema() {
        guard let t = cinemaHandoff.time else { return }
        let clipIndex = cinemaHandoff.clipIndex
        cinemaHandoff.time = nil
        if clipIndex != index, prepared.indices.contains(clipIndex) {
            switchToClip(clipIndex, startingAt: t)
        } else {
            resume(at: t)
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
        player.setRate(speed)
        sync.setRate(speed)
    }

    private func continueFromStarter() {
        closeStarterBanner()
        resumePlayback()
    }

    /// Adds the tapped starter word to the user's vocab pool. Idempotent.
    /// The player keeps its position so playback resumes from the same
    /// line when the user follows up with "Devam".
    private func addStarterToVocab(pause: StarterPause) {
        if let id = pause.word.starterId {
            appState.markVocabLearned(id)
        }
    }

    /// True when the tapped starter is already in the user's pool, so
    /// the button can switch to a "checked" state.
    private func alreadyLearned(_ pause: StarterPause) -> Bool {
        guard let id = pause.word.starterId else { return false }
        return appState.progress.learnedWords.contains(id)
    }

    private func formatTime(_ t: Double) -> String {
        let s = max(0, Int(t.rounded()))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}

/// Where the in-view cinema cover starts and how far it got. A reference
/// type so the cinema's ~10 Hz ticks don't re-render the portrait screen
/// behind it.
private final class CinemaHandoff {
    var clipIndex = 0
    /// Portrait position when cinema opened.
    var startTime: Double? = nil
    /// Cinema's last reported position; nil until it reports one.
    var time: Double? = nil
}
