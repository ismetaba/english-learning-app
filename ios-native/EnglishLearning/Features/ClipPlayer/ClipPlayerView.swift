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
    var onFinish: (() -> Void)? = nil

    @State private var index: Int = 0
    @State private var currentTime: Double = 0
    @State private var isPlaying = false
    @State private var showTranslation = true
    @State private var command: YouTubePlayerView.PlayerCommand? = nil
    @State private var pausedTargets: Set<Int> = []
    @State private var targetBanner: ClipLine? = nil
    @State private var isLooping = false
    @State private var speed: Double = 1.0
    @State private var loopRange: (Double, Double)? = nil
    @EnvironmentObject var appState: AppState

    private var clip: LessonClip { clips[index] }
    private var totalClips: Int { clips.count }
    private var currentLineIndex: Int? {
        clip.lines.firstIndex(where: { currentTime >= $0.startTime && currentTime <= $0.endTime })
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
            pausedTargets = []
            targetBanner = nil
            loopRange = nil
        }
    }

    // MARK: - Video block

    private var videoBlock: some View {
        ZStack {
            // YouTube embed
            YouTubePlayerView(
                videoId: clip.youtubeVideoId,
                startTime: clip.startTime,
                endTime: clip.endTime,
                autoplay: true,
                isPlaying: $isPlaying,
                currentTime: { t in
                    self.currentTime = t
                    if let loop = loopRange, t >= loop.1 {
                        command = .seek(loop.0)
                    }
                    checkTargetPause(at: t)
                },
                onReady: { isPlaying = true },
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

            // Top chrome (back + title + CC + expand)
            VStack {
                topChrome
                Spacer()
                // REC chip
                recChip
                    .padding(.bottom, 14)
            }

            // Tap to toggle play/pause (excluding the chrome zone)
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    Haptics.medium()
                    command = isPlaying ? .pause : .play
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
            // Back button
            Button {
                Haptics.light()
                onFinish?()
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

            // CC (captions) toggle
            Button {
                Haptics.selection()
                showTranslation.toggle()
            } label: {
                Image(systemName: "captions.bubble\(showTranslation ? ".fill" : "")")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(showTranslation ? Color(hex: 0x06D6B0) : .white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            // Expand icon (placeholder for future fullscreen)
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white.opacity(0.9))
                .frame(width: 34, height: 34)
                .background(Circle().fill(Color(hex: 0x080A14, opacity: 0.55)))
                .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
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
            subtitleHeader
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 10)

            if let banner = targetBanner {
                targetChoice(for: banner)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)
            } else {
                transcriptScroll
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Scrollable transcript that fills the remaining screen space. Each line
    /// renders either as a dimmed context line or, when active, as the
    /// "currentLineBlock" with accent rail + karaoke. Scroll position
    /// auto-tracks the active line, placing it at ~40% from the top of the
    /// scrollable area (just above center) so upcoming lines dominate the view.
    private var transcriptScroll: some View {
        GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Top padding so the first line can scroll to the anchor position.
                        Color.clear.frame(height: geo.size.height * 0.15)
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
                        LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                            .frame(height: 20)
                        Rectangle().fill(.black)
                        LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                            .frame(height: 140)
                    }
                )
                .onChange(of: currentLineIndex) { _, newValue in
                    guard let i = newValue else { return }
                    withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                        proxy.scrollTo("line-\(i)", anchor: UnitPoint(x: 0.5, y: 0.4))
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
                VStack(alignment: .leading, spacing: 4) {
                    Text(line.text)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x94A0C4))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                        Text(tr)
                            .font(.system(size: 12))
                            .italic()
                            .foregroundStyle(Color(hex: 0x5E6B8A))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .opacity(opacity)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable(scale: 0.99))
    }

    private var subtitleHeader: some View {
        HStack(alignment: .center) {
            HStack(spacing: 4) {
                Text("SUBTITLES")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.5)
                    .foregroundStyle(Color(hex: 0x06D6B0))
                Text("· line \((currentLineIndex ?? 0) + 1) / \(clip.lines.count)")
                    .font(.system(size: 10, weight: .medium))
                    .tracking(0.5)
                    .foregroundStyle(Color(hex: 0x5E6B8A))
            }
            Spacer(minLength: 0)
            Text(formatTime(currentTime - clip.startTime))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color(hex: 0x5E6B8A))
        }
    }

    private enum ContextPlacement { case previous, next }

    private func contextLine(_ line: ClipLine, placement: ContextPlacement) -> some View {
        Button(action: {
            Haptics.selection()
            command = .seek(line.startTime)
            if !isPlaying { command = .play }
        }) {
            HStack(alignment: .top, spacing: 12) {
                Text(formatTime(line.startTime - clip.startTime))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(hex: 0x5E6B8A))
                    .frame(width: 36, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text(line.text)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x94A0C4))
                        .lineLimit(2)
                    if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                        Text(tr)
                            .font(.system(size: 12))
                            .italic()
                            .foregroundStyle(Color(hex: 0x5E6B8A))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: placement == .previous ? "chevron.up" : "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color(hex: 0x5E6B8A))
            }
            .opacity(0.55)
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
                if !line.speaker.isEmpty || line.isTarget == true {
                    HStack(spacing: 8) {
                        if !line.speaker.isEmpty {
                            Text(line.speaker.uppercased())
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(1.3)
                                .foregroundStyle(Color(hex: 0x8577FF))
                        }
                        if line.isTarget == true {
                            Text("TARGET")
                                .font(.system(size: 9, weight: .heavy))
                                .tracking(1.3)
                                .foregroundStyle(Color(hex: 0x06D6B0))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(Color(hex: 0x06D6B0, opacity: 0.15)))
                        }
                    }
                }
                Text(karaokeAttributed(for: line))
                    .font(.system(size: 20, weight: .bold))
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.18), value: currentTime)

                if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                    Text(tr)
                        .font(.system(size: 13))
                        .italic()
                        .foregroundStyle(Color(hex: 0x94A0C4))
                        .lineSpacing(2)
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

    /// Karaoke line. Starts from line.text so no words are lost when the
    /// word list is sparse, then mutes upcoming words and colors the active
    /// word cyan with an underline.
    private func karaokeAttributed(for line: ClipLine) -> AttributedString {
        var out = AttributedString(line.text)
        out.foregroundColor = Color(hex: 0xF1F3FF)

        // Mute words that haven't been spoken yet (have a startTime > currentTime).
        for w in line.words where currentTime < w.startTime {
            if let r = out.range(of: w.word, options: .caseInsensitive) {
                out[r].foregroundColor = Color(hex: 0x5E6B8A)
            }
        }
        // Highlight the currently-spoken word, if any.
        if let active = line.words.first(where: { currentTime >= $0.startTime && currentTime < $0.endTime }),
           let r = out.range(of: active.word, options: .caseInsensitive) {
            out[r].foregroundColor = Color(hex: 0x06D6B0)
            out[r].underlineStyle = .single
        }
        return out
    }

    // MARK: - Target choice card

    private func targetChoice(for line: ClipLine) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "target")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Color(hex: 0x06D6B0))
                Text("TARGET LINE")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.3)
                    .foregroundStyle(Color(hex: 0x06D6B0))
            }
            Text("\u{201C}\(line.text)\u{201D}")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color(hex: 0xF1F3FF))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if showTranslation, let tr = line.translationTr, !tr.isEmpty {
                Text(tr)
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(Color(hex: 0x94A0C4))
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
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(Color(hex: 0xF1F3FF))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(hex: 0x1A2238), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(hex: 0x1E2A42), lineWidth: 1))
                }
                .buttonStyle(.pressable)

                Button {
                    Haptics.medium()
                    continueFromTarget()
                } label: {
                    HStack(spacing: 6) {
                        Text("Continue")
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(hex: 0x8577FF), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .shadow(color: Color(hex: 0x8577FF, opacity: 0.45), radius: 10, x: 0, y: 4)
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: 0x111827))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color(hex: 0x06D6B0, opacity: 0.35), lineWidth: 1)
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
                if targetBanner != nil { targetBanner = nil }
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
        String(format: "%.2f×", speed)
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
        switch speed {
        case 1.0: speed = 1.25
        case 1.25: speed = 0.75
        default: speed = 1.0
        }
        // Note: YouTube iframe API supports setPlaybackRate — wiring that is
        // TODO; the chip reflects intent for now.
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

    // MARK: - Target-line auto-pause

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
        let s = max(0, Int(t.rounded()))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}
