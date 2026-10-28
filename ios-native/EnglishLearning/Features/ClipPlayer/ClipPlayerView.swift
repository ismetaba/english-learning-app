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
    /// Replaces "Sahne x / y" under the title (e.g. "Video 3 / 30" in a set).
    let headerSubtitle: String?
    /// Plays each clip without its silent head and tail
    /// (`ClipTiming.playbackWindow(for:trimSilence:)`).
    let trimsSilence: Bool
    /// Offers the one-time "tap the underlined word" hint. Off where the
    /// learner came for one sentence (a word's or a pattern's scene): the
    /// hint would pause the video right on it.
    let showsStarterHint: Bool
    /// In a pattern set: the set's pattern, whose lines are the targets.
    let focusPatternId: String?

    @EnvironmentObject var appState: AppState
    /// Full-sentence Turkish under the current line (and under played lines).
    @AppStorage("player.showSentenceTr") private var showSentenceTr = true

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
    /// The line a jump or loop pinned in the karaoke (`KaraokeSync`), so its
    /// 0.15s lead-in shows that line rather than the previous one. Tracked
    /// until the jump lands, or for as long as the loop runs.
    @State private var pinnedLine: Int? = nil
    /// Scrubber position while the learner drags; the seek happens once,
    /// on release.
    @State private var scrubPreview: Double? = nil
    /// Clips (indices) already reported through `onClipComplete`, and
    /// whether `onFinish` has fired: a replay after the end must not report
    /// (and reward) them again.
    @State private var completedClips: Set<Int> = []
    @State private var didFinish = false
    /// Line showing the one-time "tap the underlined word" hint, and whether
    /// this player has offered it already.
    @State private var hintLine: Int? = nil
    @State private var hintOffered = false
    /// Last time the learner dragged the transcript; auto-follow waits
    /// while it is recent.
    @State private var userScrolledAt: Date? = nil
    /// Bumped to make the transcript scroll back to the current line.
    @State private var followRequest = 0
    /// Height of the controls overlay, which covers the bottom of the panel.
    @State private var controlsHeight: CGFloat = 140

    /// Seeks to a line land this far before it so its first word isn't clipped.
    private static let lineLeadIn = ClipTiming.lineLeadIn
    /// Auto-follow stays off this long after the learner scrolls.
    private static let manualScrollHold: TimeInterval = 4
    /// Less than this left in a clip window counts as its end: nothing to
    /// start or resume there.
    private static let endSlack: Double = 0.25
    /// Target-word (starter) amber: underline, pooled-word tint, hint.
    private static let amber = Color(hex: 0xFFB347)

    private struct SpeedOption {
        let rate: Double
        let title: String
    }

    private static let speedOptions: [SpeedOption] = [
        SpeedOption(rate: 0.5, title: "0.5× Yavaş"),
        SpeedOption(rate: 0.75, title: "0.75× Rahat"),
        SpeedOption(rate: 1.0, title: "1× Normal"),
    ]

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
        headerSubtitle: String? = nil,
        trimsSilence: Bool = false,
        showsStarterHint: Bool = true,
        focusPatternId: String? = nil,
    ) {
        self.focusPatternId = focusPatternId
        let prepared = clips.map { ClipTiming.sanitize($0) }
        self.prepared = prepared
        self.windows = prepared.map { ClipTiming.playbackWindow(for: $0, trimSilence: trimsSilence) }
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
        self.headerSubtitle = headerSubtitle
        self.trimsSilence = trimsSilence
        self.showsStarterHint = showsStarterHint

        let safeIdx = max(0, min(initialClipIndex, max(0, prepared.count - 1)))
        self._index = State(initialValue: safeIdx)
    }

    /// Active line + the starter word the learner tapped, used to render the
    /// banner overlay and feed the add / continue actions.
    struct StarterPause: Equatable {
        let line: ClipLine
        let word: ClipWord
        /// Already in the learner's words when tapped (a word met again),
        /// as opposed to one added from this card.
        var wasPooled = false
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
        .onChange(of: sync.position) { old, new in
            positionChanged(from: old, to: new)
        }
        // One speed for every player: a change made here or in cinema
        // applies at once.
        .onChange(of: appState.playbackRate) { _, rate in
            player.setRate(rate)
            sync.setRate(rate)
        }
        // Pause the portrait player while Cinema is on so we don't
        // double up on audio. Hosts that hoist cinema externally
        // (SetPlayerView) signal via `isPaused`; the in-view cinema
        // cover signals via `showCinema`.
        .onChange(of: isPaused) { _, paused in
            if paused {
                player.pause()
                endStarterHint(markSeen: false)
            }
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
                // Cinema played the video to its end: portrait finishes
                // instead of resuming (and replaying) the last clip. Only
                // with a host to tell, so cinema's skip doesn't offer a
                // "next" there isn't; without one cinema just closes at the
                // end and `resumeFromCinema` finishes from its position.
                onFinish: onFinish != nil ? {
                    cinemaHandoff.finished = true
                    showCinema = false
                } : nil,
                onExit: { showCinema = false },
                onUnplayable: onUnplayable.map { skip -> () -> Void in
                    {
                        cinemaHandoff.time = nil
                        showCinema = false
                        skip()
                    }
                },
                onClipComplete: { finished in
                    creditCinemaClip(finished)
                },
                headerSubtitle: headerSubtitle,
                trimsSilence: trimsSilence,
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

            // Top chrome (back + title + expand) and the time chip — or,
            // while a ready player is slow to start, a chip saying so.
            VStack {
                topChrome
                Spacer()
                if player.isSlowStart && playerErrorMessage == nil {
                    slowStartChip
                        .padding(.bottom, 8)
                        .transition(.opacity)
                } else {
                    timeChip
                        .padding(.bottom, 14)
                        .allowsHitTesting(false)
                }
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
                .accessibilityLabel("Oynat")
                .transition(.opacity)
            }
        }
        .aspectRatio(16.0/9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .background(Color.black)
        .animation(.easeInOut(duration: 0.22), value: isPlaybackActive)
        .animation(.easeInOut(duration: 0.22), value: hasFirstFrame)
        .animation(.easeInOut(duration: 0.22), value: player.isSlowStart)
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
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Geri")
    }

    /// "Video 3 / 30 · 01:12" in a set, "Sahne 2 / 4 · 00:48" for several
    /// scenes, just the length for a single one.
    private var headerSubtitleText: String {
        let length = formatTime(window.duration)
        if let headerSubtitle { return "\(headerSubtitle) · \(length)" }
        if totalClips > 1 { return "Sahne \(index + 1) / \(totalClips) · \(length)" }
        return length
    }

    private var topChrome: some View {
        HStack(alignment: .center, spacing: 6) {
            backButton

            // Title
            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(headerSubtitleText)
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
                // The word card would otherwise still be open (and the clip
                // stalled on it) when portrait resumes.
                closeStarterBanner()
                endStarterHint(markSeen: false)
                if let onCinemaRequest {
                    onCinemaRequest()
                } else {
                    cinemaHandoff.clipIndex = index
                    cinemaHandoff.startTime = sync.time
                    cinemaHandoff.time = nil
                    cinemaHandoff.finished = false
                    showCinema = true
                }
            } label: {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            .accessibilityLabel("Sinema modu")
        }
        // 44 pt hit frames around the 36/34 pt circles: same visual spot.
        .padding(.horizontal, 8)
        .padding(.top, 16)
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

    /// The player is up but the video hasn't started yet (slow network,
    /// slow YouTube). Not an error: it usually starts; the learner may move
    /// on if there is somewhere to go.
    private var slowStartChip: some View {
        HStack(spacing: 10) {
            ProgressView()
                .progressViewStyle(.circular)
                .controlSize(.small)
                .tint(.white)
            Text("Video başlıyor…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
            if let skip = slowStartSkip {
                Button {
                    Haptics.light()
                    skip()
                } label: {
                    Text(skipLabel)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .background(Capsule().fill(Color(hex: 0x080A14, opacity: 0.8)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
    }

    /// Only a real "next": another scene here, or the host's next video.
    private var slowStartSkip: (() -> Void)? {
        guard hasNextClip || onUnplayable != nil else { return nil }
        return skipAction
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
                    .padding(.leading, 8)
                    .padding(.top, 16)
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
            legendRow

            // Transcript stays mounted at all times so the scroll
            // position survives a starter-tap → "Devam" round trip;
            // the banner overlays on top, transcript keeps its anchor.
            ZStack(alignment: .top) {
                transcriptScroll
                    .opacity(starterBanner == nil ? 1 : 0.08)
                    .allowsHitTesting(starterBanner == nil)

                if let banner = starterBanner {
                    // Scrolls when a long line makes the card taller than
                    // the space above the controls.
                    ScrollView(showsIndicators: false) {
                        starterChoice(for: banner)
                            .padding(.horizontal, 20)
                            .padding(.top, 4)
                            .padding(.bottom, controlsHeight + 14)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    .background(Theme.Color.background.opacity(0.85))
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The sentence-translation toggle. The three structure colours are
    /// taught on Kalıplar; a legend over every scene was one more row to read.
    private var legendRow: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 0)
            translationToggle
        }
        .padding(.horizontal, 20)
    }

    private var translationToggle: some View {
        Button {
            Haptics.selection()
            showSentenceTr.toggle()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: showSentenceTr ? "text.bubble.fill" : "text.bubble")
                    .font(.system(size: 11, weight: .bold))
                Text("Çeviri")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(showSentenceTr ? Theme.Color.textPrimary : Theme.Color.textSecondary)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(
                Capsule().fill(showSentenceTr ? Theme.Color.primarySoft : Color(hex: 0x111827))
            )
            .overlay(
                Capsule().strokeBorder(showSentenceTr ? Theme.Color.borderAccent : Theme.Color.border, lineWidth: 1)
            )
            // 44 pt hit target around the 32 pt chip.
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Cümle çevirisi")
        .accessibilityValue(showSentenceTr ? "Açık" : "Kapalı")
    }

    /// Scrollable transcript that fills the remaining screen space. Each line
    /// renders either as a dimmed context line or, when current, as the
    /// "currentLineBlock" with accent rail + karaoke. Scroll position
    /// auto-tracks the current line, keeping the line before it in view at
    /// the top so upcoming lines fill the rest of the panel. Dragging the
    /// transcript pauses the tracking for a few seconds ("Şu ana dön").
    private var transcriptScroll: some View {
        let lines = clip.lines
        let currentLine = sync.position.lineIndex
        let pool = Set(appState.progress.learnedWords)
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
                                    currentLineBlock(line, lineIndex: idx, pool: pool)
                                } else {
                                    contextRow(line, idx: idx, currentLine: currentLine)
                                }
                            }
                            .id("line-\(idx)")
                        }
                        // Bottom padding so the last line can still scroll up
                        // to anchor, clear of the controls.
                        Color.clear.frame(height: max(geo.size.height * 0.45, controlsHeight + 24))
                    }
                    .padding(.horizontal, 20)
                }
                .simultaneousGesture(
                    DragGesture(minimumDistance: 8).onChanged { _ in noteUserScroll() }
                )
                .mask(
                    VStack(spacing: 0) {
                        Rectangle().fill(.black)
                        LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                            .frame(height: 140)
                    }
                )
                .overlay(alignment: .bottomTrailing) {
                    if userScrolledAt != nil {
                        backToNowButton {
                            userScrolledAt = nil
                            followCurrentLine(proxy, animated: true)
                        }
                        .padding(.trailing, 16)
                        .padding(.bottom, controlsHeight + 8)
                        .transition(.opacity)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: userScrolledAt == nil)
                .onChange(of: sync.position.lineIndex) { _, newValue in
                    guard newValue != nil else { return }
                    if let at = userScrolledAt {
                        // The learner is reading elsewhere; don't yank them back.
                        guard Date().timeIntervalSince(at) >= Self.manualScrollHold else { return }
                        userScrolledAt = nil
                    }
                    followCurrentLine(proxy, animated: true)
                }
                .onChange(of: followRequest) { _, _ in
                    followCurrentLine(proxy, animated: true)
                }
                .onChange(of: index) { _, _ in
                    userScrolledAt = nil
                    proxy.scrollTo("transcript-top", anchor: .top)
                }
            }
        }
    }

    /// Puts the line before the current one at the top, so the learner
    /// still sees what was just said.
    private func followCurrentLine(_ proxy: ScrollViewProxy, animated: Bool) {
        guard let i = sync.position.lineIndex else { return }
        let target = i > 0 ? "line-\(i - 1)" : "transcript-top"
        if animated {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                proxy.scrollTo(target, anchor: .top)
            }
        } else {
            proxy.scrollTo(target, anchor: .top)
        }
    }

    /// A drag on the transcript: hold auto-follow. Throttled, since the
    /// gesture reports every frame.
    private func noteUserScroll() {
        let now = Date()
        if let at = userScrolledAt, now.timeIntervalSince(at) < 0.5 { return }
        userScrolledAt = now
    }

    /// Auto-follow on again, scrolled to the current line.
    private func resumeFollowing() {
        userScrolledAt = nil
        followRequest += 1
    }

    private func backToNowButton(action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 11, weight: .bold))
                Text("Şu ana dön")
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(Theme.Color.textPrimary)
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .background(Capsule().fill(Theme.Color.backgroundElevated))
            .overlay(Capsule().strokeBorder(Theme.Color.borderAccent, lineWidth: 1))
            .shadow(color: .black.opacity(0.4), radius: 8, x: 0, y: 3)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
    }

    /// Before the first subtitle line starts.
    private var sceneStartingPlaceholder: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .font(.system(size: 13, weight: .semibold))
            Text("Sahne başlıyor…")
                .font(.system(size: 14, weight: .medium))
        }
        .foregroundStyle(Theme.Color.textMuted)
        .padding(.vertical, 14)
    }

    /// A line other than the current one: plain text that fades with its
    /// distance from the current line, and for lines already played their
    /// Turkish sentence. Colours, word glosses and target marks belong to
    /// the current line only, so the eye has one place to read. Tapping seeks.
    private func contextRow(_ line: ClipLine, idx: Int, currentLine: Int?) -> some View {
        let distance = currentLine.map { abs(idx - $0) } ?? 0
        let isPlayed = currentLine.map { idx < $0 } ?? false
        let opacity = max(0.3, (isPlayed ? 0.6 : 0.8) - Double(distance - 1) * 0.12)
        return Button(action: {
            Haptics.selection()
            jumpToLine(idx)
        }) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.text)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if showSentenceTr, isPlayed, let tr = Self.sentenceTranslation(of: line) {
                    Text(tr)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(Theme.Color.textMuted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(opacity)
            .padding(.vertical, 8)
            .padding(.leading, 17)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable(scale: 0.99))
    }

    /// The line's Turkish sentence; nil when missing or blank.
    private static func sentenceTranslation(of line: ClipLine) -> String? {
        guard let tr = line.translationTr?.trimmingCharacters(in: .whitespacesAndNewlines),
              !tr.isEmpty else { return nil }
        return tr
    }

    /// The line's speaker, unless blank or the data's "Speaker" placeholder.
    private static func speakerName(of line: ClipLine) -> String? {
        let name = line.speaker.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.caseInsensitiveCompare("speaker") != .orderedSame else { return nil }
        return name
    }


    private func currentLineBlock(_ line: ClipLine, lineIndex: Int, pool: Set<String>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if hintLine == lineIndex {
                starterHintCallout
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if let speaker = Self.speakerName(of: line) {
                Text(speaker.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.3)
                    .foregroundStyle(Color(hex: 0x8577FF))
            }

            if let mark = line.markedPattern(focus: focusPatternId, completed: appState.completedPatterns),
               let pattern = PatternCatalog.pattern(id: mark.id) {
                patternChip(pattern, isTarget: mark.isFocus)
            }

            tappableWordsLine(for: line, lineIndex: lineIndex, pool: pool)

            if showSentenceTr, let tr = Self.sentenceTranslation(of: line) {
                Text(tr)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
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

    /// A pattern of the line the learner has learned on Kalıplar, so they
    /// spot it in the scene. In a pattern set, the set's own pattern is the
    /// target and stands out; earlier ones are marked plainly.
    private func patternChip(_ pattern: Pattern, isTarget: Bool) -> some View {
        let color = isTarget ? Theme.Color.accent : PatternSlotKind.verb.color
        return HStack(spacing: 5) {
            Image(systemName: isTarget ? "scope" : "puzzlepiece.fill")
                .font(.system(size: isTarget ? 10 : 9, weight: .bold))
            Text((isTarget ? "Hedef kalıp: " : "Kalıp: ") + pattern.titleTr)
                .font(.system(size: 11, weight: .heavy))
                .lineLimit(1)
        }
        .foregroundStyle(isTarget ? Color.black : color)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Capsule().fill(isTarget ? color : color.opacity(0.14)))
        .overlay(Capsule().strokeBorder(color.opacity(isTarget ? 0 : 0.35), lineWidth: 1))
    }

    /// One-time teaching moment (until the learner has caught a word): the
    /// first line with a target word pauses with this above it.
    private var starterHintCallout: some View {
        Button {
            Haptics.light()
            endStarterHint(markSeen: true)
            resumePlayback()
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "hand.tap.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Self.amber)
                Text("Altı çizili kelimeye dokun → anlamını gör, Ekle ile kelimelerine kat")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Self.amber.opacity(0.12))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Self.amber.opacity(0.5), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable(scale: 0.98))
        .accessibilityHint("Kapatıp devam etmek için dokun")
    }

    /// The current line rendered as wrapping rows of individual word views.
    ///
    /// Each word is coloured by sentence structure (subject blue / aux green
    /// / rest lavender) once spoken; the word being spoken gets the accent
    /// colour and grows slightly; words yet to be spoken are dimmed.
    ///
    /// Starter-set words get an amber underline as a tap affordance; ones
    /// already in the learner's words get a soft amber backdrop instead.
    /// Tapping either pauses the video and surfaces the meaning banner.
    @ViewBuilder
    private func tappableWordsLine(for line: ClipLine, lineIndex: Int, pool: Set<String>) -> some View {
        let subjectIdx = Set(line.structure?.subject ?? [])
        let auxIdx     = Set(line.structure?.auxVerb ?? [])
        let position   = sync.position
        let showsHint  = hintLine == lineIndex

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
                        isPooled: w.starterId.map(pool.contains) ?? false,
                        pulsesUnderline: showsHint,
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
        isPooled: Bool,
        pulsesUnderline: Bool,
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
        // compete: active = COLOR + SCALE, target = UNDERLINE (or, once in
        // the learner's words, an amber backdrop). Past words stay in their
        // structure colour at full opacity (re-readable); upcoming words sit
        // at 55% so the karaoke "wave" of brightness moves left-to-right.
        // Only the English dims: the gloss and the target marks stay legible.
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let wordOpacity: Double = isUpcoming ? 0.55 : 1.0
        let wordScale: CGFloat = isActive ? 1.06 : 1.0

        VStack(alignment: .center, spacing: 1) {
            Text(Self.displayText(for: w.word, bucket: bucketKind, activeColor: textColor))
                .font(.system(size: 20, weight: .bold))
                .opacity(wordOpacity)
                .background {
                    if isStarter && isPooled {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Self.amber.opacity(0.18))
                            .padding(.horizontal, -4)
                            .padding(.vertical, -1)
                    }
                }
                // Target-word marker — the ONLY underline in the current
                // line, so this amber rule unambiguously means "this is a
                // vocab target you can tap to learn".
                .overlay(alignment: .bottom) {
                    if isStarter && !isPooled {
                        if pulsesUnderline {
                            PulsingUnderline(color: Self.amber)
                                .offset(y: 3)
                        } else {
                            Rectangle()
                                .fill(Self.amber)
                                .frame(height: 1.5)
                                .opacity(0.85)
                                .offset(y: 2)
                        }
                    }
                }
                .scaleEffect(wordScale)

            // Word-by-word Turkish gloss. Supporting layer, but readable.
            if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isStarter && isPooled ? Self.amber : Theme.Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .opacity(isUpcoming ? 0.8 : 1)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            guard isStarter else { return }
            Haptics.medium()
            player.pause()
            endStarterHint(markSeen: true)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                starterBanner = StarterPause(line: line, word: w, wasPooled: isPooled)
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
        glossSize: CGFloat = 12,
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
                            .font(.system(size: glossSize, weight: .medium))
                            .foregroundStyle(Theme.Color.textSecondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
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

    // MARK: - Starter-word card

    /// Banner shown when the learner taps a starter word. Shows the word +
    /// (when available) its TR translation and okunuş alongside the
    /// containing line for context, plus the add / continue actions.
    /// Before the word is added "Ekle" is the hero; afterwards "Devam" is,
    /// and a caption says where the word went.
    private func starterChoice(for pause: StarterPause) -> some View {
        let word = Okunus.displayWord(pause.word.word)
        let learned = alreadyLearned(pause)
        let justAdded = learned && !pause.wasPooled

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                if pause.wasPooled {
                    // A word met again: recognise it.
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.Color.textSecondary)
                    Text("KELİMELERİNDE")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.3)
                        .foregroundStyle(Theme.Color.textSecondary)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.Color.accent)
                    Text("YENİ KELİME")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.3)
                        .foregroundStyle(Theme.Color.accent)
                }
            }

            // The starter word + its Turkish translation — the learning unit —
            // and how to say it, in Turkish letters, when we know.
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(word)
                        .font(.system(size: 32, weight: .heavy))
                        .foregroundStyle(Theme.Color.textPrimary)
                    if let tr = pause.word.starterTr, !tr.isEmpty {
                        Text(tr)
                            .font(.system(size: 18, weight: .semibold))
                            .italic()
                            .foregroundStyle(Self.amber)
                            .lineLimit(2)
                    }
                }
                if let okunus = Okunus.reading(for: word, learning: appState.learningLanguage) {
                    Text(okunus)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.Color.textMuted)
                        .accessibilityLabel("Okunuşu: \(okunus)")
                }
            }
            .padding(.top, 2)

            // The line for context — same word-by-word rendering as the
            // current row (structure colours + per-word Turkish gloss),
            // just smaller and without karaoke / tap.
            staticTranslatedLine(for: pause.line, fontSize: 16, glossSize: 12)

            if let tr = Self.sentenceTranslation(of: pause.line) {
                Text("Bu cümlede: \(tr)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Button {
                    // Once only: no second "success" for a word already in.
                    guard !alreadyLearned(pause) else { return }
                    Haptics.success()
                    addStarterToVocab(pause: pause)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: learned ? "checkmark" : "plus")
                            .font(.system(size: 12, weight: .heavy))
                        Text(learned ? "Eklendi" : "Ekle")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(learned ? Theme.Color.textSecondary : Theme.Color.background)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(learned ? Theme.Color.backgroundElevated : Self.amber)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(learned ? Theme.Color.border : Color.clear, lineWidth: 1)
                    )
                    .shadow(color: learned ? Color.clear : Self.amber.opacity(0.35), radius: 10, x: 0, y: 4)
                }
                .buttonStyle(.pressable)
                .accessibilityLabel(learned ? "Kelimelerinde" : "Kelimelerine ekle")

                Button {
                    Haptics.medium()
                    continueFromStarter()
                } label: {
                    HStack(spacing: 6) {
                        Text("Devam")
                            .font(.system(size: 14, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(learned ? Color.white : Theme.Color.textPrimary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(learned ? Theme.Color.primary : Theme.Color.backgroundElevated)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(learned ? Color.clear : Theme.Color.border, lineWidth: 1)
                    )
                    .shadow(color: learned ? Theme.Color.primaryGlow : Color.clear, radius: 10, x: 0, y: 4)
                }
                .buttonStyle(.pressable)
            }
            .animation(.easeInOut(duration: 0.2), value: learned)

            if justAdded {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.success)
                    Text("“\(word)” kelimelerine eklendi")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                .transition(.opacity)
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
        .animation(.easeInOut(duration: 0.2), value: justAdded)
    }

    // MARK: - Controls (absolute bottom)

    private var controls: some View {
        VStack(spacing: 6) {
            transportRow
            chipRow
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 20)
        .background(
            ZStack {
                // Swallows taps between and around the controls: the
                // transcript rows underneath would otherwise seek on them.
                Color.black.opacity(0.001)
                LinearGradient(
                    colors: [.clear, Color(hex: 0x080A14, opacity: 0.9), Color(hex: 0x080A14)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .allowsHitTesting(false)
            }
        )
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { controlsHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, height in controlsHeight = height }
            }
        )
    }

    private var transportRow: some View {
        // 44 pt hit frames around the 38 pt side buttons; spacing keeps
        // the visual gaps.
        HStack(spacing: 7) {
            // Prev line (small)
            smallTransport(icon: "chevron.backward.2", label: "Önceki cümle") {
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
            .accessibilityLabel(isPlaybackActive ? "Duraklat" : "Oynat")
            // Next line
            smallTransport(icon: "chevron.forward.2", label: "Sonraki cümle") {
                seekLine(offset: 1)
            }
            // Scrubber
            scrubber
                .padding(.leading, 6)
        }
    }

    private func smallTransport(icon: String, label: String, action: @escaping () -> Void) -> some View {
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
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(label)
    }

    /// Shows the ~4 Hz playhead within the clip window. Dragging only moves
    /// a local preview; the player seeks once, on release. A 4 pt track in
    /// a 44 pt-tall touch area.
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
                        .frame(width: 14, height: 14)
                        .overlay(Circle().strokeBorder(Color(hex: 0x8577FF, opacity: 0.5), lineWidth: 3))
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                        .offset(x: max(0, geo.size.width * fraction) - 7)
                }
                .frame(height: 44)
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
            .frame(height: 44)
            Text(formatTime(total))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.textMuted)
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
            speedMenu
            Spacer()
        }
    }

    /// "Hız 0.75×" — one rate for every player (`AppState.playbackRate`).
    /// Neutral styling: a slower speed is a choice, not an "on" mode.
    private var speedMenu: some View {
        Menu {
            ForEach(Self.speedOptions, id: \.rate) { option in
                Button {
                    Haptics.selection()
                    appState.playbackRate = option.rate
                } label: {
                    if option.rate == appState.playbackRate {
                        Label(option.title, systemImage: "checkmark")
                    } else {
                        Text(option.title)
                    }
                }
            }
        } label: {
            chipFace(icon: "speedometer", label: "Hız \(Self.rateLabel(appState.playbackRate))", active: false)
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Oynatma hızı")
        .accessibilityValue(Self.rateLabel(appState.playbackRate))
    }

    /// %g uses the shortest representation: 0.5 → "0.5×", 0.75 → "0.75×",
    /// 1.0 → "1×" (no trailing ".00").
    private static func rateLabel(_ rate: Double) -> String {
        String(format: "%g×", rate)
    }

    private func chip(icon: String?, label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            chipFace(icon: icon, label: label, active: active)
        }
        .buttonStyle(.pressable)
    }

    /// A 36 pt capsule inside a 44 pt-tall hit area.
    private func chipFace(icon: String?, label: String, active: Bool) -> some View {
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
        .frame(minHeight: 36)
        .background(
            Capsule().fill(active ? Color(hex: 0x8577FF) : Color(hex: 0x111827))
        )
        .overlay(
            Capsule().strokeBorder(active ? Color(hex: 0x8577FF) : Color(hex: 0x1E2A42), lineWidth: 1)
        )
        .padding(.vertical, 4)
        .contentShape(Rectangle())
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
        player.setRate(appState.playbackRate)
        sync.setRate(appState.playbackRate)
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
        // A plain jump also drops any pinned line.
        pinnedLine = nil
        sync.jump(to: start)
    }

    /// `time` when it lies in (or just before) the window with something
    /// left to play, else the window's start. A little slack below: a vocab
    /// sentence's lead-in can sit a hair before the window (`ScenePlan`).
    private static func startTime(_ time: Double?, in window: PlaybackWindow) -> Double {
        guard let time, time.isFinite, time >= max(0, window.start - 1), time < window.end - endSlack else {
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
        case .looped(let t):
            // The page only wraps while playing: a playing tick at the
            // window start.
            markFirstFrame()
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

    /// The karaoke moved (a new word or line, or a jump).
    private func positionChanged(from old: SyncPosition, to new: SyncPosition) {
        // Playback reaching a new line by itself; a jump or loop pins its line.
        let reachedLine = new.lineIndex != old.lineIndex && pinnedLine == nil
        if !isLooping, let pin = pinnedLine, !Self.isLeadIn(new, of: pin) {
            // The jump has landed. The karaoke lets its pin go by itself.
            pinnedLine = nil
        }
        if reachedLine { offerStarterHint(at: new.lineIndex) }
    }

    /// Line `line` is on screen but its first word hasn't started.
    private static func isLeadIn(_ position: SyncPosition, of line: Int) -> Bool {
        position.lineIndex == line && position.progress == .notStarted
    }

    private func clearPin() {
        guard pinnedLine != nil else { return }
        pinnedLine = nil
        sync.setPinnedLine(nil)
    }

    /// Until the learner has caught a first word, the first line with a
    /// target word pauses once and says what to do with it.
    private func offerStarterHint(at lineIndex: Int?) {
        guard showsStarterHint, let lineIndex, !hintOffered, !appState.hasCaughtFirstWord,
              starterBanner == nil, !isPaused, !showCinema, !isLooping,
              player.state == .playing,
              clip.lines.indices.contains(lineIndex),
              clip.lines[lineIndex].words.contains(where: { $0.starterId != nil })
        else { return }
        hintOffered = true
        player.pause()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            hintLine = lineIndex
        }
        // The learner may have scrolled the transcript away: bring the
        // hinted line back, or the video stops for no visible reason.
        resumeFollowing()
    }

    /// Hides the first-word hint. `markSeen` when the learner acted on it
    /// (tapped it, the word, or play), so it doesn't come back.
    private func endStarterHint(markSeen: Bool) {
        guard hintLine != nil else { return }
        withAnimation(.easeOut(duration: 0.2)) { hintLine = nil }
        if markSeen { appState.markFirstWordCaught() }
    }

    /// The page reached the end of the clip window (never fires while a
    /// line loops).
    private func clipDidEnd() {
        clearPin()
        guard starterBanner == nil else {
            // The learner is reading the word card; move on when they
            // tap "Devam".
            advancePending = true
            return
        }
        advance()
    }

    /// Natural end of the current clip: next clip, or the end of the video.
    /// Each clip is reported once, and the video's end once: replaying a
    /// finished clip doesn't report (and reward) it again.
    private func advance() {
        advancePending = false
        creditClip(at: index)
        if hasNextClip {
            Haptics.medium()
            switchToClip(index + 1, startingAt: nil)
        } else if !didFinish {
            Haptics.success()
            reportFinish()
        }
    }

    private func creditClip(at clipIndex: Int) {
        guard prepared.indices.contains(clipIndex), completedClips.insert(clipIndex).inserted else { return }
        onClipComplete?(prepared[clipIndex])
    }

    /// A clip the internal cinema played to its end.
    private func creditCinemaClip(_ finished: LessonClip) {
        let clipIndex = prepared.firstIndex { $0.id == finished.id } ?? cinemaHandoff.clipIndex
        creditClip(at: clipIndex)
    }

    private func reportFinish() {
        guard !didFinish else { return }
        didFinish = true
        onFinish?()
    }

    private func switchToClip(_ newIndex: Int, startingAt time: Double?, autoplay: Bool? = nil) {
        guard prepared.indices.contains(newIndex) else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            index = newIndex
            starterBanner = nil
            hintLine = nil
        }
        advancePending = false
        isLooping = false
        scrubPreview = nil
        userScrolledAt = nil
        load(clipAt: newIndex, startingAt: time, autoplay: autoplay ?? !isPaused)
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
            endStarterHint(markSeen: true)
            resumePlayback()
        }
    }

    /// Play, or — when the clip ended while the word card was open — move on
    /// (unless that was a replay of a video already finished: play again).
    private func resumePlayback() {
        if advancePending, hasNextClip || !didFinish {
            advance()
        } else {
            advancePending = false
            player.play()
        }
    }

    private func closeStarterBanner() {
        guard starterBanner != nil else { return }
        withAnimation(.easeOut(duration: 0.2)) { starterBanner = nil }
    }

    /// `pinning` keeps that line on the karaoke through the lead-in before
    /// its first word (`lineLeadIn`), instead of the line before it.
    private func seek(to t: Double, play: Bool, pinning line: Int? = nil) {
        player.seek(to: t)
        if play { player.play() }
        pinnedLine = line
        if let line {
            sync.jump(to: t, pinning: line)
        } else {
            sync.jump(to: t)
        }
    }

    /// Plays line `i` from its start. A running loop moves to that line.
    private func jumpToLine(_ i: Int) {
        let lines = clip.lines
        guard lines.indices.contains(i) else { return }
        let start = max(0, lines[i].startTime - Self.lineLeadIn)
        if isLooping, let loop = ClipTiming.loopWindow(forLine: i, in: lines) {
            player.setBounds(start: loop.start, end: loop.end, loop: true)
        }
        closeStarterBanner()
        endStarterHint(markSeen: false)
        advancePending = false
        seek(to: start, play: true, pinning: i)
        resumeFollowing()
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
        } else if let i = sync.position.lineIndex, let loop = ClipTiming.loopWindow(forLine: i, in: clip.lines) {
            let start = loop.start
            isLooping = true
            player.setBounds(start: start, end: loop.end, loop: true)
            closeStarterBanner()
            endStarterHint(markSeen: false)
            advancePending = false
            seek(to: start, play: true, pinning: i)
        }
    }

    /// Back to playing the whole clip window.
    private func stopLooping() {
        guard isLooping else { return }
        isLooping = false
        player.setBounds(start: window.start, end: window.end, loop: false)
        // The loop's pin, unless its line is still in the lead-in (it lets
        // go by itself once past).
        if let pin = pinnedLine, !Self.isLeadIn(sync.position, of: pin) {
            clearPin()
        }
    }

    private func scrub(to t: Double) {
        // Scrubbing leaves the looped line.
        stopLooping()
        advancePending = false
        endStarterHint(markSeen: false)
        seek(to: t, play: false)
    }

    /// Parent-requested resume (portrait after cinema). Whatever the
    /// learner left open in portrait (word card, hint) is stale by now.
    private func resume(at t: Double) {
        stopLooping()
        closeStarterBanner()
        endStarterHint(markSeen: false)
        advancePending = false
        seek(to: t, play: !isPaused)
    }

    /// The internal cinema cover closed: carry on from where it got to — or,
    /// when cinema played the video to its end, finish.
    private func resumeFromCinema() {
        if cinemaHandoff.finished {
            cinemaHandoff.finished = false
            cinemaHandoff.time = nil
            finishAfterCinema()
            return
        }
        guard let t = cinemaHandoff.time else { return }
        let clipIndex = cinemaHandoff.clipIndex
        cinemaHandoff.time = nil
        if clipIndex == prepared.indices.last, t >= windows[clipIndex].end - Self.endSlack {
            // Cinema reached the end with no host `onFinish` to hand it to,
            // and just closed. Resuming there would replay the clip if
            // portrait had already ended it before cinema.
            finishAfterCinema()
        } else if clipIndex != index, prepared.indices.contains(clipIndex) {
            switchToClip(clipIndex, startingAt: t)
        } else {
            resume(at: t)
        }
    }

    /// Cinema finished the video. Portrait shows its last scene from the
    /// top, paused (nothing replays, and not the line it was on before
    /// cinema), and the host hears the end once. Cinema already reported
    /// the clips it completed.
    private func finishAfterCinema() {
        if let last = prepared.indices.last {
            switchToClip(last, startingAt: nil, autoplay: false)
        }
        reportFinish()
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
    /// Cinema played the last clip to its end (or skipped past it).
    var finished = false
}

/// The target-word underline while the first-word hint points at it.
private struct PulsingUnderline: View {
    let color: Color
    @State private var bright = false

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 3)
            .opacity(bright ? 1 : 0.35)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                    bright = true
                }
            }
    }
}
