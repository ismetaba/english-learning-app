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
                ThumbnailMosaic(videos: Array(set.videos.prefix(4)))
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
                    Text("\(set.videos.count) VIDEO")
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
            }

            // Primary call-to-action — starts the set from video 1.
            Button(action: {
                Haptics.success()
                startIndex = 0
            }) {
                HStack(spacing: 10) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 14, weight: .heavy))
                    Text("Sete Başla")
                        .font(.system(size: 16, weight: .heavy))
                }
                .foregroundStyle(.white)
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
                Text("VIDEOLAR")
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
                    onTap: {
                        Haptics.medium()
                        startIndex = i
                    },
                )
            }
        }
    }

    private var difficultyLabel: String {
        switch set.difficulty {
        case "beginner":     return "BAŞLANGIÇ"
        case "elementary":   return "TEMEL"
        case "intermediate": return "ORTA"
        case "advanced":     return "İLERİ"
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
                    AsyncImage(url: v.thumbnailURL) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().aspectRatio(contentMode: .fill)
                        case .empty, .failure:
                            Color.black
                        @unknown default:
                            Color.black
                        }
                    }
                    .frame(width: geo.size.width / CGFloat(max(videos.count, 1)), height: geo.size.height)
                    .clipped()
                }
            }
            .background(Color.black)
        }
    }
}

// MARK: - Video row in detail list

