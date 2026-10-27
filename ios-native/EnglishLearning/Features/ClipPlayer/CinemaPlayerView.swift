import Combine
import SwiftUI

/// Landscape "cinema mode" player. Full-bleed video; karaoke subtitle
/// strip docks on the bottom of the screen with the same 3-color
/// sentence-structure rendering and per-word Turkish gloss as the
/// portrait clip player, plus the whole sentence in Turkish. While the
/// video plays the top chrome hides after a few seconds of idle so the
/// frame fills the device; paused, the chrome stays and a centred ▶
/// says so. Tapping the video toggles pause/play and brings the chrome
/// back.
///
/// Owns its own `YouTubePlayerController` + `KaraokeSync`, like
/// `ClipPlayerView`: the page ends each clip window itself (`clipEnded`)
/// and the karaoke follows every player event. Plays at the learner's
/// one speed (`AppState.playbackRate`).
struct CinemaPlayerView: View {
    /// Sanitized once (`ClipTiming.sanitize`).
    private let clips: [LessonClip]
    /// `ClipTiming.playbackWindow` of each clip (trimmed per `trimsSilence`).
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
    /// Fires once when the LAST clip in `clips` plays to its end — the
    /// cinema-mode equivalent of ClipPlayerView.onFinish. Parents
    /// use this to advance to the next video while keeping cinema on
    /// screen. If nil, cinema falls back to dismissing itself.
    let onFinish: (() -> Void)?
    let onExit: (() -> Void)?
    /// Skip for a video that can't play when there is no further clip
    /// here; falls back to `onFinish`, then to leaving cinema. Setting it
    /// also enables the error overlay's auto-skip countdown.
    let onUnplayable: (() -> Void)?
    /// Fires once per clip played to its end here (never for a skipped
    /// one), so scenes watched in cinema count like portrait ones.
    let onClipComplete: ((LessonClip) -> Void)?
    /// Replaces "Sahne x / y" under the title (e.g. "Video 3 / 30" in a set).
    let headerSubtitle: String?
    /// Plays each clip without its silent head and tail
    /// (`ClipTiming.playbackWindow(for:trimSilence:)`).
    let trimsSilence: Bool

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    /// Portrait's "Çeviri" choice: the full Turkish sentence under the line.
    @AppStorage("player.showSentenceTr") private var showSentenceTr = true

    @StateObject private var player = YouTubePlayerController()
    @StateObject private var sync = KaraokeSync()
    /// Player events re-delivered through SwiftUI (`onReceive`) so they are
    /// handled with this view's current properties.
    @State private var playerEvents = PassthroughSubject<PlayerEvent, Never>()

    @State private var index: Int
    @State private var didStart = false
    @State private var hasFirstFrame = false
    @State private var chromeHidden = false
    /// All Turkish in the strip (word glosses and the sentence).
    @State private var showTranslations = true
    @State private var hideChromeWorkItem: DispatchWorkItem? = nil
    /// The centred ▶: the video has been paused for a moment (debounced, so
    /// a clip change or a buffering blip doesn't flash it).
    @State private var showsPausedCue = false
    /// Clips (indices) already reported through `onClipComplete`, and
    /// whether `onFinish` has fired: a replay must not report them again.
    @State private var completedClips: Set<Int> = []
    @State private var didFinish = false
    /// Cinema is handing back to portrait: whatever this player still
    /// reports (a last tick, a clip ending under the dismiss animation)
    /// belongs to no one.
    @State private var isExiting = false

