import SwiftUI

// MARK: - Set detail (videos in order)

struct SetDetailView: View {
    let set: VideoSet

    @EnvironmentObject var appState: AppState
    @State private var startIndex: Int? = nil

    var body: some View {
        ZStack {
            BackgroundAmbience()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    hero
                    videoList
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
        }
        .navigationBarBackButtonHidden(false)
        // The back button shows only its chevron, not the system's
        // English "Back".
        .toolbarRole(.editor)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(set.displayTitle)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(1)
            }
        }
        .navigationDestination(item: $startIndex) { idx in
            SetPlayerView(set: set, startAtIndex: idx)
                .environmentObject(appState)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .bottomLeading) {
                ThumbnailMosaic(videos: set.mosaicVideos)
                    .aspectRatio(16.0 / 8.5, contentMode: .fit)
                LinearGradient(
                    colors: [.clear, .black.opacity(0.85)],
                    startPoint: .center,
                    endPoint: .bottom,
                )
                HStack(spacing: 8) {
                    Text(difficultyLabel)
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(difficultyTint)
                    Text("·").foregroundStyle(.white.opacity(0.5))
                    Text("\(set.videos.count) VİDEO")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 12)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Text(set.displayTitle)
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
                .lineLimit(3)
                .multilineTextAlignment(.leading)

            if let desc = set.displayDescription, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 8) {
                MetaPill(icon: "film.stack", label: "\(set.videos.count) video")
                MetaPill(icon: "character.book.closed", label: "\(set.distinctStarterWordCount) kelime")
                WatchProgressPill(watched: watchedCount, total: set.videos.count)
            }

            // Primary call-to-action — starts the set, picks up at the
            // first unwatched video, or starts over once all are watched.
            Button(action: {
                Haptics.success()
                startIndex = primaryAction.startIndex
            }) {
                HStack(spacing: 10) {
                    Image(systemName: primaryAction.icon)
                        .font(.system(size: 14, weight: .heavy))
                    Text(primaryAction.title)
                        .font(.system(size: 16, weight: .heavy))
                }
                // Dark ink on the bright accent reads; white doesn't.
                .foregroundStyle(Theme.Color.onAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(
                        colors: [Theme.Color.accent, Theme.Color.accent.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing,
                    ),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous),
                )
                .shadow(color: Theme.Color.accent.opacity(0.45), radius: 14, x: 0, y: 6)
            }
            .buttonStyle(.pressable(scale: 0.97))
            .padding(.top, 6)
        }
    }

    private var videoList: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("VİDEOLAR")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(2)
                    .foregroundStyle(Theme.Color.accent)
                Rectangle()
                    .fill(Theme.Color.border)
                    .frame(height: 1)
            }
            .padding(.bottom, 4)

            ForEach(Array(set.videos.enumerated()), id: \.element.id) { i, v in
                SetVideoRow(
                    video: v,
                    position: i + 1,
                    isWatched: appState.isVideoWatched(v.id),
                    onTap: {
                        Haptics.medium()
                        startIndex = i
                    },
                )
            }
        }
    }

    private var watchedCount: Int {
        self.set.videos.filter { appState.isVideoWatched($0.id) }.count
    }

    /// The hero button: start, continue at the first unwatched video, or
    /// rewatch from the top.
    private var primaryAction: (title: String, icon: String, startIndex: Int) {
        let total = self.set.videos.count
        let watched = watchedCount
        if watched == 0 {
            return ("Sete başla", "play.fill", 0)
        }
        if let next = self.set.videos.firstIndex(where: { !appState.isVideoWatched($0.id) }) {
            return ("Devam et · \(watched)/\(total)", "play.fill", next)
        }
        return ("Baştan izle", "arrow.counterclockwise", 0)
    }

    private var difficultyLabel: String {
        switch set.difficulty {
        case "beginner":     return "BAŞLANGIÇ"
        case "elementary":   return "TEMEL"
        case "intermediate": return "ORTA"
        case "advanced":     return "İLERİ"
        case "pattern":      return "KALIP"
        default:             return "POC"
        }
    }

    private var difficultyTint: Color {
        switch set.difficulty {
        case "beginner":     return Theme.Color.success
        case "elementary":   return Theme.Color.primary
        case "intermediate": return Theme.Color.warning
        case "advanced":     return Theme.Color.error
        default:             return Theme.Color.accent
        }
    }
}

// MARK: - Thumbnail mosaic

struct ThumbnailMosaic: View {
    let videos: [PocVideo]

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(videos) { v in
                    // Narrow tiles: the still's letterbox bars are cropped.
                    RemoteThumbnail(youtubeVideoId: v.youtubeVideoId)
                        .frame(width: geo.size.width / CGFloat(max(videos.count, 1)), height: geo.size.height)
                        .clipped()
                }
            }
            .background(Theme.Color.backgroundCard)
        }
    }
}

// MARK: - Video row in detail list

