import SwiftUI

/// Full-featured clip player: YouTube embed + synced subtitles + translation + controls.
///
/// Layout philosophy — **hero current line**:
///   • Video sits as a contained cinema card at top.
///   • The current subtitle is rendered huge, centered, as the main focus.
///   • Previous / next lines peek above and below as muted context.
///   • A floating glass control bar lives at the bottom with just the essentials.
///   • Target lines pause once with explicit Listen again / Continue choices.
struct ClipPlayerView: View {
    let clips: [LessonClip]
    var onClipComplete: ((LessonClip) -> Void)? = nil
    var onFinish: (() -> Void)? = nil

    @State private var index: Int = 0
    @State private var currentTime: Double = 0
    @State private var isPlaying = false
    @State private var showTranslation = true
    @State private var command: YouTubePlayerView.PlayerCommand? = nil
    @State private var pausedTargets: Set<Int> = []
    @State private var targetBanner: ClipLine? = nil
    @State private var showFullTranscript = false
    @EnvironmentObject var appState: AppState

    private var clip: LessonClip { clips[index] }
    private var totalClips: Int { clips.count }
    private var currentLineIndex: Int? {
        clip.lines.firstIndex(where: { currentTime >= $0.startTime && currentTime <= $0.endTime })
    }
    private var currentLine: ClipLine? {
        currentLineIndex.flatMap { clip.lines[$0] }
    }
    private var previousLine: ClipLine? {
        guard let i = currentLineIndex, i > 0 else { return nil }
        return clip.lines[i - 1]
    }
    private var nextLine: ClipLine? {
        guard let i = currentLineIndex, i < clip.lines.count - 1 else { return nil }
        return clip.lines[i + 1]
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            backdrop
            content
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(false)
        .sheet(isPresented: $showFullTranscript) {
            TranscriptSheet(
                clip: clip,
                currentLineIndex: currentLineIndex,
                showTranslation: showTranslation,
                onSelect: { line in
                    command = .seek(line.startTime)
                    if !isPlaying { command = .play }
                    showFullTranscript = false
                }
            )
            .presentationDetents([.medium, .large])
            .presentationBackground(.ultraThinMaterial)
        }
        .onChange(of: clip.id) { _, _ in
            currentTime = clip.startTime
            command = .reload
            pausedTargets = []
            targetBanner = nil
        }
    }

    // MARK: - Backdrop (soft color wash from the movie thumbnail)