private struct SetVideoRow: View {
    let video: PocVideo
    let position: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.backgroundSurface)
                        .overlay(
                            Circle().strokeBorder(Theme.Color.border, lineWidth: 1),
                        )
                        .frame(width: 32, height: 32)
                    Text(String(format: "%02d", position))
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textSecondary)
                }

                AsyncImage(url: video.thumbnailURL) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().aspectRatio(contentMode: .fill)
                    case .empty, .failure:
                        Color.black
                    @unknown default:
                        Color.black
                    }
                }
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
/// overlay slides in (set progress + just-finished badge + next-video
/// preview + auto-advance countdown). The last video ends in a
/// completion screen instead of advancing. Crossfades + spring scale
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
        case completed       // set finished, show celebration
    }

    @State private var index: Int
    @State private var clips: [LessonClip] = []
    @State private var errorMessage: String? = nil
    @State private var phase: Phase = .loading

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
            if phase == .loading {
                LoadingState(label: "\(index + 1) / \(set.videos.count) yükleniyor")
                    .transition(.opacity)
            }

            // Error state.
            if let err = errorMessage {
                ErrorState(message: err) {
                    Task { await load() }
                }
                .transition(.opacity)
            }

            // Transition overlay (between videos).
            if phase == .transitioning, index < set.videos.count - 1 {
                NextUpOverlay(
                    set: set,
                    finishedIndex: index,
                    onContinueNow: { advanceNow() },
                    onExit: { dismiss() },
                    onComplete: { advanceNow() },
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }

            // Completion screen (after last video).
            if phase == .completed {
                SetCompleteOverlay(
                    set: set,
                    onDismiss: { dismiss() },
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.easeInOut(duration: 0.45), value: phase)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: index) { await load() }
        .onAppear { appState.isVideoPlayerActive = true }
        .onDisappear { appState.isVideoPlayerActive = false }
    }

    private var currentVideo: PocVideo {
        self.set.videos[index]
    }

    @ViewBuilder
    private var playerLayer: some View {
        // Only mount ClipPlayerView when the loaded clips actually
        // belong to the current video. Without this guard, advancing
        // re-mounts ClipPlayerView via `.id(currentVideo.id)` while
        // `clips` still holds the previous video's data — the inner
        // YouTubePlayerView gets initialized with the OLD videoId, and
        // its UIViewRepresentable.updateUIView doesn't handle videoId
        // changes, so the WebView keeps showing the just-finished
        // video while the player UI says it's the new one.
        if !clips.isEmpty,
           clips.first?.youtubeVideoId == currentVideo.youtubeVideoId {
            ClipPlayerView(
                clips: clips,
                onFinish: { onVideoFinished() },
                onExit: { dismiss() },
            )
            .id(currentVideo.id)
            .environmentObject(appState)
        }
    }

    // MARK: - Phase transitions

    private func onVideoFinished() {
        Haptics.success()
        if index < set.videos.count - 1 {
            withAnimation(.easeInOut(duration: 0.5)) {
                phase = .transitioning
            }
        } else {
            withAnimation(.easeInOut(duration: 0.5)) {
                phase = .completed
            }
        }
    }

    private func advanceNow() {
        // Step into the next video. Clear clips first so the previous
        // video's data is unambiguously gone before we mount a fresh
        // player — playerLayer's videoId-match guard is the safety
        // net, but explicitly clearing here makes the timing visible
        // in state and prevents a flash of the old WebView.
        let next = index + 1
        guard next < self.set.videos.count else { return }
        Haptics.medium()
        withAnimation(.easeInOut(duration: 0.3)) {
            clips = []
            phase = .loading
            index = next
        }
        // task(id: index) fires on the index change and loads the
        // new video's clips; phase flips back to .playing on success.
    }

    @MainActor
    private func load() async {
        // Don't override .completed / .transitioning when an
        // accidental re-fire happens (e.g. iOS re-runs .task).
        if phase != .transitioning && phase != .completed {
            phase = .loading
        }
        errorMessage = nil
        do {
            let fetched = try await CurriculumRepository.shared.pocVideoClips(
                videoId: currentVideo.id,
            )
            // The backend returns multiple "approved" curations of the
            // same scene per video — auto-advancing through them would
            // loop the same dialogue again under the same YouTube id.
            // For the SET flow we want one playthrough per video, so
            // pick the single clip that surfaces the MOST tagged
            // dialogue. Earlier this picked the longest by duration,
            // but the longest clip often had a sparser whisper pass
            // and ended up showing fewer colored lines than a shorter
            // alternate cut. Tie-break on duration so a denser clip
            // doesn't lose to a marginally fuller but tiny one.
            let primary = fetched.max(by: { a, b in
                if a.lines.count != b.lines.count {
                    return a.lines.count < b.lines.count
                }
                return (a.endTime - a.startTime) < (b.endTime - b.startTime)
            })
            clips = primary.map { [$0] } ?? []
            // Only push to playing if we're not in a higher-priority
            // overlay state.
            if phase == .loading {
                withAnimation(.easeInOut(duration: 0.4)) {
                    phase = .playing
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Next-up overlay

/// "Next episode" style transition card. Shows the set's progress, a
/// brief acknowledgement of the just-finished video, a hero preview of
/// the next video, and a countdown that auto-advances. The user can
/// skip the wait, exit the set, or do nothing and let the timer roll.
private struct NextUpOverlay: View {
    let set: VideoSet
    let finishedIndex: Int
    let onContinueNow: () -> Void
    let onExit: () -> Void
    let onComplete: () -> Void

    /// Auto-advance window. Long enough to read the next-up card and
    /// short enough that the flow stays in motion.
    private static let countdownSeconds = 5

    @State private var remaining: Double = Double(countdownSeconds)
    @State private var timer: Timer? = nil
    @State private var didEnter: Bool = false

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

            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 0)
                progressDots
                    .padding(.bottom, 22)
                finishedRow
                    .padding(.bottom, 24)
                Rectangle()
                    .fill(Theme.Color.border.opacity(0.5))
                    .frame(height: 1)
                    .padding(.bottom, 24)
                if let next = nextVideo {
                    nextUpCard(for: next)
                        .padding(.bottom, 28)
                }
                actions
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
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

    private var progressDots: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(set.displayTitle.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.textMuted)
                Spacer(minLength: 0)
                Text("\(finishedIndex + 1) / \(set.videos.count)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textSecondary)
            }
            HStack(spacing: 6) {
                ForEach(Array(set.videos.enumerated()), id: \.element.id) { i, _ in
                    Capsule()
                        .fill(
                            i <= finishedIndex
                                ? Theme.Color.accent
                                : Theme.Color.backgroundSurface,
                        )
                        .frame(height: 4)
                        .frame(maxWidth: .infinity)
                        .overlay(
                            Capsule()
                                .strokeBorder(Theme.Color.border.opacity(0.4), lineWidth: 0.5),
                        )
                }
            }
        }
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

    private func nextUpCard(for video: PocVideo) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Text("SIRADAKI")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.accent)
                Spacer(minLength: 0)
            }

            ZStack(alignment: .bottomLeading) {
                AsyncImage(url: video.thumbnailURL) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().aspectRatio(contentMode: .fill)
                    case .empty, .failure:
                        Color.black
                    @unknown default:
                        Color.black
                    }
                }
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
            Button(action: {
                Haptics.medium()
                stopTimer()
                onContinueNow()
            }) {
                HStack(spacing: 12) {
                    countdownRing
                    Text("Devam et")
                        .font(.system(size: 16, weight: .heavy))
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .heavy))
                }
                .foregroundStyle(.white)
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

            Button(action: {
                Haptics.light()
                stopTimer()
                onExit()
            }) {
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
                .strokeBorder(Color.white.opacity(0.25), lineWidth: 2)
                .frame(width: 26, height: 26)
            Circle()
                .trim(from: 0, to: max(0, remaining / Double(Self.countdownSeconds)))
                .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 26, height: 26)
                .animation(.linear(duration: 0.1), value: remaining)
            Text("\(Int(remaining.rounded(.up)))")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
        }
    }

    private func startTimer() {
        remaining = Double(Self.countdownSeconds)
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { t in
            DispatchQueue.main.async {
                remaining -= 0.05
                if remaining <= 0 {
                    t.invalidate()
                    timer = nil
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

/// Shown after the LAST video in the set finishes. Celebrates the
/// completion with a brief stat block + a single dismiss action that
/// returns to the set detail.
private struct SetCompleteOverlay: View {
    let set: VideoSet
    let onDismiss: () -> Void

    @State private var didEnter = false
    @State private var trophyScale: CGFloat = 0.8

    var body: some View {
        ZStack {
            // Festive backdrop — slightly more accent presence than
            // the next-up overlay since this is a one-shot moment.
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

            VStack(spacing: 28) {
                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .fill(Theme.Color.accent.opacity(0.2))
                        .frame(width: 120, height: 120)
                    Circle()
                        .strokeBorder(Theme.Color.accent.opacity(0.5), lineWidth: 1.5)
                        .frame(width: 120, height: 120)
                    Image(systemName: "checkmark")
                        .font(.system(size: 48, weight: .heavy))
                        .foregroundStyle(Theme.Color.accent)
                }
                .scaleEffect(trophyScale)
                .shadow(color: Theme.Color.accent.opacity(0.4), radius: 30, x: 0, y: 10)

                VStack(spacing: 10) {
                    Text("SET TAMAMLANDI")
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

                HStack(spacing: 24) {
                    StatColumn(value: "\(set.videos.count)", label: "video")
                    Rectangle()
                        .fill(Theme.Color.border)
                        .frame(width: 1, height: 32)
                    StatColumn(value: "\(set.distinctStarterWordCount)", label: "kelime")
                }
                .padding(.vertical, 4)

                Spacer(minLength: 0)

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
                    .foregroundStyle(.white)
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
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .onAppear {
            guard !didEnter else { return }
            didEnter = true
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) {
                trophyScale = 1.0
            }
            Haptics.success()
        }
    }
}

private struct StatColumn: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 24, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
            Text(label.uppercased())
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.4)
                .foregroundStyle(Theme.Color.textMuted)
        }
    }
}