private struct SetVideoRow: View {
    let video: PocVideo
    let position: Int
    let isWatched: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(isWatched ? Theme.Color.accent.opacity(0.18) : Theme.Color.backgroundSurface)
                        .overlay(
                            Circle().strokeBorder(
                                isWatched ? Theme.Color.accent.opacity(0.6) : Theme.Color.border,
                                lineWidth: 1,
                            ),
                        )
                        .frame(width: 32, height: 32)
                    if isWatched {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(Theme.Color.accent)
                    } else {
                        Text(String(format: "%02d", position))
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.Color.textSecondary)
                    }
                }

                RemoteThumbnail(youtubeVideoId: video.youtubeVideoId)
                    .frame(width: 96, height: 54)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(video.movieTitle.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.textMuted)
                        .lineLimit(1)
                    Text(cleanedTitle(video.title))
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let n = video.targetLines, n > 0 {
                        Label("\(n) hedef cümle", systemImage: "scope")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(Theme.Color.accent)
                    }
                }

                Spacer(minLength: 4)

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent.opacity(0.85))
                    .padding(.trailing, 4)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.Color.backgroundCard),
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.5), lineWidth: 1),
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private func cleanedTitle(_ raw: String) -> String {
        var t = raw
        if let sep = t.range(of: " | ") { t = String(t[..<sep.lowerBound]) }
        t = t.replacingOccurrences(of: #"\(\d{4}\)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s*Scene\s*\(\d+/\d+\)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: " -"))
        return t
    }
}

// MARK: - Set player (auto-advances through videos with polished transitions)

/// Plays the videos of a set back-to-back. Between videos a transition
/// overlay slides in (set progress + just-finished badge + the words caught
/// in it + next-video preview + auto-advance countdown). The last video
/// ends in a closing screen instead of advancing. Crossfades + spring scale
/// on the next-up card give the experience a "next episode" feel.
struct SetPlayerView: View {
    let set: VideoSet
    let startAtIndex: Int

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    /// Phase machine — drives which layer is on screen.
    private enum Phase: Equatable {
        case loading
        case playing
        case transitioning   // showing the next-up card with countdown
        case completed       // set finished, show the closing screen
    }

    @State private var index: Int
    @State private var clips: [LessonClip] = []
    /// The video `clips` were loaded for.
    @State private var loadedVideoId: String? = nil
    @State private var errorMessage: String? = nil
    @State private var phase: Phase = .loading

    /// Cinema-mode flag is hoisted here so the landscape player can
    /// stay mounted across video advances. If it lived inside
    /// ClipPlayerView, the `.id(currentVideo.id)` remount on advance
    /// would also dismount the cinema cover, kicking the user back
    /// to portrait every time a video finished.
    @State private var showCinema: Bool = false
    /// Shared playback position so portrait↔cinema toggles resume at the
    /// same spot. Updated continuously by whichever player is on screen
    /// via its `onTick` callback.
    @State private var playhead = SetPlayhead()
    /// One-shot seek payload — when cinema dismisses, we hand the
    /// last known time to ClipPlayerView so portrait can pick up
    /// where cinema left off.
    @State private var portraitResumeAt: Double? = nil
    /// Cinema was left with its own back / portrait button: portrait picks
    /// up where it got to once the cover is gone. Not before — the cinema
    /// player still plays while the cover animates out, and the two would
    /// speak the same line at once.
    @State private var resumePortraitAfterCinema = false

    /// The learner's words when the current video started; what's new when
    /// it ends is what they caught in it.
    @State private var wordsAtVideoStart: WordsSnapshot? = nil
    /// Caught in the video that just ended (the next-up recap).
    @State private var caughtInVideo: [PocStarterWord] = []
    /// Caught during this run of the set, in order (the closing screen).
    @State private var caughtInSet: [PocStarterWord] = []

    init(set: VideoSet, startAtIndex: Int = 0) {
        self.set = set
        self.startAtIndex = startAtIndex
        self._index = State(initialValue: startAtIndex)
    }

