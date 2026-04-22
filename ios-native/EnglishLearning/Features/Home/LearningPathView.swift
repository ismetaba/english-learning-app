import SwiftUI

// MARK: - Winding learning path (Duolingo-style road)

struct LearningPathView: View {
    let unit: CurriculumUnit
    let orderIndex: Int
    var stage: (String) -> LessonStage?
    var subProgress: (String) -> LessonProgress
    var onTap: (CurriculumLesson) -> Void

    // Node spacing (y distance between successive lessons)
    private let nodeSpacing: CGFloat = 118
    private let amplitude: CGFloat = 78  // horizontal sway
    private let nodeSize: CGFloat = 78

    var body: some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        let nodes = buildNodes(unitColor: unitColor)
        let totalHeight = CGFloat(unit.lessons.count) * nodeSpacing + 40

        VStack(alignment: .leading, spacing: 18) {
            UnitBanner(unit: unit, orderIndex: orderIndex,
                       unitColor: unitColor,
                       doneCount: completedCount(),
                       totalCount: unit.lessons.count)

            ZStack(alignment: .top) {
                // Curved connecting road in the background
                PathRoad(nodes: nodes, color: unitColor)
                    .frame(height: totalHeight)

                // Nodes on top
                ForEach(Array(nodes.enumerated()), id: \.element.lesson.id) { idx, node in
                    PathNode(
                        lesson: node.lesson,
                        state: node.state,
                        isCurrent: node.isCurrent,
                        color: unitColor,
                        lessonNumber: idx + 1,
                        progress: subProgress(node.lesson.id),
                        onTap: { onTap(node.lesson) }
                    )
                    .position(x: node.x, y: node.y)
                }
            }
            .frame(height: totalHeight)
        }
    }

    private func completedCount() -> Int {
        unit.lessons.filter { stage($0.id) == .mastered }.count
    }

    // Build node metadata (position + state)
    private func buildNodes(unitColor: Color) -> [PathNodeData] {
        var nodes: [PathNodeData] = []
        let centerX: CGFloat = UIScreen.main.bounds.width / 2
        var foundCurrent = false

        for (idx, lesson) in unit.lessons.enumerated() {
            // Zigzag offset: 0, +amp, 0, -amp pattern via sine wave
            let phase = Double(idx) * .pi / 2.2
            let offset = sin(phase) * amplitude
            let y = CGFloat(idx) * nodeSpacing + nodeSize / 2 + 16

            let lessonStage = stage(lesson.id)
            let state: PathNodeData.State = {
                if lessonStage == .mastered { return .completed }
                if idx == 0 { return .available }
                let prev = unit.lessons[idx - 1]
                if stage(prev.id) == .mastered { return .available }
                return .locked
            }()

            let isCurrent = state == .available && !foundCurrent
            if isCurrent { foundCurrent = true }

            nodes.append(PathNodeData(
                lesson: lesson,
                x: centerX + CGFloat(offset),
                y: y,
                state: state,
                isCurrent: isCurrent
            ))
        }
        return nodes
    }
}

struct PathNodeData {
    enum State { case locked, available, completed }
    let lesson: CurriculumLesson
    let x: CGFloat
    let y: CGFloat
    let state: State
    let isCurrent: Bool
}

// MARK: - The road itself

