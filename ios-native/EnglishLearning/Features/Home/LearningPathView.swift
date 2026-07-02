import SwiftUI

// MARK: - Refined learning path
//
// Visual language:
//   • One quiet accent color (the unit color), desaturated on most surfaces.
//   • Node ring uses the accent; the interior is the app background for locked,
//     the accent-soft for available, and full accent for completed.
//   • The road is a single 3-pt curved line. Completed segments are full accent;
//     the currently-unlocked segment is a faint accent; locked segments are a
//     subtle 1-pt dashed stroke.
//   • No pulsing halos, 3D highlights, or "START" pills. The active node has a
//     thin outer ring and a small dot indicator below the title.

struct LearningPathView: View {
    let unit: CurriculumUnit
    let orderIndex: Int
    var stage: (String) -> LessonStage?
    var subProgress: (String) -> LessonProgress
    var onTap: (CurriculumLesson) -> Void

    private let nodeSpacing: CGFloat = 108
    private let amplitude: CGFloat = 64
    private let nodeSize: CGFloat = 60

    var body: some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        let nodes = buildNodes(unitColor: unitColor)
        let totalHeight = max(CGFloat(unit.lessons.count), 1) * nodeSpacing + 30

        VStack(alignment: .leading, spacing: 16) {
            UnitBanner(unit: unit, orderIndex: orderIndex,
                       unitColor: unitColor,
                       doneCount: completedCount(),
                       totalCount: unit.lessons.count)

            ZStack(alignment: .top) {
                PathRoad(nodes: nodes, color: unitColor)
                    .frame(height: totalHeight)

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

    private func buildNodes(unitColor: Color) -> [PathNodeData] {
        var nodes: [PathNodeData] = []
        let centerX: CGFloat = UIScreen.main.bounds.width / 2
        var foundCurrent = false

        for (idx, lesson) in unit.lessons.enumerated() {
            // Smoother sine-wave zigzag: swap side every node
            let phase = Double(idx) * .pi / 2.4
            let offset = sin(phase) * amplitude
            let y = CGFloat(idx) * nodeSpacing + nodeSize / 2 + 12

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

// MARK: - The road (curved segments)

struct PathRoad: View {
    let nodes: [PathNodeData]
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

    private func strokeColor(for state: PathSegment.State) -> Color {
        switch state {
        case .completed: return color.opacity(0.7)
        case .available: return color.opacity(0.35)
        case .locked:    return Theme.Color.border
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
            let controlX = (a.x + b.x) / 2
            // Pull control point slightly outward for a gentle S-curve
            let dir: CGFloat = (b.x - a.x) < 0 ? -1 : 1
            let control = CGPoint(x: controlX + dir * 24, y: midY)

            let state: PathSegment.State = {
                if a.state == .completed && b.state == .completed { return .completed }
                if a.state == .completed { return .available }
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

// MARK: - Path node

struct PathNode: View {
    let lesson: CurriculumLesson
    let state: PathNodeData.State
    let isCurrent: Bool
    let color: Color
    let lessonNumber: Int
    let progress: LessonProgress
    let onTap: () -> Void

    var body: some View {
        Button {
            guard state != .locked else { return }
            Haptics.medium()
            onTap()
        } label: {
            VStack(spacing: 6) {
                circle
                label
            }
        }
        .buttonStyle(.pressable(scale: 0.94))
        .disabled(state == .locked)
        .frame(width: 150)
    }

    // MARK: - Circle

    @ViewBuilder
    private var circle: some View {
        ZStack {
            // Outer ring for current node — subtle, static
            if isCurrent {
                Circle()
                    .strokeBorder(color.opacity(0.25), lineWidth: 1)
                    .frame(width: 76, height: 76)
            }

            // Main circle
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
            Image(systemName: iconName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(iconColor)
        }
    }

    private var iconName: String {
        switch lesson.lessonType.lowercased() {
        case "grammar", "structure": return "book.closed"
        case "vocab": return "character.book.closed"
        case "scene": return "film"
        case "review": return "star"
        default: return "text.book.closed"
        }
    }

    // MARK: - State-dependent styling

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

    // MARK: - Label

    @ViewBuilder
    private var label: some View {
        VStack(spacing: 3) {
            Text(lesson.displayTitle)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(titleColor)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)

            if isCurrent {
                HStack(spacing: 3) {
                    Circle()
                        .fill(color)
                        .frame(width: 4, height: 4)
                    Text("CURRENT")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(0.8)
                        .foregroundStyle(color)
                }
                .padding(.top, 1)
            } else if state == .completed {
                Text("COMPLETED")
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    private var titleColor: Color {
        switch state {
        case .locked: return Theme.Color.textMuted
        case .available: return isCurrent ? Theme.Color.textPrimary : Theme.Color.textSecondary
        case .completed: return Theme.Color.textSecondary
        }
    }
}

// MARK: - Unit banner (unchanged from last refinement)

struct UnitBanner: View {
    let unit: CurriculumUnit
    let orderIndex: Int
    let unitColor: Color
    let doneCount: Int
    let totalCount: Int

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(unitColor.opacity(0.16))
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .strokeBorder(unitColor.opacity(0.35), lineWidth: 1)
                Text("\(orderIndex + 1)")
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .foregroundStyle(unitColor)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text("UNIT \(orderIndex + 1)")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.textMuted)
                    Text("·")
                        .foregroundStyle(Theme.Color.textMuted)
                    Text(unit.cefrLevel.uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(unitColor)
                }
                Text(unit.displayTitle)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.2)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(doneCount)/\(totalCount)")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                Text("lessons")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}