    var body: some View {
        ZStack {
            // Always-on dark canvas so crossfades land cleanly.
            Theme.Color.background.ignoresSafeArea()

            // Player layer (under). Stays mounted during transitions so
            // the .id swap and clips reload happen behind the overlay.
            playerLayer
                .opacity(phase == .playing ? 1 : 0)

            // Loading state.
            if phase == .loading && errorMessage == nil {
                LoadingState(label: loadingLabel)
                    .transition(.opacity)
            }

            // Error state.
            if let err = errorMessage {
                ErrorState(
                    message: err,
                    onRetry: { Task { await load() } },
                    secondary: skipVideoAction,
                )
                .background(Theme.Color.background.ignoresSafeArea())
                .transition(.opacity)
            }

            // The player's own back button isn't on screen while a video
            // loads or fails to; keep a way out.
            if phase == .loading || errorMessage != nil {
                roundIconButton("chevron.left", label: "Setten çık") { dismiss() }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.leading, 16)
                    .padding(.top, 8)
                    .transition(.opacity)
            }

            // Transition overlay (between videos). Both of its ways forward
            // name the video that just finished, so only one advance happens.
            if phase == .transitioning, index < set.videos.count - 1 {
                NextUpOverlay(
                    set: set,
                    finishedIndex: index,
                    caught: caughtInVideo,
                    onContinueNow: { [finished = index] in continueAfterNextUp(finishedIndex: finished) },
                    onExit: { dismiss() },
                    onComplete: { [finished = index] in continueAfterNextUp(finishedIndex: finished) },
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }

            // Closing screen (after the last video).
            if phase == .completed {
                SetCompleteOverlay(
                    set: set,
                    caught: caughtInSet,
                    onShowWords: { showMyWords() },
                    onDismiss: { dismiss() },
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.easeInOut(duration: 0.45), value: phase)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        // A load error stays on screen with its retry when the screen
        // reappears (e.g. the cinema cover closed because of it) instead
        // of flashing back to loading.
        .task(id: index) {
            guard errorMessage == nil else { return }
            await load()
        }
        // Cinema can't show a load error usefully: drop to portrait, where
        // the error has its retry, skip and close buttons.
        .onChange(of: errorMessage) { _, err in
            guard err != nil, showCinema else { return }
            resumePortraitAfterCinema = false
            showCinema = false
        }
        .hidesTabBarWhileVisible()
        .fullScreenCover(isPresented: $showCinema, onDismiss: { cinemaDidDismiss() }) {
            cinemaCover
        }
    }

    private var currentVideo: PocVideo {
        self.set.videos[index]
    }

    private var hasNextVideo: Bool { index < self.set.videos.count - 1 }

    /// The loaded clips belong to the current video (never the previous
    /// one's data in a fresh player).
    private var hasClipsForCurrentVideo: Bool {
        !clips.isEmpty && clips.first?.youtubeVideoId == currentVideo.youtubeVideoId
    }

    private var loadingLabel: String {
        "\(index + 1) / \(self.set.videos.count) yükleniyor"
    }

    /// The players' header line: where this video is in the set.
    private var videoPositionLabel: String {
        "Video \(index + 1) / \(self.set.videos.count)"
    }

    @ViewBuilder
    private var playerLayer: some View {
        // Only mount ClipPlayerView when the loaded clips actually
        // belong to the current video, so a remount never starts with
        // the previous video's data. Never once the set is closed: a
        // video still starting (e.g. the last one, skipped as slow)
        // would otherwise play behind the closing screen.
        if hasClipsForCurrentVideo, phase != .completed {
            ClipPlayerView(
                clips: clips,
                onFinish: { [videoId = currentVideo.id] in onVideoFinished(videoId) },
                onExit: { dismiss() },
                onCinemaRequest: {
                    resumePortraitAfterCinema = false
                    showCinema = true
                },
                initialClipIndex: playhead.resumeClipIndex(for: currentVideo.id),
                initialTime: playhead.resumeTime(for: currentVideo.id),
                onTick: tickRecorder(for: currentVideo.id),
                resumeAt: $portraitResumeAt,
                // Silent until the cinema cover has fully gone.
                isPaused: showCinema || resumePortraitAfterCinema,
                onUnplayable: { [videoId = currentVideo.id] in skipUnplayableVideo(videoId) },
                headerSubtitle: videoPositionLabel,
                trimsSilence: true,
                focusPatternId: self.set.patternId,
            )
            .id(currentVideo.id)
            .environmentObject(appState)
        }
    }

    /// Cinema mounts at the SetPlayerView level so it survives the inner
    /// ClipPlayerView remount on video advance. The `.id(currentVideo.id)`
    /// on the inner view means cinema gets fresh state when the video
    /// changes — fresh clips, fresh start time — but the cover (and
    /// therefore the landscape orientation lock at the container level)
    /// stays on screen across the gap while the next video loads.
    private var cinemaCover: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if hasClipsForCurrentVideo {
                CinemaPlayerView(
                    clips: clips,
                    initialTime: playhead.resumeTime(for: currentVideo.id),
                    initialClipIndex: playhead.resumeClipIndex(for: currentVideo.id),
                    onTick: tickRecorder(for: currentVideo.id),
                    onFinish: { [videoId = currentVideo.id] in onVideoFinished(videoId) },
                    onExit: {
                        resumePortraitAfterCinema = true
                        showCinema = false
                    },
                    onUnplayable: { [videoId = currentVideo.id] in skipUnplayableVideo(videoId) },
                    headerSubtitle: videoPositionLabel,
                    trimsSilence: true,
                )
                .id(currentVideo.id)
                .environmentObject(appState)
            } else {
                cinemaPlaceholder
            }
        }
        .lockToLandscape()
    }