    private var backdrop: some View {
        GeometryReader { geo in
            ZStack {
                Theme.Color.background
                AsyncImage(url: URL(string: "https://i.ytimg.com/vi/\(clip.youtubeVideoId)/hqdefault.jpg")) { phase in
                    if case .success(let image) = phase {
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(width: geo.size.width, height: geo.size.width * 0.9)
                            .blur(radius: 90)
                            .opacity(0.42)
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                }
                LinearGradient(
                    colors: [
                        Color.black.opacity(0.0),
                        Color.black.opacity(0.65),
                        Theme.Color.background
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Content stack

    private var content: some View {
        VStack(spacing: 0) {
            topBar
            videoCard
            heroStack
            Spacer(minLength: 0)
            bottomControls
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(alignment: .center) {
            Button {
                Haptics.light()
                onFinish?()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .buttonStyle(.pressable)
            Spacer()
            VStack(spacing: 1) {
                Text(clip.movieTitle.uppercased())
                    .font(Theme.Font.caption(10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.textMuted)
                Text("Scene \(index + 1) of \(totalClips)")
                    .font(Theme.Font.caption(12, weight: .semibold))
                    .foregroundStyle(Theme.Color.textPrimary)
            }
            Spacer()
            Button {
                Haptics.selection()
                showTranslation.toggle()
            } label: {
                Image(systemName: showTranslation ? "text.bubble.fill" : "text.bubble")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(showTranslation ? Theme.Color.primary : .white.opacity(0.85))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .buttonStyle(.pressable)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    // MARK: - Video card

    private var videoCard: some View {
        YouTubePlayerView(
            videoId: clip.youtubeVideoId,
            startTime: clip.startTime,
            endTime: clip.endTime,
            autoplay: true,
            isPlaying: $isPlaying,
            currentTime: { t in
                self.currentTime = t
                checkTargetPause(at: t)
            },
            onReady: { isPlaying = true },
            onEnded: { next() },
            command: $command
        )
        .aspectRatio(16.0/9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.45), radius: 22, x: 0, y: 12)
        .padding(.horizontal, 16)
    }

    // MARK: - Hero subtitle stack

    private var heroStack: some View {
        VStack(spacing: 0) {
            if let banner = targetBanner {
                targetChoice(for: banner)
                    .padding(.top, 24)
                    .padding(.horizontal, 16)
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom).combined(with: .opacity),
                        removal: .opacity
                    ))
            } else {
                peekLine(previousLine, placement: .previous)
                    .padding(.top, 14)
                heroLine
                    .padding(.vertical, 6)
                peekLine(nextLine, placement: .next)
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.85), value: currentLineIndex)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: targetBanner?.id)
        .padding(.horizontal, 16)
    }

    private var heroLine: some View {
        Group {
            if let line = currentLine {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        if !line.speaker.isEmpty {
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(Theme.Color.primary)
                                    .frame(width: 6, height: 6)
                                Text(line.speaker)
                                    .font(Theme.Font.caption(10, weight: .heavy))
                                    .tracking(1.0)
                                    .foregroundStyle(Theme.Color.textSecondary)
                                    .textCase(.uppercase)
                            }
                        }
                        if line.isTarget == true {
                            Text("TARGET")
                                .font(Theme.Font.caption(9, weight: .heavy))
                                .tracking(1.2)
                                .foregroundStyle(Theme.Color.accent)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Theme.Color.accent.opacity(0.15)))
                        }
                        Spacer(minLength: 0)
                        Button {
                            Haptics.selection()
                            command = .seek(line.startTime)
                            if !isPlaying { command = .play }
                        } label: {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.Color.textSecondary)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(Color.white.opacity(0.08)))
                        }
                        .buttonStyle(.pressable)
                    }

                    heroText(for: line)

                    if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                        Text(tr)
                            .font(Theme.Font.body(15))
                            .foregroundStyle(Theme.Color.textMuted)
                            .lineSpacing(3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                )
            } else {
                // No active line — show a placeholder focus card.
                VStack(spacing: 6) {
                    Image(systemName: "waveform")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                    Text("Listening…")
                        .font(Theme.Font.body(14))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
            }
        }
    }

    @ViewBuilder
    private func heroText(for line: ClipLine) -> some View {
        let attributed = buildAttributedHero(line: line)
        Text(attributed)
            .font(.system(size: 24, weight: .semibold, design: .default))
            .foregroundStyle(Theme.Color.textPrimary)
            .tracking(-0.3)
            .lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Word-level highlight: bolds the currently-spoken word and tints it primary.
    private func buildAttributedHero(line: ClipLine) -> AttributedString {
        var out = AttributedString(line.text)
        guard let active = line.words.first(where: { currentTime >= $0.startTime && currentTime <= $0.endTime }),
              let range = out.range(of: active.word, options: .caseInsensitive)
        else { return out }
        out[range].foregroundColor = Theme.Color.primary
        out[range].inlinePresentationIntent = .stronglyEmphasized
        return out
    }

    // MARK: - Peek lines (prev / next context)

    private enum PeekPlacement { case previous, next }

    @ViewBuilder
    private func peekLine(_ line: ClipLine?, placement: PeekPlacement) -> some View {
        if let line = line {
            Button {
                Haptics.selection()
                command = .seek(line.startTime)
                if !isPlaying { command = .play }
            } label: {
                HStack(spacing: 8) {
                    if placement == .previous {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                    Text(line.text)
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if placement == .next {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable(scale: 0.99))
        }
    }

    // MARK: - Target choice card

    private func targetChoice(for line: ClipLine) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "target")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
                Text("Target line")
                    .font(Theme.Font.caption(11, weight: .heavy))
                    .tracking(1.0)
                    .foregroundStyle(Theme.Color.accent)
                    .textCase(.uppercase)
            }
            Text("\u{201C}\(line.text)\u{201D}")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                Text(tr)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            HStack(spacing: 10) {
                Button {
                    Haptics.medium()
                    listenAgain(line)
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 13, weight: .bold))
                        Text("Listen again")
                            .font(Theme.Font.headline(14, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Color.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.pressable)

                Button {
                    Haptics.medium()
                    continueFromTarget()
                } label: {
                    HStack(spacing: 7) {
                        Text("Continue")
                            .font(Theme.Font.headline(14, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Theme.Color.primary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .shadow(color: Theme.Color.primary.opacity(0.45), radius: 14, x: 0, y: 6)
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Theme.Color.accent.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Bottom controls (floating glass pill)

    private var bottomControls: some View {
        VStack(spacing: 14) {
            progressBar
            controlsRow
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 24)
    }

    private var progressBar: some View {
        let total = max(clip.duration, 1)
        let played = max(0, currentTime - clip.startTime)
        return VStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.12))
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
                Button {
                    Haptics.light()
                    showFullTranscript = true
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "list.bullet")
                            .font(.system(size: 10, weight: .bold))
                        Text("All lines")
                            .font(Theme.Font.caption(11, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer()
                Text(formatTime(total))
                    .font(Theme.Font.mono(11, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    private var controlsRow: some View {
        HStack(spacing: 18) {
            controlIcon("backward.end.fill", action: previous, disabled: index == 0)
            controlIcon("chevron.left") { seekToLine(offset: -1) }
            playButton
            controlIcon("chevron.right") { seekToLine(offset: 1) }
            controlIcon("forward.end.fill", action: next, disabled: index >= totalClips - 1)
        }
        .frame(maxWidth: .infinity)
    }

    private var playButton: some View {
        Button {
            Haptics.medium()
            if targetBanner != nil { targetBanner = nil }
            command = isPlaying ? .pause : .play
        } label: {
            ZStack {
                Circle()
                    .fill(Theme.Color.primary)
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
                    .offset(x: isPlaying ? 0 : 2)
            }
            .frame(width: 62, height: 62)
            .shadow(color: Theme.Color.primary.opacity(0.5), radius: 16, x: 0, y: 8)
        }
        .buttonStyle(.pressable)
    }

    private func controlIcon(_ name: String,
                             action: @escaping () -> Void = {},
                             disabled: Bool = false) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: name)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.white.opacity(0.07)))
                .opacity(disabled ? 0.3 : 1.0)
        }
        .disabled(disabled)
        .buttonStyle(.pressable)
    }

    // MARK: - Actions

    private func seekToLine(offset: Int) {
        guard !clip.lines.isEmpty else { return }
        let baseIndex = currentLineIndex ?? 0
        let target = baseIndex + offset
        guard (0..<clip.lines.count).contains(target) else { return }
        let line = clip.lines[target]
        command = .seek(line.startTime)
        if !isPlaying { command = .play }
    }

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

    // MARK: - Target-line stop behavior

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
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            targetBanner = target
        }
    }

    private func listenAgain(_ line: ClipLine) {
        pausedTargets.remove(line.id)
        withAnimation(.easeOut(duration: 0.2)) { targetBanner = nil }
        currentTime = line.startTime
        command = .loop(line.startTime, line.endTime)
    }

    private func continueFromTarget() {
        withAnimation(.easeOut(duration: 0.2)) { targetBanner = nil }
        command = .play
    }

    private func formatTime(_ t: Double) -> String {
        let secs = Int(t.rounded())
        return String(format: "%d:%02d", secs / 60, secs % 60)
    }
}

// MARK: - Transcript sheet (all lines, summoned via "All lines")

private struct TranscriptSheet: View {
    let clip: LessonClip
    let currentLineIndex: Int?
    let showTranslation: Bool
    let onSelect: (ClipLine) -> Void

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(clip.lines.enumerated()), id: \.element.id) { idx, line in
                            row(idx: idx, line: line, active: currentLineIndex == idx)
                                .id("line-\(idx)")
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 6)
                    .padding(.bottom, 24)
                }
                .onAppear {
                    if let i = currentLineIndex {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            proxy.scrollTo("line-\(i)", anchor: .center)
                        }
                    }
                }
            }
            .navigationTitle(clip.movieTitle)
            .navigationBarTitleDisplayMode(.inline)
        }
        .preferredColorScheme(.dark)
    }

    private func row(idx: Int, line: ClipLine, active: Bool) -> some View {
        Button {
            Haptics.selection()
            onSelect(line)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(active ? Theme.Color.primary : Color.clear)
                    .frame(width: 3)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if !line.speaker.isEmpty {
                            Text(line.speaker.uppercased())
                                .font(Theme.Font.caption(9, weight: .heavy))
                                .tracking(0.7)
                                .foregroundStyle(Theme.Color.textMuted)
                        }
                        if line.isTarget == true {
                            Text("TARGET")
                                .font(Theme.Font.caption(9, weight: .heavy))
                                .tracking(0.8)
                                .foregroundStyle(Theme.Color.accent)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(Theme.Color.accent.opacity(0.15)))
                        }
                    }
                    Text(line.text)
                        .font(Theme.Font.headline(15, weight: active ? .semibold : .regular))
                        .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textSecondary)
                    if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                        Text(tr)
                            .font(Theme.Font.body(12))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable(scale: 0.99))
    }
}