    init(
        clips: [LessonClip],
        initialTime: Double? = nil,
        initialClipIndex: Int = 0,
        onTick: ((Int, Double) -> Void)? = nil,
        onFinish: (() -> Void)? = nil,
        onExit: (() -> Void)? = nil,
        onUnplayable: (() -> Void)? = nil,
        onClipComplete: ((LessonClip) -> Void)? = nil,
        headerSubtitle: String? = nil,
        trimsSilence: Bool = false,
    ) {
        let prepared = clips.map { ClipTiming.sanitize($0) }
        self.clips = prepared
        self.windows = prepared.map { ClipTiming.playbackWindow(for: $0, trimSilence: trimsSilence) }
        self.initialTime = initialTime
        self.initialClipIndex = initialClipIndex
        self.onTick = onTick
        self.onFinish = onFinish
        self.onExit = onExit
        self.onUnplayable = onUnplayable
        self.onClipComplete = onClipComplete
        self.headerSubtitle = headerSubtitle
        self.trimsSilence = trimsSilence

        let safeIdx = max(0, min(initialClipIndex, max(0, prepared.count - 1)))
        self._index = State(initialValue: safeIdx)
    }

    private struct SpeedOption {
        let rate: Double
        let title: String
    }

    /// Same choices as portrait's "Hız" menu.
    private static let speedOptions: [SpeedOption] = [
        SpeedOption(rate: 0.5, title: "0.5× Yavaş"),
        SpeedOption(rate: 0.75, title: "0.75× Rahat"),
        SpeedOption(rate: 1.0, title: "1× Normal"),
    ]

    private static let emptyClip = LessonClip(id: -1, youtubeVideoId: "", movieTitle: "",
                                              startTime: 0, endTime: 0, lines: [])

    private var clip: LessonClip {
        clips.indices.contains(index) ? clips[index] : Self.emptyClip
    }

    private var window: PlaybackWindow {
        windows.indices.contains(index) ? windows[index] : PlaybackWindow(start: 0, end: 0)
    }

    private var hasNextClip: Bool { index < clips.count - 1 }

    private var isPlaybackActive: Bool {
        player.state == .playing || player.state == .buffering
    }

    /// Stopped where the learner can resume it: paused (by them or by the
    /// system) or cued without autoplay. Not while loading, at the end, or
    /// on the way out.
    private var wantsPausedCue: Bool {
        hasFirstFrame
            && (player.state == .paused || player.state == .cued)
            && playerErrorMessage == nil
            && !player.isSlowStart
            && !didFinish
            && !isExiting
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

            // Tap target — brings hidden chrome back, else play/pause
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if chromeHidden {
                        Haptics.light()
                        revealChrome()
                    } else if canTogglePlayback {
                        Haptics.light()
                        togglePlayback()
                    }
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

            // Above the strip: a long line with its translation can reach
            // the middle of a landscape screen.
            if playerErrorMessage == nil {
                VStack(spacing: 18) {
                    if !hasFirstFrame {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .controlSize(.large)
                            .tint(.white)
                            .allowsHitTesting(false)
                            .transition(.opacity)
                    }
                    // A ready player slow to start: say so, don't fail.
                    if player.isSlowStart {
                        slowStartChip
                            .transition(.opacity)
                    }
                }
            }

            if showsPausedCue {
                pausedPlayButton
                    .transition(.opacity)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .animation(.easeInOut(duration: 0.2), value: player.errorCode)
        .animation(.easeInOut(duration: 0.22), value: hasFirstFrame)
        .animation(.easeInOut(duration: 0.22), value: showsPausedCue)
        .animation(.easeInOut(duration: 0.22), value: player.isSlowStart)
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
            cancelChromeHide()
        }
        .onReceive(playerEvents) { event in
            handle(event)
        }
        // The chrome hides only while the video plays.
        .onChange(of: player.state) { _, state in
            if state == .playing {
                scheduleChromeHide()
            } else {
                cancelChromeHide()
            }
        }
        .task(id: wantsPausedCue) {
            await updatePausedCue()
        }
        // Paused, or waiting on a slow start: the way out (and the speed,
        // the translations) must be in sight.
        .onChange(of: showsPausedCue) { _, paused in
            if paused { revealChrome() }
        }
        .onChange(of: player.isSlowStart) { _, slow in
            if slow { revealChrome() }
        }
        // One speed for every player: a change made here or in portrait
        // applies at once.
        .onChange(of: appState.playbackRate) { _, rate in
            player.setRate(rate)
            sync.setRate(rate)
        }
    }