    /// The cover while the next video loads (or failed to): never a bare
    /// black screen, and always a way back to portrait.
    private var cinemaPlaceholder: some View {
        ZStack(alignment: .topLeading) {
            if let err = errorMessage {
                ErrorState(
                    message: err,
                    onRetry: { Task { await load() } },
                    secondary: skipVideoAction,
                )
                .background(Theme.Color.background.ignoresSafeArea())
            } else {
                LoadingState(label: loadingLabel)
                    .ignoresSafeArea()
            }
            roundIconButton("chevron.left", label: "Sinema modundan çık") {
                resumePortraitAfterCinema = false
                showCinema = false
            }
            .padding(.leading, 16)
            .padding(.top, 8)
        }
        // The cover hides this screen, whose own `.task` may not run
        // meanwhile; the next video loads from here too (a load already
        // done or in flight is joined, not repeated).
        .task(id: index) {
            guard errorMessage == nil else { return }
            await load()
        }
    }

    private func roundIconButton(_ systemName: String, label: String,
                                 action: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Theme.Color.backgroundCard))
                .overlay(Circle().strokeBorder(Theme.Color.border, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(label)
    }

    /// "Sonraki videoya geç" under the error, unless this is the last video.
    private var skipVideoAction: (label: String, run: () -> Void)? {
        guard hasNextVideo else { return nil }
        let failedIndex = index
        return (label: "Sonraki videoya geç", run: {
            // A second tap (or the other error view's button) is a no-op.
            guard index == failedIndex else { return }
            advanceNow()
        })
    }

    /// Records a player's position, tagged with the video it belongs to so
    /// a late report from the previous video can't become the next one's
    /// start time.
    private func tickRecorder(for videoId: String) -> (Int, Double) -> Void {
        let playhead = self.playhead
        return { clipIndex, time in
            playhead.record(videoId: videoId, clipIndex: clipIndex, time: time)
        }
    }

    // MARK: - Phase transitions

    /// `videoId` is the video the reporting player was showing; reports
    /// for any other video (a second player finishing the same video, a
    /// late callback) are ignored.
    private func onVideoFinished(_ videoId: String) {
        guard videoId == currentVideo.id, phase == .playing else { return }
        appState.markVideoWatched(videoId)
        caughtInVideo = collectCaughtWords()
        Haptics.success()
        if hasNextVideo {
            if showCinema {
                // In cinema we skip the next-up overlay entirely —
                // it would render under the cover anyway, and the
                // landscape flow is meant to feel uninterrupted.
                advanceNow()
            } else {
                withAnimation(.easeInOut(duration: 0.5)) {
                    phase = .transitioning
                }
            }
        } else {
            completeSet()
        }
    }

    /// A video that can't play was skipped: move on without counting it
    /// as watched.
    private func skipUnplayableVideo(_ videoId: String) {
        guard videoId == currentVideo.id, phase == .playing else { return }
        _ = collectCaughtWords()
        if hasNextVideo {
            advanceNow()
        } else {
            completeSet()
        }
    }

    /// "Devam et" and the countdown both end here. Only the first call for
    /// the video that just finished advances: a tap racing the countdown's
    /// last tick would otherwise skip the next video.
    private func continueAfterNextUp(finishedIndex: Int) {
        guard phase == .transitioning, index == finishedIndex else { return }
        advanceNow()
    }

    private func completeSet() {
        // Drop out of cinema so the closing screen is visible
        // (it's portrait-only).
        if showCinema { showCinema = false }
        withAnimation(.easeInOut(duration: 0.5)) {
            phase = .completed
        }
    }

    /// "Kelimelerimi gör": the Kelimeler tab, with the set closed behind it.
    private func showMyWords() {
        appState.showMyWords()
        dismiss()
    }

    /// The cover is gone: only now does portrait take the audio back.
    private func cinemaDidDismiss() {
        guard resumePortraitAfterCinema else { return }
        resumePortraitAfterCinema = false
        // Cinema may have finished the video while it animated out; the
        // next-up card is up then and portrait stays paused under it.
        guard phase == .playing else { return }
        // Cinema left before the video started (nothing recorded yet):
        // portrait plays from the start instead of waiting paused.
        portraitResumeAt = playhead.resumeTime(for: currentVideo.id) ?? resumeClipStart()
    }

    /// Where the set starts the clip portrait resumes on: its trimmed
    /// window, as the players play it.
    private func resumeClipStart() -> Double? {
        let clipIndex = playhead.resumeClipIndex(for: currentVideo.id)
        guard hasClipsForCurrentVideo, clips.indices.contains(clipIndex) else { return nil }
        return ClipTiming.playbackWindow(for: clips[clipIndex], trimSilence: true).start
    }

    private func advanceNow() {
        // Step into the next video. Clear clips first so the previous
        // video's data is unambiguously gone before we mount a fresh
        // player — playerLayer's videoId-match guard is the safety net.
        let next = index + 1
        guard next < self.set.videos.count else { return }
        Haptics.medium()
        // The new video starts at its own beginning.
        playhead.reset()
        errorMessage = nil
        loadedVideoId = nil
        withAnimation(.easeInOut(duration: 0.3)) {
            clips = []
            phase = .loading
            index = next
        }
        // task(id: index) fires on the index change and loads the
        // new video's clips; phase flips back to .playing on success.
    }

    /// Words the learner added since the current video started (named as
    /// the video names them), also added to the set's running list. Each
    /// word is reported once.
    private func collectCaughtWords() -> [PocStarterWord] {
        let video = currentVideo
        guard let start = wordsAtVideoStart, start.videoId == video.id else { return [] }
        let learned = appState.progress.learnedWords
        let newIds = learned.filter { !start.ids.contains($0) }
        wordsAtVideoStart = WordsSnapshot(videoId: video.id, ids: Set(learned))
        let caught = newIds.compactMap { starterWord(id: $0, in: video) }
        let known = Set(caughtInSet.map(\.id))
        caughtInSet.append(contentsOf: caught.filter { !known.contains($0.id) })
        return caught
    }

    /// A caught word as the video's word list has it, or else as its clip
    /// shows it.
    private func starterWord(id: String, in video: PocVideo) -> PocStarterWord? {
        if let listed = video.starterWords.first(where: { $0.id == id }) { return listed }
        for line in clips.flatMap(\.lines) {
            if let w = line.words.first(where: { $0.starterId == id }) {
                let word = w.word.trimmingCharacters(in: .punctuationCharacters).lowercased()
                return PocStarterWord(id: id, word: word, tr: w.starterTr ?? "", occurrences: 1)
            }
        }
        return nil
    }

    @MainActor
    private func load() async {
        let video = currentVideo
        // iOS re-runs `.task` when the view reappears (e.g. after the
        // cinema cover closes); the clips on screen are still right.
        if loadedVideoId == video.id, !clips.isEmpty, errorMessage == nil { return }
        // Don't override .completed / .transitioning when an
        // accidental re-fire happens.
        if phase != .transitioning && phase != .completed {
            phase = .loading
        }
        errorMessage = nil
        do {
            let fetched = try await CurriculumRepository.shared.pocVideoClips(videoId: video.id)
            // `.task(id:)` restarts on every index change; a result for a
            // video we've already left is dropped. (A result for the current
            // video is kept even if this task was cancelled meanwhile, e.g.
            // by a cover hiding the screen — it is still the right data.)
            guard video.id == currentVideo.id else { return }
            // The backend returns several curations of the same scene per
            // video; the set plays one per video (`PrimaryClip.pick`).
            guard let primary = PrimaryClip.pick(fetched) else {
                clips = []
                errorMessage = "Bu videonun altyazıları henüz hazır değil."
                return
            }
            clips = [ClipTiming.sanitize(primary)]
            loadedVideoId = video.id
            // Words added from here on were caught in this video.
            if wordsAtVideoStart?.videoId != video.id {
                wordsAtVideoStart = WordsSnapshot(videoId: video.id,
                                                  ids: Set(appState.progress.learnedWords))
            }
            // Only push to playing if we're not in a higher-priority
            // overlay state.
            if phase == .loading {
                withAnimation(.easeInOut(duration: 0.4)) {
                    phase = .playing
                }
            }
            prefetchNextVideo()
        } catch {
            // A cancelled load (the learner moved on) is not a failure.
            if error is CancellationError { return }
            if let urlError = error as? URLError, urlError.code == .cancelled { return }
            guard video.id == currentVideo.id else { return }
            errorMessage = error.localizedDescription
        }
    }

    /// Warms the next video's clips while this one plays, so the advance
    /// is instant.
    private func prefetchNextVideo() {
        guard hasNextVideo else { return }
        let nextId = self.set.videos[index + 1].id
        Task { await CurriculumRepository.shared.prefetchPocVideoClips(videoId: nextId) }
    }
}