struct PathRoad: View {
    let nodes: [PathNodeData]
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Locked/unlocked segments drawn individually so we can style by state
                ForEach(Array(segments().enumerated()), id: \.offset) { idx, seg in
                    segmentPath(from: seg.start, to: seg.end, control: seg.control)
                        .stroke(
                            strokeStyle(for: seg.state),
                            style: StrokeStyle(
                                lineWidth: 12,
                                lineCap: .round,
                                dash: seg.state == .locked ? [6, 12] : []
                            )
                        )

                    // Shadow glow for completed segments
                    if seg.state == .completed {
                        segmentPath(from: seg.start, to: seg.end, control: seg.control)
                            .stroke(color.opacity(0.35), style: StrokeStyle(lineWidth: 22, lineCap: .round))
                            .blur(radius: 14)
                    }

                    // Inner highlight for available segments
                    if seg.state == .available {
                        segmentPath(from: seg.start, to: seg.end, control: seg.control)
                            .stroke(
                                LinearGradient(
                                    colors: [color.opacity(0.9), color.opacity(0.3)],
                                    startPoint: .top, endPoint: .bottom
                                ),
                                style: StrokeStyle(lineWidth: 4, lineCap: .round)
                            )
                    }
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

    private func strokeStyle(for state: PathSegment.State) -> LinearGradient {
        switch state {
        case .completed:
            return LinearGradient(
                colors: [color, color.opacity(0.7)],
                startPoint: .top, endPoint: .bottom
            )
        case .available:
            return LinearGradient(
                colors: [color.opacity(0.45), color.opacity(0.25)],
                startPoint: .top, endPoint: .bottom
            )
        case .locked:
            return LinearGradient(
                colors: [Theme.Color.border, Theme.Color.borderLight],
                startPoint: .top, endPoint: .bottom
            )
        }
    }

    private struct PathSegment {
        enum State { case locked, available, completed }
        let start: CGPoint
        let end: CGPoint
        let control: CGPoint
        let state: State
    }

    private func segments() -> [PathSegment] {
        guard nodes.count > 1 else { return [] }
        var out: [PathSegment] = []
        for i in 0..<(nodes.count - 1) {
            let a = nodes[i], b = nodes[i + 1]
            let midY = (a.y + b.y) / 2
            // Control point offset outward to make curvy road
            let controlX = (a.x + b.x) / 2
            let controlOffset: CGFloat = (a.x > b.x) ? -60 : 60
            let control = CGPoint(x: controlX + controlOffset, y: midY)

            let state: PathSegment.State = {
                if a.state == .completed && b.state == .completed { return .completed }
                if a.state == .completed && b.state == .available { return .available }
                if b.state == .locked { return .locked }
                return .available
            }()

            out.append(PathSegment(
                start: CGPoint(x: a.x, y: a.y),
                end: CGPoint(x: b.x, y: b.y),
                control: control,
                state: state
            ))
        }
        return out
    }
}

// MARK: - Path node (the big round icon button)

struct PathNode: View {
    let lesson: CurriculumLesson
    let state: PathNodeData.State
    let isCurrent: Bool
    let color: Color
    let lessonNumber: Int
    let progress: LessonProgress
    let onTap: () -> Void

    @State private var pulse: CGFloat = 1.0
    @State private var hovered = false

    var body: some View {
        Button {
            guard state != .locked else { return }
            Haptics.medium()
            onTap()
        } label: {
            VStack(spacing: 8) {
                nodeCircle
                label
            }
        }
        .buttonStyle(.pressable(scale: 0.92))
        .disabled(state == .locked)
        .frame(width: 150)
        .onAppear {
            if isCurrent {
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                    pulse = 1.12
                }
            }
        }
    }

    // MARK: - Node circle