    // MARK: - Centre controls

    /// Shown while paused — the same button as portrait's.
    private var pausedPlayButton: some View {
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
            if let skip = slowStartSkip {
                Button {
                    Haptics.light()
                    skip()
                } label: {
                    Text(skipLabel)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.Color.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 40)
        .background(Capsule().fill(Color.black.opacity(0.75)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
    }

    /// Only a real "next": another scene here, or the host's next video.
    private var slowStartSkip: (() -> Void)? {
        if hasNextClip { return { switchToClip(index + 1) } }
        if let onUnplayable { return { pauseThen(onUnplayable) } }
        return nil
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

    /// "Video 3 / 30 · 01:12" in a set, "Sahne 2 / 4 · 00:48" for several
    /// scenes, just the length for a single one — as in portrait.
    private var headerSubtitleText: String {
        let length = Self.formatTime(window.duration)
        if let headerSubtitle { return "\(headerSubtitle) · \(length)" }
        if clips.count > 1 { return "Sahne \(index + 1) / \(clips.count) · \(length)" }
        return length
    }

    // 38 pt circles inside 44 pt hit frames.
    private var topChrome: some View {
        HStack(alignment: .center, spacing: 10) {
            // The one way back to portrait.
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
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            .accessibilityLabel("Sinema modundan çık")

            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(headerSubtitleText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            speedMenu

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
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            .accessibilityLabel("Türkçe çeviri")
            .accessibilityValue(showTranslations ? "Açık" : "Kapalı")
        }
        .padding(.horizontal, 19)
        .padding(.top, 9)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.55), .clear],
                startPoint: .top,
                endPoint: .bottom,
            )
            .ignoresSafeArea(edges: .top),
        )
    }

    /// "Hız 0.75×" — one rate for every player (`AppState.playbackRate`).
    private var speedMenu: some View {
        Menu {
            ForEach(Self.speedOptions, id: \.rate) { option in
                Button {
                    Haptics.selection()
                    appState.playbackRate = option.rate
                    scheduleChromeHide()
                } label: {
                    if option.rate == appState.playbackRate {
                        Label(option.title, systemImage: "checkmark")
                    } else {
                        Text(option.title)
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "speedometer")
                    .font(.system(size: 13, weight: .heavy))
                Text("Hız \(Self.rateLabel(appState.playbackRate))")
                    .font(.system(size: 13, weight: .heavy))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(height: 38)
            .background(Capsule().fill(Color.black.opacity(0.55)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Oynatma hızı")
        .accessibilityValue(Self.rateLabel(appState.playbackRate))
    }

    /// %g uses the shortest representation: 0.5 → "0.5×", 0.75 → "0.75×",
    /// 1.0 → "1×".
    private static func rateLabel(_ rate: Double) -> String {
        String(format: "%g×", rate)
    }

    private static func formatTime(_ t: Double) -> String {
        let s = max(0, Int(t.rounded()))
        return String(format: "%02d:%02d", s / 60, s % 60)
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
                // The glosses alone often don't add up to the meaning
                // ("there is" → "orada -dir"); the sentence does.
                if showTranslations, showSentenceTr, let tr = Self.sentenceTranslation(of: line) {
                    Text(tr)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .shadow(color: .black.opacity(0.95), radius: 10, x: 0, y: 1)
                        .shadow(color: .black.opacity(0.8), radius: 3, x: 0, y: 1)
                }
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

    /// The line's Turkish sentence; nil when missing or blank.
    private static func sentenceTranslation(of line: ClipLine) -> String? {
        guard let tr = line.translationTr?.trimmingCharacters(in: .whitespacesAndNewlines),
              !tr.isEmpty else { return nil }
        return tr
    }

    // MARK: - Error overlay actions

    private var retryAction: (() -> Void)? {
        guard !clips.isEmpty else { return nil }
        return {
            hasFirstFrame = false
            player.retry()
        }
    }

    /// Skipping credits nothing: `onClipComplete` is for clips played out.
    private var skipAction: (() -> Void)? {
        if hasNextClip { return { switchToClip(index + 1) } }
        if let onUnplayable { return { pauseThen(onUnplayable) } }
        if onFinish != nil { return { finish() } }
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
        // Before the first load, so the page is built at this rate.
        player.setRate(appState.playbackRate)
        sync.setRate(appState.playbackRate)
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
        // Handed back: the host already has the position, and a clip ending
        // under the dismiss animation must not advance or finish anything.
        guard !isExiting else { return }
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
            creditClip(at: index)
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

    /// Natural end of the current clip: next clip, or the end of the video.
    private func next() {
        if hasNextClip {
            Haptics.medium()
            switchToClip(index + 1)
        } else {
            if !didFinish { Haptics.success() }
            finish()
        }
    }

    /// Each clip is reported once: replaying a finished clip doesn't
    /// report (and reward) it again.
    private func creditClip(at clipIndex: Int) {
        guard clips.indices.contains(clipIndex), completedClips.insert(clipIndex).inserted else { return }
        onClipComplete?(clips[clipIndex])
    }

    /// The video is over; the host hears it once.
    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        // Hand off to the parent so it can advance to the next video
        // (in the SetPlayerView flow). Falling back to exit keeps the
        // standalone cinema use cases working unchanged.
        if let onFinish {
            onFinish()
        } else {
            exitCinema()
        }
    }

    /// Stops this player before the host takes over. Left running, it plays
    /// on under the dismiss animation while portrait resumes the same line
    /// at its own rate: the dialogue twice, out of sync.
    private func pauseThen(_ handOff: () -> Void) {
        player.pause()
        handOff()
    }

    private func exitCinema() {
        guard !isExiting else { return }
        isExiting = true
        pauseThen {
            if let onExit { onExit() } else { dismiss() }
        }
    }

    /// There is something to play or pause: not while loading, behind an
    /// error, past the end or on the way out.
    private var canTogglePlayback: Bool {
        hasFirstFrame && playerErrorMessage == nil && !didFinish && !isExiting
    }

    private func togglePlayback() {
        guard canTogglePlayback else { return }
        if isPlaybackActive {
            player.pause()
        } else {
            player.play()
        }
    }

    /// Debounced ▶: shows once the video has stayed paused for a moment.
    private func updatePausedCue() async {
        guard wantsPausedCue else {
            if showsPausedCue { showsPausedCue = false }
            return
        }
        try? await Task.sleep(nanoseconds: 300_000_000)
        guard !Task.isCancelled else { return }
        showsPausedCue = true
    }

    private func revealChrome() {
        withAnimation(.easeInOut(duration: 0.25)) {
            chromeHidden = false
        }
        scheduleChromeHide()
    }

    /// Hides the chrome after a few idle seconds — only while the video
    /// plays. Paused or loading, the way out stays visible; a change of
    /// `player.state` reschedules or cancels this.
    private func scheduleChromeHide() {
        cancelChromeHide()
        guard player.state == .playing else { return }
        let work = DispatchWorkItem {
            withAnimation(.easeInOut(duration: 0.35)) {
                chromeHidden = true
            }
        }
        hideChromeWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: work)
    }

    private func cancelChromeHide() {
        hideChromeWorkItem?.cancel()
        hideChromeWorkItem = nil
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
        // The only dim on an upcoming word (the gloss isn't dimmed again):
        // still readable over video, on a projector.
        let opacity: Double = isUpcoming ? 0.72 : 1.0
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
                    .foregroundStyle(Color(hex: 0x9CABCC))
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