/// The learner's words when a video started.
private struct WordsSnapshot {
    let videoId: String
    let ids: Set<String>
}

/// Where a set's on-screen player is. A reference type on purpose: the
/// players report ~10 times a second, and keeping that in `@State` would
/// re-render the whole set player (and both video screens) on every report.
private final class SetPlayhead {
    private var videoId: String? = nil
    private var clipIndex = 0
    private var time: Double? = nil

    func record(videoId: String, clipIndex: Int, time: Double) {
        self.videoId = videoId
        self.clipIndex = clipIndex
        self.time = time
    }

    func resumeClipIndex(for videoId: String) -> Int {
        self.videoId == videoId ? clipIndex : 0
    }

    func resumeTime(for videoId: String) -> Double? {
        self.videoId == videoId ? time : nil
    }

    func reset() {
        videoId = nil
        clipIndex = 0
        time = nil
    }
}

/// Turkish casing for this file's labels: uppercasing Turkish needs the
/// Turkish locale ("izlenen video" → "İZLENEN VİDEO", not "IZLENEN").
private enum SetFlowText {
    static let turkish = Locale(identifier: "tr_TR")

    /// A set's title in capitals: Turkish rules for a Turkish title, plain
    /// ones for the English fallback.
    static func titleCaps(_ set: VideoSet) -> String {
        set.titleTr?.isEmpty == false
            ? set.displayTitle.uppercased(with: turkish)
            : set.displayTitle.uppercased()
    }
}

