import SwiftUI

// MARK: - Patterns tab — sequential learning path of pattern nodes

struct PatternsView: View {
    @EnvironmentObject var appState: AppState
    @State private var selected: Pattern? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundAmbience()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        hero
                            .padding(.horizontal, 20)
                            .padding(.top, 56)

                        legend
                            .padding(.horizontal, 20)

                        PatternsPath(
                            patterns: PatternCatalog.all,
                            isCompleted: { appState.isPatternCompleted($0) },
                            onTap: { selected = $0 }
                        )
                        .padding(.top, 12)

                        Spacer().frame(height: 140)
                    }
                }
            }
            .navigationDestination(item: $selected) { pattern in
                PatternIntroView(pattern: pattern)
                    .environmentObject(appState)
            }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("CÜMLE KALIPLARI")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(2)
                .foregroundStyle(Theme.Color.accent)

            Text("Kalıplar")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)

            Text("Kalıbı öğren, içine kelime koy — cümle hazır.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.textSecondary)
                .lineSpacing(3)
                .padding(.top, 2)
        }
    }

    // MARK: - Legend (3-color key)

    private var legend: some View {
        HStack(spacing: 10) {
            legendChip("özne", color: PatternSlotKind.subject.color)
            legendChip("fiil", color: PatternSlotKind.verb.color)
            legendChip("tamamlayıcı", color: PatternSlotKind.rest.color)
            Spacer(minLength: 0)
        }
    }

    private func legendChip(_ label: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 11, weight: .heavy))
                .tracking(0.4)
                .foregroundStyle(Theme.Color.textSecondary)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(Theme.Color.backgroundCard.opacity(0.7))
        )
        .overlay(
            Capsule().strokeBorder(color.opacity(0.4), lineWidth: 1)
        )
    }
}

// MARK: - Path layout (mirrors LearningPathView's curved-zigzag node walk)

struct PatternsPath: View {
    let patterns: [Pattern]
    var isCompleted: (String) -> Bool
    var onTap: (Pattern) -> Void

    private let nodeSpacing: CGFloat = 116
    private let amplitude: CGFloat = 64

    var body: some View {
        let pathColor = Theme.Color.primary
        let nodes = buildNodes()
        let totalHeight = max(CGFloat(patterns.count), 1) * nodeSpacing + 30

        ZStack(alignment: .top) {
            PatternsPathRoad(nodes: nodes, color: pathColor)
                .frame(height: totalHeight)

            ForEach(Array(nodes.enumerated()), id: \.element.pattern.id) { idx, node in
                PatternsPathNodeView(
                    pattern: node.pattern,
                    state: node.state,
                    isCurrent: node.isCurrent,
                    color: pathColor,
                    nodeIndex: idx + 1,
                    onTap: { onTap(node.pattern) }
                )
                .position(x: node.x, y: node.y)
            }
        }
        .frame(height: totalHeight)
    }

    private func buildNodes() -> [PatternsPathNodeData] {
        var nodes: [PatternsPathNodeData] = []
        let centerX = UIScreen.main.bounds.width / 2
        var foundCurrent = false

        for (idx, pattern) in patterns.enumerated() {
            let phase = Double(idx) * .pi / 2.4
            let offset = sin(phase) * amplitude
            let y = CGFloat(idx) * nodeSpacing + 60

            let state: PatternsPathNodeData.State = {
                if isCompleted(pattern.id) { return .completed }
                // Patterns wired up to a video akış are always entry-able
                // — the user can dive into any of them in any order rather
                // than having to grind through them sequentially. The
                // sequential gate still applies to rows that don't have
                // a video pool yet (videoStructureId == nil), so they
                // stay locked until earlier ones are completed.
                if pattern.videoStructureId != nil { return .available }
                if idx == 0 { return .available }
                let prev = patterns[idx - 1]
                if isCompleted(prev.id) { return .available }
                return .locked
            }()

            let isCurrent = state == .available && !foundCurrent
            if isCurrent { foundCurrent = true }

            nodes.append(PatternsPathNodeData(
                pattern: pattern,
                x: centerX + CGFloat(offset),
                y: y,
                state: state,
                isCurrent: isCurrent
            ))
        }
        return nodes
    }
}

struct PatternsPathNodeData {
    enum State { case locked, available, completed }
    let pattern: Pattern
    let x: CGFloat
    let y: CGFloat
    let state: State
    let isCurrent: Bool
}

// MARK: - Curved road