    @ViewBuilder
    private var nodeCircle: some View {
        ZStack {
            // Outer rings for current / available states
            if state != .locked {
                // Outermost pulsing halo (only for current)
                if isCurrent {
                    Circle()
                        .stroke(color.opacity(0.35), lineWidth: 4)
                        .frame(width: 96, height: 96)
                        .scaleEffect(pulse)
                        .blur(radius: 1.5)
                    Circle()
                        .fill(color.opacity(0.18))
                        .frame(width: 110, height: 110)
                        .scaleEffect(pulse)
                        .blur(radius: 8)
                }
                // Subtle static ring
                Circle()
                    .stroke(color.opacity(state == .completed ? 0.35 : 0.25), lineWidth: 4)
                    .frame(width: 92, height: 92)
            }

            // Main circle
            ZStack {
                // Background gradient
                Circle()
                    .fill(backgroundFill)

                // Top highlight — gives 3D sheen
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [.white.opacity(topHighlightOpacity), .clear],
                            startPoint: .top, endPoint: .center
                        ),
                        lineWidth: 3
                    )
                    .blendMode(.overlay)

                // Bottom shadow lip
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [.clear, .black.opacity(0.4)],
                            startPoint: .center, endPoint: .bottom
                        ),
                        lineWidth: 3
                    )

                icon
            }
            .frame(width: 78, height: 78)
            .shadow(color: shadowColor, radius: 12, x: 0, y: 6)
            .offset(y: isCurrent ? -2 : 0)
        }
        .frame(width: 110, height: 110)
    }

    @ViewBuilder
    private var icon: some View {
        switch state {
        case .locked:
            Image(systemName: "lock.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.Color.textDisabled)
        case .completed:
            Image(systemName: "checkmark")
                .font(.system(size: 32, weight: .heavy))
                .foregroundStyle(.white)
        case .available:
            Image(systemName: iconName)
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(isCurrent ? .white : color)
        }
    }

    private var iconName: String {
        switch lesson.lessonType.lowercased() {
        case "grammar", "structure": return "book.closed.fill"
        case "vocab": return "character.book.closed.fill"
        case "scene": return "film.fill"
        case "review": return "star.fill"
        default: return "sparkles"
        }
    }

    private var backgroundFill: AnyShapeStyle {
        switch state {
        case .locked:
            return AnyShapeStyle(
                LinearGradient(colors: [Theme.Color.backgroundSurface, Theme.Color.backgroundCard],
                               startPoint: .top, endPoint: .bottom)
            )
        case .completed:
            return AnyShapeStyle(
                LinearGradient(colors: [color, color.opacity(0.75)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            )
        case .available:
            if isCurrent {
                return AnyShapeStyle(
                    LinearGradient(colors: [color, color.opacity(0.8)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                )
            } else {
                return AnyShapeStyle(
                    LinearGradient(colors: [Theme.Color.backgroundElevated, Theme.Color.backgroundCard],
                                   startPoint: .top, endPoint: .bottom)
                )
            }
        }
    }

    private var topHighlightOpacity: Double {
        switch state {
        case .locked: return 0.08
        case .available: return isCurrent ? 0.45 : 0.2
        case .completed: return 0.45
        }
    }

    private var shadowColor: Color {
        switch state {
        case .locked: return .black.opacity(0.3)
        case .available: return isCurrent ? color.opacity(0.55) : color.opacity(0.25)
        case .completed: return color.opacity(0.45)
        }
    }

    // MARK: - Label below node

    @ViewBuilder
    private var label: some View {
        VStack(spacing: 4) {
            if isCurrent {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("START")
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .tracking(0.9)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(color).shadow(color: color.opacity(0.5), radius: 6, y: 2)
                )
                .offset(y: -2)
            }
            Text(lesson.displayTitle)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundStyle(titleColor)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
        }
    }

    private var titleColor: Color {
        switch state {
        case .locked: return Theme.Color.textMuted
        case .available: return Theme.Color.textPrimary
        case .completed: return Theme.Color.textSecondary
        }
    }
}

// MARK: - Unit banner

struct UnitBanner: View {
    let unit: CurriculumUnit
    let orderIndex: Int
    let unitColor: Color
    let doneCount: Int
    let totalCount: Int

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .fill(Theme.Color.backgroundElevated)
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .fill(LinearGradient(
                    colors: [unitColor.opacity(0.25), unitColor.opacity(0.05)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .strokeBorder(unitColor.opacity(0.4), lineWidth: 1.5)

            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.15))
                    Circle()
                        .stroke(.white.opacity(0.25), lineWidth: 1.5)
                    Text("\(orderIndex + 1)")
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                }
                .frame(width: 52, height: 52)
                .shadow(color: unitColor.opacity(0.5), radius: 8, y: 3)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("UNIT \(orderIndex + 1)")
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.85))
                        Text("·")
                            .foregroundStyle(.white.opacity(0.6))
                        Text(unit.cefrLevel.uppercased())
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Text(unit.displayTitle)
                        .font(.system(size: 20, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(-0.3)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                VStack(spacing: 2) {
                    Text("\(doneCount)")
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                    Text("of \(totalCount)")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding(18)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .shadow(color: unitColor.opacity(0.3), radius: 14, y: 6)
    }
}
