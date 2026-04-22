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
    @EnvironmentObject var appState: AppState

    private var clip: LessonClip { clips[index] }
    private var totalClips: Int { clips.count }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
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
        }
    }

    // MARK: - Player

    private var playerArea: some View {
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
            .clipped()
            // top overlay
            HStack {
                Button {
                    onFinish?()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.black.opacity(0.55), in: Circle())
                }
                Spacer()
                Chip(label: "\(index + 1) / \(totalClips)", color: .white)
                    .foregroundStyle(.white)
            }
            .padding(12)
        }
        .background(Color.black)
    }

    // MARK: - Controls & subtitle surface

    private var controlsSurface: some View {
        VStack(spacing: 0) {
            // Drag handle
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        subtitleStack(proxy: proxy)
                        Spacer().frame(height: 130)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
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
            LinearGradient(colors: [Theme.Color.background, .black], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(clip.movieTitle)
                        .font(Theme.Font.body(12, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                        .textCase(.uppercase)
                        .tracking(0.8)
                    Text("Scene \(index + 1)")
                        .font(Theme.Font.display(22, weight: .heavy))
                        .foregroundStyle(Theme.Color.textPrimary)
                }
                Spacer()
                Button {
                    Haptics.selection()
                    showTranslation.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: showTranslation ? "eye.slash.fill" : "eye.fill")
                            .font(.system(size: 12, weight: .bold))
                        Text(showTranslation ? appState.t.t("hideTranslation") : appState.t.t("showTranslation"))
                            .font(Theme.Font.caption(12, weight: .bold))
                    }
                    .foregroundStyle(Theme.Color.primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Theme.Color.primarySoft, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.borderAccent, lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }
        }
    }

    private func subtitleStack(proxy: ScrollViewProxy) -> some View {
        VStack(spacing: 10) {
            ForEach(Array(clip.lines.enumerated()), id: \.element.id) { idx, line in
                SubtitleLineView(
                    line: line,
                    active: currentTimeLineIndex == idx,
                    currentTime: currentTime,
                    showTranslation: showTranslation,
                    onTap: {
                        command = .seek(line.startTime)
                        loopTarget = (line.startTime, line.endTime)
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
            if let currentLine = currentTimeLineIndex.flatMap({ clip.lines[$0] }) {
                Button {
                    Haptics.medium()
                    command = .seek(currentLine.startTime)
                    loopTarget = (currentLine.startTime, currentLine.endTime)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "repeat.1")
                            .font(.system(size: 13, weight: .bold))
                        Text("Replay line")
                            .font(Theme.Font.caption(12, weight: .bold))
                    }
                    .foregroundStyle(Theme.Color.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Theme.Color.accentSoft, in: Capsule())
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 24)
        .background(Theme.Color.backgroundCard.opacity(0.98))
        .overlay(Rectangle().fill(Theme.Color.border).frame(height: 1), alignment: .top)
    }

    private var progressSlider: some View {
        let total = max(clip.duration, 1)
        let played = max(0, currentTime - clip.startTime)
        return VStack(spacing: 4) {
            ProgressBar(
                percent: Double(played / total) * 100,
                height: 4,
                color: Theme.Color.primary
            )
            HStack {
                Text(formatTime(played))
                    .font(Theme.Font.mono(10, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
                Spacer()
                Text(formatTime(total))
                    .font(Theme.Font.mono(10, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    private var playPauseButton: some View {
        Button {
            Haptics.medium()
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
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .frame(width: 44, height: 44)
                .background(Theme.Color.backgroundSurface, in: Circle())
                .opacity(disabled ? 0.35 : 1.0)
        }
        .disabled(disabled)
        .buttonStyle(.pressable)
    }

    // MARK: - Navigation between clips

    private func next() {
        onClipComplete?(clip)
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
            VStack(alignment: .leading, spacing: 6) {
                if !line.speaker.isEmpty {
                    Text(line.speaker.uppercased())
                        .font(Theme.Font.caption(10, weight: .heavy))
                        .foregroundStyle(active ? Theme.Color.primary : Theme.Color.textMuted)
                        .tracking(0.8)
                }
                highlightedText
                    .font(Theme.Font.headline(active ? 18 : 16, weight: active ? .bold : .semibold))
                    .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: active)

                if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                    Text(tr)
                        .font(Theme.Font.body(13))
                        .foregroundStyle(active ? Theme.Color.textSecondary : Theme.Color.textMuted)
                        .lineSpacing(2)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(active ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(active ? Theme.Color.primary : Theme.Color.border, lineWidth: active ? 1.5 : 1)
            )
            .scaleEffect(active ? 1.02 : 1.0)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: active)
        }
        .buttonStyle(.pressable(scale: 0.98))
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
