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
            ambientBackdrop
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

    // MARK: - Ambient backdrop

    /// Soft color wash that makes the screen feel lit from the video rather than
    /// flat black. Uses the movie's YouTube thumbnail, heavily blurred + dimmed.
    private var ambientBackdrop: some View {
        GeometryReader { geo in
            AsyncImage(url: URL(string: "https://i.ytimg.com/vi/\(clip.youtubeVideoId)/hqdefault.jpg")) { phase in
                if case .success(let image) = phase {
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width * 1.4, height: geo.size.height * 0.8)
                        .blur(radius: 80)
                        .opacity(0.35)
                        .offset(y: -geo.size.height * 0.15)
                } else {
                    Color.clear
                }
            }
            .overlay(
                LinearGradient(
                    colors: [
                        Color.black.opacity(0.55),
                        Color.black.opacity(0.9),
                        Theme.Color.background
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
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
                HStack(alignment: .center) {
                    Button {
                        Haptics.light()
                        onFinish?()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(
                                Circle()
                                    .fill(.ultraThinMaterial)
                                    .overlay(Circle().strokeBorder(.white.opacity(0.15), lineWidth: 1))
                            )
                    }
                    .buttonStyle(.pressable)
                    Spacer()
                    sceneDots
                }
                .padding(.horizontal, 14)
                .padding(.top, 14)
            }
            // slim gradient underline — cinematic accent anchoring the video to the surface below
            LinearGradient(
                colors: [
                    Theme.Color.primary.opacity(0.0),
                    Theme.Color.primary.opacity(0.6),
                    Theme.Color.accent.opacity(0.5),
                    Theme.Color.primary.opacity(0.0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(height: 2)
            .blur(radius: 0.5)
        }
    }

    /// Segmented dots showing the current clip position — replaces the plain "1 / 10" chip.
    private var sceneDots: some View {
        HStack(spacing: 4) {
            ForEach(0..<totalClips, id: \.self) { i in
                Capsule()
                    .fill(i == index ? Color.white : Color.white.opacity(0.35))
                    .frame(width: i == index ? 18 : 6, height: 4)
                    .animation(.spring(response: 0.35, dampingFraction: 0.85), value: index)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().strokeBorder(.white.opacity(0.15), lineWidth: 1))
        )
    }

    // MARK: - Controls & subtitle surface

    private var controlsSurface: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        subtitleStack(proxy: proxy)
                        if clip.lines.count <= 2 {
                            sceneInfoFooter
                        }
                        Spacer().frame(height: 140)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
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
        HStack(alignment: .center, spacing: 14) {
            // Movie poster thumbnail
            AsyncImage(url: URL(string: "https://i.ytimg.com/vi/\(clip.youtubeVideoId)/mqdefault.jpg")) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFill()
                } else {
                    Theme.Color.backgroundElevated
                }
            }
            .frame(width: 54, height: 54)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .strokeBorder(.white.opacity(0.08), lineWidth: 1)
            )
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "play.fill")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Theme.Color.primary))
                    .overlay(Circle().strokeBorder(Theme.Color.background, lineWidth: 2))
                    .offset(x: 4, y: 4)
            }
            .premiumShadow(.small)

            VStack(alignment: .leading, spacing: 2) {
                Text(clip.movieTitle.uppercased())
                    .font(Theme.Font.caption(10, weight: .heavy))
                    .foregroundStyle(Theme.Color.primaryLight)
                    .tracking(1.2)
                Text("Scene \(index + 1)")
                    .font(Theme.Font.display(22, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.4)
                Text("\(clip.lines.count) line\(clip.lines.count == 1 ? "" : "s") · \(formatTime(clip.duration))")
                    .font(Theme.Font.caption(11, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            Spacer(minLength: 0)

            Button {
                Haptics.selection()
                showTranslation.toggle()
            } label: {
                Image(systemName: showTranslation ? "eye.slash.fill" : "eye.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(showTranslation ? Theme.Color.primary : Theme.Color.textSecondary)
                    .frame(width: 38, height: 38)
                    .background(
                        Circle()
                            .fill(showTranslation ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
                    )
                    .overlay(
                        Circle().strokeBorder(
                            showTranslation ? Theme.Color.borderAccent : Theme.Color.border,
                            lineWidth: 1
                        )
                    )
            }
            .buttonStyle(.pressable)
        }
    }

    /// Shown for scenes with 1-2 lines to prevent awkward empty space and give
    /// users something to look at — surfaces a gentle learning hint.
    private var sceneInfoFooter: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(Theme.Color.accentSoft)
                Image(systemName: "hand.tap.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.accent)
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text("Tap any line to loop it")
                    .font(Theme.Font.headline(14, weight: .semibold))
                    .foregroundStyle(Theme.Color.textPrimary)
                Text("Replay individual subtitles until the pronunciation sticks.")
                    .font(Theme.Font.body(12))
                    .foregroundStyle(Theme.Color.textMuted)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
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
                            .font(.system(size: 13, weight: .heavy))
                        Text("Replay line")
                            .font(Theme.Font.caption(12, weight: .heavy))
                    }
                    .foregroundStyle(Theme.Color.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Theme.Color.accentSoft, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.accent.opacity(0.3), lineWidth: 1))
                }
                .buttonStyle(.pressable)
                .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 26)
        .background(
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                Rectangle()
                    .fill(Theme.Color.background.opacity(0.55))
            }
        )
        .overlay(
            LinearGradient(
                colors: [
                    Theme.Color.primary.opacity(0.35),
                    Theme.Color.border.opacity(0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(height: 1),
            alignment: .top
        )
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: currentTimeLineIndex)
    }

    private var progressSlider: some View {
        let total = max(clip.duration, 1)
        let played = max(0, currentTime - clip.startTime)
        return VStack(spacing: 6) {
            ProgressBar(
                percent: Double(played / total) * 100,
                height: 5,
                color: Theme.Color.primary,
                track: Theme.Color.backgroundSurface.opacity(0.6)
            )
            HStack {
                Text(formatTime(played))
                    .font(Theme.Font.mono(11, weight: .semibold))
                    .foregroundStyle(Theme.Color.textSecondary)
                Spacer()
                Text("−\(formatTime(max(0, total - played)))")
                    .font(Theme.Font.mono(11, weight: .semibold))
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

    private var lineProgress: Double {
        let span = max(0.0001, line.endTime - line.startTime)
        return min(1.0, max(0.0, (currentTime - line.startTime) / span))
    }

    var body: some View {
        Button(action: {
            Haptics.selection()
            onTap()
        }) {
            VStack(alignment: .leading, spacing: 10) {
                if !line.speaker.isEmpty {
                    speakerChip
                }
                highlightedText
                    .font(Theme.Font.headline(active ? 19 : 16, weight: active ? .bold : .semibold))
                    .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: active)

                if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                    Text(tr)
                        .font(Theme.Font.body(13))
                        .italic()
                        .foregroundStyle(active ? Theme.Color.textSecondary : Theme.Color.textMuted)
                        .lineSpacing(2)
                }

                // Progress underline while this line is the active one.
                if active {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Theme.Color.primary.opacity(0.15))
                            Capsule()
                                .fill(LinearGradient(
                                    colors: [Theme.Color.primary, Theme.Color.accent],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ))
                                .frame(width: geo.size.width * lineProgress)
                        }
                    }
                    .frame(height: 2)
                    .padding(.top, 2)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                        .fill(active ? Theme.Color.backgroundElevated : Theme.Color.backgroundCard.opacity(0.6))
                    if active {
                        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                            .fill(LinearGradient(
                                colors: [
                                    Theme.Color.primary.opacity(0.22),
                                    Theme.Color.primary.opacity(0.05)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                    }
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(
                        active ? Theme.Color.primary.opacity(0.65) : Theme.Color.border,
                        lineWidth: active ? 1.5 : 1
                    )
            )
            .shadow(
                color: active ? Theme.Color.primary.opacity(0.35) : .clear,
                radius: active ? 18 : 0,
                x: 0,
                y: active ? 6 : 0
            )
            .scaleEffect(active ? 1.02 : 1.0)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: active)
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private var speakerChip: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(active ? Theme.Color.primary : Theme.Color.textMuted)
                .frame(width: 6, height: 6)
            Text(line.speaker)
                .font(Theme.Font.caption(11, weight: .heavy))
                .foregroundStyle(active ? Theme.Color.primaryLight : Theme.Color.textMuted)
                .tracking(0.6)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(active ? Theme.Color.primarySoft : Theme.Color.backgroundSurface.opacity(0.5))
        )
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