// MARK: - Next-up overlay

/// "Next episode" style transition card. Shows the set's progress, a
/// brief acknowledgement of the just-finished video and the words caught
/// in it, a hero preview of the next video, and a countdown that
/// auto-advances. The user can skip the wait, exit the set, or do nothing
/// and let the timer roll.
private struct NextUpOverlay: View {
    let set: VideoSet
    let finishedIndex: Int
    /// Words the learner added during the video that just ended.
    let caught: [PocStarterWord]
    let onContinueNow: () -> Void
    let onExit: () -> Void
    let onComplete: () -> Void

    /// Auto-advance window. Long enough to read the next-up card (and the
    /// recap, when there is one) and short enough that the flow stays in
    /// motion.
    private let countdownSeconds: Double
    /// Recap chips shown before the rest fold into "+n".
    private static let maxRecapChips = 6

    @State private var remaining: Double
    @State private var timer: Timer? = nil
    @State private var didEnter: Bool = false
    /// The learner tapped a recap word: the countdown waits for "Devam et".
    @State private var isHeld = false
    /// Set by whichever way out ("Devam et", "Setten çık", the countdown)
    /// is taken first; the others then do nothing.
    @State private var didLeave = false

    init(
        set: VideoSet,
        finishedIndex: Int,
        caught: [PocStarterWord],
        onContinueNow: @escaping () -> Void,
        onExit: @escaping () -> Void,
        onComplete: @escaping () -> Void,
    ) {
        self.set = set
        self.finishedIndex = finishedIndex
        self.caught = caught
        self.onContinueNow = onContinueNow
        self.onExit = onExit
        self.onComplete = onComplete
        let seconds: Double = caught.isEmpty ? 5 : 8
        self.countdownSeconds = seconds
        self._remaining = State(initialValue: seconds)
    }

    private var nextVideo: PocVideo? {
        let next = finishedIndex + 1
        return next < self.set.videos.count ? self.set.videos[next] : nil
    }

    private var finishedVideo: PocVideo {
        self.set.videos[finishedIndex]
    }