struct PatternsPathRoad: View {
    let nodes: [PatternsPathNodeData]
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(Array(segments().enumerated()), id: \.offset) { _, seg in
                    segmentPath(from: seg.start, to: seg.end, control: seg.control)
                        .stroke(
                            strokeColor(for: seg.state),
                            style: StrokeStyle(
                                lineWidth: seg.state == .locked ? 1.5 : 3,
                                lineCap: .round,
                                dash: seg.state == .locked ? [4, 7] : []
                            )
                        )
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    private func segmentPath(from a: CGPoint, to b: CGPoint, control: CGPoint) -> Path {
        var p = Path()
        p.move(to: a)
        p.addQuadCurve(to: b, control: control)
        return p
    }

    private func strokeColor(for state: Segment.State) -> Color {
        switch state {
        case .completed: return color.opacity(0.7)
        case .available: return color.opacity(0.35)
        case .locked:    return Theme.Color.border
        }
    }

    private struct Segment {
        enum State { case locked, available, completed }
        let start: CGPoint
        let end: CGPoint
        let control: CGPoint
        let state: State
    }

    private func segments() -> [Segment] {
        guard nodes.count > 1 else { return [] }
        var out: [Segment] = []
        for i in 0..<(nodes.count - 1) {
            let a = nodes[i], b = nodes[i + 1]
            let midY = (a.y + b.y) / 2
            let controlX = (a.x + b.x) / 2
            let dir: CGFloat = (b.x - a.x) < 0 ? -1 : 1
            let control = CGPoint(x: controlX + dir * 24, y: midY)

            let state: Segment.State = {
                if a.state == .completed && b.state == .completed { return .completed }
                if a.state == .completed { return .available }
                if b.state == .locked { return .locked }
                return .available
            }()

            out.append(Segment(
                start: CGPoint(x: a.x, y: a.y),
                end: CGPoint(x: b.x, y: b.y),
                control: control,
                state: state
            ))
        }
        return out
    }
}

// MARK: - Single path node

struct PatternsPathNodeView: View {
    let pattern: Pattern
    let state: PatternsPathNodeData.State
    let isCurrent: Bool
    let color: Color
    let nodeIndex: Int
    let onTap: () -> Void

    var body: some View {
        Button {
            guard state != .locked else { return }
            Haptics.medium()
            onTap()
        } label: {
            VStack(spacing: 8) {
                circle
                label
            }
        }
        .buttonStyle(.pressable(scale: 0.94))
        .disabled(state == .locked)
        .frame(width: 170)
    }

    @ViewBuilder
    private var circle: some View {
        ZStack {
            if isCurrent {
                Circle()
                    .strokeBorder(color.opacity(0.25), lineWidth: 1)
                    .frame(width: 76, height: 76)
            }

            ZStack {
                Circle().fill(interiorFill)
                Circle()
                    .strokeBorder(borderColor, lineWidth: borderWidth)
                icon
            }
            .frame(width: circleSize, height: circleSize)
        }
        .frame(height: 76)
    }

    @ViewBuilder
    private var icon: some View {
        switch state {
        case .locked:
            Image(systemName: "lock.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.textDisabled)
        case .completed:
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(.white)
        case .available:
            Image(systemName: pattern.icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(iconColor)
        }
    }

    @ViewBuilder
    private var label: some View {
        VStack(spacing: 3) {
            Text(pattern.titleTr)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(titleColor)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)

            if isCurrent {
                HStack(spacing: 3) {
                    Circle().fill(color).frame(width: 4, height: 4)
                    Text("ŞU AN")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(0.8)
                        .foregroundStyle(color)
                }
                .padding(.top, 1)
            } else if state == .completed {
                Text("BİTTİ")
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    // MARK: state-derived styling

    private var circleSize: CGFloat {
        state == .locked ? 44 : 60
    }

    private var interiorFill: Color {
        switch state {
        case .locked: return Theme.Color.backgroundCard
        case .completed: return color
        case .available: return isCurrent ? color.opacity(0.12) : Theme.Color.backgroundCard
        }
    }

    private var borderColor: Color {
        switch state {
        case .locked: return Theme.Color.border
        case .completed: return color.opacity(0.4)
        case .available: return isCurrent ? color : color.opacity(0.4)
        }
    }

    private var borderWidth: CGFloat {
        switch state {
        case .completed: return 0
        case .available: return isCurrent ? 2 : 1.5
        case .locked: return 1
        }
    }

    private var iconColor: Color {
        isCurrent ? color : color.opacity(0.85)
    }

    private var titleColor: Color {
        switch state {
        case .locked: return Theme.Color.textMuted
        case .available: return isCurrent ? Theme.Color.textPrimary : Theme.Color.textSecondary
        case .completed: return Theme.Color.textSecondary
        }
    }
}

// MARK: - Color-coded formula row (shared with intro / akış)

struct FormulaRow: View {
    let tokens: [PatternToken]
    var size: CGFloat = 14

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(tokens.enumerated()), id: \.element.id) { idx, token in
                FormulaChip(token: token, size: size)
                if idx < tokens.count - 1 {
                    Image(systemName: "plus")
                        .font(.system(size: size * 0.6, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct FormulaChip: View {
    let token: PatternToken
    var size: CGFloat = 14

    var body: some View {
        Text(token.text)
            .font(.system(
                size: size,
                weight: token.isPlaceholder ? .semibold : .heavy,
                design: token.isPlaceholder ? .default : .rounded
            ))
            .italic(token.isPlaceholder)
            .foregroundStyle(token.kind.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(token.kind.color.opacity(0.14))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(token.kind.color.opacity(0.32), lineWidth: 1)
            )
    }
}
