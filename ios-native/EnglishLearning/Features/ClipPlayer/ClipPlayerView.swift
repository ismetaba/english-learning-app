import SwiftUI

/// Full-featured clip player: YouTube embed + synced subtitles + translation + controls.
struct ClipPlayerView: View {
    let clips: [LessonClip]
    var onClipComplete: ((LessonClip) -> Void)? = nil
    var onFinish: (() -> Void)? = nil

    @State private var index: Int = 0
    @State private var currentTime: Double = 0
    @State private var isPlaying = false
    @State private var showTranslation = true
    @State private var command: YouTubePlayerView.PlayerCommand? = nil
    @State private var loopTarget: (start: Double, end: Double)? = nil
    /// Line IDs already auto-paused during this visit to the current clip —
    /// prevents the "stop at target" logic from re-triggering on scrub or loop.
    @State private var pausedTargets: Set<Int> = []
    /// Currently-presented "target reached" prompt. Cleared on resume or next.
    @State private var targetBanner: ClipLine? = nil
    @EnvironmentObject var appState: AppState

    private var clip: LessonClip { clips[index] }
    private var totalClips: Int { clips.count }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                playerArea
                controlsSurface
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(false)
        .onChange(of: clip.id) { _, _ in
            currentTime = clip.startTime
            command = .reload
            pausedTargets = []
            targetBanner = nil
            loopTarget = nil
        }
    }

    // MARK: - Target-line auto-pause

    /// If the playhead just crossed the end of a line marked `isTarget`, pause
    /// the player once and surface a prompt so the learner can practice.
    /// Skips lines that end in the first ~1.5s of the clip — those read as
    /// annoying micro-pauses right after autoplay begins.
    private func checkTargetPause(at t: Double) {
        let elapsed = t - clip.startTime
        guard elapsed >= 1.5 else { return }
        guard let target = clip.lines.first(where: { line in
            line.isTarget == true
            && !pausedTargets.contains(line.id)
            && (line.endTime - clip.startTime) >= 1.5
            && t >= line.endTime
            && t <= line.endTime + 0.6
        }) else { return }
        pausedTargets.insert(target.id)
        Haptics.medium()
        command = .pause
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            targetBanner = target
        }
    }

    private func dismissTargetBanner() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            targetBanner = nil
        }
    }

    // MARK: - Player

    private var playerArea: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                YouTubePlayerView(
                    videoId: clip.youtubeVideoId,
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    autoplay: true,
                    isPlaying: $isPlaying,
                    currentTime: { t in
                        self.currentTime = t
                        if let loop = loopTarget, t >= loop.end {
                            command = .seek(loop.start)
                        }
                        if t >= clip.endTime - 0.1 {
                            loopTarget = nil
                        }
                        // Target-line stop: only outside of an active loop.
                        if loopTarget == nil {
                            checkTargetPause(at: t)
                        }
                    },
                    onReady: {
                        isPlaying = true
                    },
                    onEnded: {
                        next()
                    },
                    command: $command
                )
                .aspectRatio(16.0/9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.top, 8)

                // Top overlay — just the close affordance + quiet scene counter.
                HStack(alignment: .center) {
                    Button {
                        Haptics.light()
                        onFinish?()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(Color.black.opacity(0.45)))
                    }
                    .buttonStyle(.pressable)
                    Spacer()
                    Text("\(index + 1) / \(totalClips)")
                        .font(Theme.Font.mono(12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.black.opacity(0.45)))
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
            }
        }
    }

    // MARK: - Controls & subtitle surface

    private var controlsSurface: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        subtitleStack(proxy: proxy)
                        Spacer().frame(height: 140)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 22)
                }
                .onChange(of: currentTimeLineIndex) { _, newIndex in
                    guard let i = newIndex else { return }
                    withAnimation(.easeInOut(duration: 0.25)) {
                        proxy.scrollTo("line-\(i)", anchor: .center)
                    }
                }
            }
            bottomBar
        }
        .background(
            LinearGradient(
                colors: [Theme.Color.background.opacity(0.0), Theme.Color.background, .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(clip.movieTitle)
                    .font(Theme.Font.headline(15, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(1)
                Text("Scene \(index + 1) · \(formatTime(clip.duration))")
                    .font(Theme.Font.caption(12, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            Spacer(minLength: 12)
            Button {
                Haptics.selection()
                showTranslation.toggle()
            } label: {
                Image(systemName: showTranslation ? "character.bubble.fill" : "character.bubble")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(showTranslation ? Theme.Color.primary : Theme.Color.textMuted)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
        }
    }

    private var sceneHint: some View {
        Text("Tap a line to jump there")
            .font(Theme.Font.caption(12))
            .foregroundStyle(Theme.Color.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func subtitleStack(proxy: ScrollViewProxy) -> some View {
        VStack(spacing: 2) {
            ForEach(Array(clip.lines.enumerated()), id: \.element.id) { idx, line in
                SubtitleLineView(
                    line: line,
                    active: currentTimeLineIndex == idx,
                    currentTime: currentTime,
                    showTranslation: showTranslation,
                    onTap: {
                        // One-shot jump — no looping.
                        command = .seek(line.startTime)
                        if !isPlaying { command = .play }
                    }
                )
                .id("line-\(idx)")
            }
        }
    }

    private var currentTimeLineIndex: Int? {
        clip.lines.firstIndex(where: { currentTime >= $0.startTime && currentTime <= $0.endTime })
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        VStack(spacing: 12) {
            if let banner = targetBanner {
                targetReachedCard(for: banner)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            progressSlider
            HStack(spacing: 14) {
                controlButton(icon: "backward.end.fill", action: previous, disabled: index == 0)
                controlButton(icon: "gobackward.5") {
                    command = .seek(max(clip.startTime, currentTime - 5))
                }
                playPauseButton
                controlButton(icon: "goforward.5") {
                    command = .seek(min(clip.endTime, currentTime + 5))
                }
                controlButton(icon: "forward.end.fill", action: next, disabled: index >= totalClips - 1)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 28)
        .animation(.easeInOut(duration: 0.25), value: targetBanner?.id)
        .background(Theme.Color.background)
        .overlay(
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 0.5),
            alignment: .top
        )
    }

    private var progressSlider: some View {
        let total = max(clip.duration, 1)
        let played = max(0, currentTime - clip.startTime)
        return VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.1))
                    Capsule()
                        .fill(Theme.Color.primary)
                        .frame(width: max(0, min(geo.size.width, geo.size.width * played / total)))
                }
            }
            .frame(height: 3)
            HStack {
                Text(formatTime(played))
                    .font(Theme.Font.mono(11, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                Spacer()
                Text("−\(formatTime(max(0, total - played)))")
                    .font(Theme.Font.mono(11, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    /// Shown above the progress bar when playback auto-paused at a target line.
    /// Offers two explicit choices — never auto-loops.
    private func targetReachedCard(for line: ClipLine) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Target line")
                    .font(Theme.Font.caption(10, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.accent)
                    .textCase(.uppercase)
                Text("\u{201C}\(line.text)\u{201D}")
                    .font(Theme.Font.headline(14, weight: .semibold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(3)
            }

            HStack(spacing: 10) {
                Button {
                    Haptics.medium()
                    listenAgain(line)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 12, weight: .bold))
                        Text("Listen again")
                            .font(Theme.Font.caption(13, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Color.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.pressable)

                Button {
                    Haptics.medium()
                    continueFromTarget()
                } label: {
                    HStack(spacing: 6) {
                        Text("Continue")
                            .font(Theme.Font.caption(13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(Theme.Color.primary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.backgroundElevated)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    /// Replays the target line once and re-pauses at its end (so the user can
    /// decide again). Does NOT loop automatically.
    private func listenAgain(_ line: ClipLine) {
        pausedTargets.remove(line.id)   // allow the end-of-line pause to fire again
        targetBanner = nil
        currentTime = line.startTime
        command = .loop(line.startTime, line.endTime)   // loop = seek + play
    }

    /// Dismisses the banner and resumes playback — no looping.
    private func continueFromTarget() {
        targetBanner = nil
        command = .play
    }

    private var playPauseButton: some View {
        Button {
            Haptics.medium()
            if !isPlaying { dismissTargetBanner() }
            command = isPlaying ? .pause : .play
        } label: {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Theme.Color.primary, Theme.Color.primaryDark],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .offset(x: isPlaying ? 0 : 2)
            }
            .frame(width: 64, height: 64)
            .shadow(color: Theme.Color.primary.opacity(0.5), radius: 14, x: 0, y: 6)
        }
        .buttonStyle(.pressable)
    }

    private func controlButton(icon: String, action: @escaping () -> Void = {}, disabled: Bool = false) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .frame(width: 46, height: 46)
                .background(
                    Circle()
                        .fill(Theme.Color.backgroundElevated.opacity(0.85))
                )
                .overlay(
                    Circle().strokeBorder(Theme.Color.border, lineWidth: 1)
                )
                .opacity(disabled ? 0.3 : 1.0)
        }
        .disabled(disabled)
        .buttonStyle(.pressable)
    }

    // MARK: - Navigation between clips

    private func next() {
        onClipComplete?(clip)
        targetBanner = nil
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
        targetBanner = nil
        withAnimation { index -= 1 }
    }

    private func formatTime(_ t: Double) -> String {
        let secs = Int(t.rounded())
        return String(format: "%01d:%02d", secs / 60, secs % 60)
    }
}

// MARK: - Subtitle line

struct SubtitleLineView: View {
    let line: ClipLine
    let active: Bool
    let currentTime: Double
    let showTranslation: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: {
            Haptics.selection()
            onTap()
        }) {
            HStack(alignment: .top, spacing: 10) {
                // Left rail — accent line only on the active row. Calm and quiet.
                RoundedRectangle(cornerRadius: 2)
                    .fill(active ? Theme.Color.primary : Color.clear)
                    .frame(width: 3)
                    .padding(.vertical, 4)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        if !line.speaker.isEmpty {
                            Text(line.speaker)
                                .font(Theme.Font.caption(10, weight: .semibold))
                                .foregroundStyle(Theme.Color.textMuted)
                                .tracking(0.5)
                                .textCase(.uppercase)
                        }
                        if line.isTarget == true {
                            Text("TARGET")
                                .font(Theme.Font.caption(9, weight: .heavy))
                                .tracking(0.8)
                                .foregroundStyle(Theme.Color.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule().fill(Theme.Color.accent.opacity(0.12))
                                )
                        }
                    }
                    highlightedText
                        .font(Theme.Font.headline(active ? 17 : 15, weight: active ? .semibold : .regular))
                        .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textSecondary.opacity(0.7))
                        .fixedSize(horizontal: false, vertical: true)

                    if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                        Text(tr)
                            .font(Theme.Font.body(12))
                            .foregroundStyle(Theme.Color.textMuted)
                            .lineSpacing(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(active ? Color.white.opacity(0.04) : Color.clear)
            )
        }
        .buttonStyle(.pressable(scale: 0.99))
    }

    @ViewBuilder
    private var highlightedText: some View {
        if active, !line.words.isEmpty {
            // Word-level highlighting: build an attributed string with highlighted current word.
            let attributed = buildAttributed()
            Text(attributed)
        } else {
            Text(line.text)
        }
    }

    private func buildAttributed() -> AttributedString {
        var out = AttributedString(line.text)
        let activeWord = line.words.first(where: { currentTime >= $0.startTime && currentTime <= $0.endTime })
        guard let active = activeWord else {
            return out
        }
        if let range = out.range(of: active.word, options: .caseInsensitive) {
            out[range].foregroundColor = Theme.Color.primary
            out[range].inlinePresentationIntent = .stronglyEmphasized
        }
        return out
    }
}