    var body: some View {
        ZStack {
            backdrop

            // Scrolls only when a long recap doesn't fit (small phones);
            // otherwise the content sits centred like a card.
            GeometryReader { geo in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        Spacer(minLength: 24)
                        setProgress
                            .padding(.bottom, 22)
                        finishedRow
                            .padding(.bottom, caught.isEmpty ? 24 : 16)
                        if !caught.isEmpty {
                            recap
                                .padding(.bottom, 24)
                        }
                        Rectangle()
                            .fill(Theme.Color.border.opacity(0.5))
                            .frame(height: 1)
                            .padding(.bottom, 24)
                        if let next = nextVideo {
                            nextUpCard(for: next)
                                .padding(.bottom, 28)
                        }
                        actions
                        Spacer(minLength: 24)
                    }
                    .padding(.horizontal, 24)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .onAppear {
            guard !didEnter else { return }
            didEnter = true
            startTimer()
        }
        .onDisappear { stopTimer() }
    }

    private var backdrop: some View {
        // Dark gradient with a soft accent bloom from the top so the
        // overlay reads as a "transition layer" not a flat sheet.
        ZStack {
            Theme.Color.background
            RadialGradient(
                colors: [
                    Theme.Color.accent.opacity(0.25),
                    Theme.Color.accent.opacity(0.04),
                    .clear,
                ],
                center: .top,
                startRadius: 30,
                endRadius: 480,
            )
            Color.black.opacity(0.15)
        }
        .ignoresSafeArea()
    }

    private var progressFraction: CGFloat {
        let total = max(self.set.videos.count, 1)
        return CGFloat(min(finishedIndex + 1, total)) / CGFloat(total)
    }

    /// Where the set is: one bar, as wide as the screen whether the set
    /// has 5 videos or 100.
    private var setProgress: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(SetFlowText.titleCaps(set))
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.textMuted)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(finishedIndex + 1) / \(set.videos.count)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Theme.Color.border)
                    Capsule()
                        .fill(Theme.Color.accent)
                        .frame(width: geo.size.width * progressFraction)
                }
            }
            .frame(height: 4)
        }
        .frame(maxWidth: .infinity)
    }

    private var finishedRow: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Theme.Color.accent.opacity(0.18))
                    .frame(width: 36, height: 36)
                Circle()
                    .strokeBorder(Theme.Color.accent.opacity(0.6), lineWidth: 1)
                    .frame(width: 36, height: 36)
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("BİTİRDİN")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(Theme.Color.textMuted)
                Text(cleanedTitle(finishedVideo.title))
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    /// What the learner added in the video that just ended. Tapping a
    /// word holds the countdown so there's time to read.
    private var recap: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Bu videoda yakaladıkların")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.textSecondary)
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(Array(caught.prefix(Self.maxRecapChips))) { word in
                    Button(action: { holdCountdown() }) {
                        CaughtWordChip(word: word)
                    }
                    .buttonStyle(.pressable)
                }
                if caught.count > Self.maxRecapChips {
                    MoreWordsChip(count: caught.count - Self.maxRecapChips)
                }
            }
        }
    }

    private func nextUpCard(for video: PocVideo) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Text("SIRADAKİ")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.accent)
                Spacer(minLength: 0)
            }

            ZStack(alignment: .bottomLeading) {
                RemoteThumbnail(youtubeVideoId: video.youtubeVideoId)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                LinearGradient(
                    colors: [.clear, .clear, .black.opacity(0.85)],
                    startPoint: .top,
                    endPoint: .bottom,
                )
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(video.movieTitle.uppercased())
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(.white.opacity(0.85))
                    Text(cleanedTitle(video.title))
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .padding(16)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.4), lineWidth: 1),
            )
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button(action: { continueNow() }) {
                HStack(spacing: 12) {
                    if !isHeld {
                        countdownRing
                    }
                    Text("Devam et")
                        .font(.system(size: 16, weight: .heavy))
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .heavy))
                }
                // Dark ink on the bright accent reads; white doesn't.
                .foregroundStyle(Theme.Color.onAccent)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(
                    LinearGradient(
                        colors: [Theme.Color.accent, Theme.Color.accent.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing,
                    ),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous),
                )
                .shadow(color: Theme.Color.accent.opacity(0.45), radius: 16, x: 0, y: 6)
            }
            .buttonStyle(.pressable(scale: 0.98))

            Button(action: { exitSet() }) {
                Text("Setten çık")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
        }
    }

    private var countdownRing: some View {
        ZStack {
            Circle()
                .strokeBorder(Theme.Color.onAccent.opacity(0.25), lineWidth: 2)
                .frame(width: 26, height: 26)
            Circle()
                .trim(from: 0, to: max(0, remaining / countdownSeconds))
                .stroke(Theme.Color.onAccent, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 26, height: 26)
                .animation(.linear(duration: 0.1), value: remaining)
            Text("\(Int(remaining.rounded(.up)))")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.onAccent)
        }
    }

    private func continueNow() {
        guard !didLeave else { return }
        didLeave = true
        Haptics.medium()
        stopTimer()
        onContinueNow()
    }

    private func exitSet() {
        guard !didLeave else { return }
        didLeave = true
        Haptics.light()
        stopTimer()
        onExit()
    }

    private func holdCountdown() {
        guard !didLeave, !isHeld else { return }
        Haptics.selection()
        isHeld = true
        stopTimer()
    }

    private func startTimer() {
        remaining = countdownSeconds
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            DispatchQueue.main.async {
                // A tick queued before a tap stopped the timer must not
                // advance (again) after it.
                guard timer != nil, !didLeave else { return }
                remaining -= 0.05
                if remaining <= 0 {
                    stopTimer()
                    didLeave = true
                    Haptics.medium()
                    onComplete()
                }
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func cleanedTitle(_ raw: String) -> String {
        var t = raw
        if let sep = t.range(of: " | ") { t = String(t[..<sep.lowerBound]) }
        t = t.replacingOccurrences(of: #"\(\d{4}\)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s*Scene\s*\(\d+/\d+\)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: " -"))
        return t
    }
}

// MARK: - Set complete overlay

/// Shown after the LAST video in the set finishes (or is skipped). States
/// honestly what happened — how many of the set's videos are watched, how
/// many of its words are in the learner's list, the words added this time —
/// and offers the way back to the set or on to those words.
private struct SetCompleteOverlay: View {
    let set: VideoSet
    /// Words the learner added during this run of the set.
    let caught: [PocStarterWord]
    let onShowWords: () -> Void
    let onDismiss: () -> Void

    @EnvironmentObject var appState: AppState

    @State private var didEnter = false
    @State private var markScale: CGFloat = 0.8

    /// Chips shown before the rest fold into "+n".
    private static let maxChips = 12

    private var watchedCount: Int {
        self.set.videos.filter { appState.isVideoWatched($0.id) }.count
    }

    /// Every video watched to its end. A run that skipped an unplayable
    /// video doesn't claim the set.
    private var isSetComplete: Bool {
        !self.set.videos.isEmpty && watchedCount == self.set.videos.count
    }

    /// The set's words in the learner's list, whenever they were added.
    private var setWordsInList: Int {
        let learned = Set(appState.progress.learnedWords)
        var ids = Set<String>()
        for video in self.set.videos {
            for word in video.starterWords where learned.contains(word.id) {
                ids.insert(word.id)
            }
        }
        return ids.count
    }

    var body: some View {
        ZStack {
            // Soft backdrop — slightly more accent presence than the
            // next-up overlay since this is a one-shot moment.
            ZStack {
                Theme.Color.background
                RadialGradient(
                    colors: [
                        Theme.Color.accent.opacity(0.35),
                        Theme.Color.accent.opacity(0.06),
                        .clear,
                    ],
                    center: .center,
                    startRadius: 40,
                    endRadius: 520,
                )
            }
            .ignoresSafeArea()

            // Scrolls only when many words don't fit; otherwise centred.
            GeometryReader { geo in
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 28) {
                        Spacer(minLength: 16)
                        mark
                        heading
                        stats
                        if !caught.isEmpty {
                            caughtWords
                        }
                        Spacer(minLength: 8)
                        buttons
                    }
                    .padding(.horizontal, 32)
                    .padding(.bottom, 32)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .onAppear {
            guard !didEnter else { return }
            didEnter = true
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) {
                markScale = 1.0
            }
            Haptics.success()
        }
    }

    private var mark: some View {
        ZStack {
            Circle()
                .fill(Theme.Color.accent.opacity(0.2))
                .frame(width: 120, height: 120)
            Circle()
                .strokeBorder(Theme.Color.accent.opacity(0.5), lineWidth: 1.5)
                .frame(width: 120, height: 120)
            Image(systemName: isSetComplete ? "checkmark" : "film.stack")
                .font(.system(size: 48, weight: .heavy))
                .foregroundStyle(Theme.Color.accent)
        }
        .scaleEffect(markScale)
        .shadow(color: Theme.Color.accent.opacity(0.4), radius: 30, x: 0, y: 10)
    }

    private var heading: some View {
        VStack(spacing: 10) {
            Text(isSetComplete ? "SET TAMAMLANDI" : "BUGÜNLÜK BU KADAR")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(2)
                .foregroundStyle(Theme.Color.accent)
            Text(set.displayTitle)
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
    }

    private var stats: some View {
        HStack(spacing: 24) {
            StatColumn(value: "\(watchedCount)/\(set.videos.count)", label: "izlenen video")
            Rectangle()
                .fill(Theme.Color.border)
                .frame(width: 1, height: 32)
            StatColumn(value: "\(setWordsInList)", label: "eklediğin kelime")
        }
        .padding(.vertical, 4)
    }

    private var caughtWords: some View {
        VStack(spacing: 12) {
            Text("Bu sefer eklediklerin")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.textSecondary)
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(Array(caught.prefix(Self.maxChips))) { word in
                    CaughtWordChip(word: word)
                }
                if caught.count > Self.maxChips {
                    MoreWordsChip(count: caught.count - Self.maxChips)
                }
            }
        }
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            Button(action: {
                Haptics.success()
                onDismiss()
            }) {
                HStack(spacing: 8) {
                    Text("Sete dön")
                        .font(.system(size: 16, weight: .heavy))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .heavy))
                }
                // Dark ink on the bright accent reads; white doesn't.
                .foregroundStyle(Theme.Color.onAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(
                        colors: [Theme.Color.accent, Theme.Color.accent.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing,
                    ),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous),
                )
                .shadow(color: Theme.Color.accent.opacity(0.45), radius: 16, x: 0, y: 6)
            }
            .buttonStyle(.pressable(scale: 0.97))

            // Closes the loop: watch → add → see them in the word list.
            if !appState.progress.learnedWords.isEmpty {
                Button(action: {
                    Haptics.light()
                    onShowWords()
                }) {
                    Text("Kelimelerimi gör")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Theme.Color.backgroundCard),
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(Theme.Color.border, lineWidth: 1),
                        )
                }
                .buttonStyle(.pressable(scale: 0.97))
            }
        }
    }
}

/// "word · tr": a word the learner added, in the players' target-word amber.
private struct CaughtWordChip: View {
    let word: PocStarterWord

    private static let amber = Color(hex: 0xFFB347)

    var body: some View {
        HStack(spacing: 6) {
            Text(word.word)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.textPrimary)
            if !word.tr.isEmpty {
                Text("·")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.textMuted)
                Text(word.tr)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
            }
        }
        .lineLimit(1)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(Self.amber.opacity(0.12)))
        .overlay(Capsule().strokeBorder(Self.amber.opacity(0.45), lineWidth: 1))
    }
}

/// "+3 kelime daha" after the chips that fit.
private struct MoreWordsChip: View {
    let count: Int

    var body: some View {
        Text("+\(count) kelime daha")
            .font(.system(size: 13, weight: .heavy))
            .foregroundStyle(Theme.Color.textSecondary)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(Theme.Color.backgroundSurface.opacity(0.7)))
    }
}

private struct StatColumn: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 24, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Theme.Color.textPrimary)
            Text(label.uppercased(with: SetFlowText.turkish))
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.4)
                .foregroundStyle(Theme.Color.textMuted)
        }
    }
}
