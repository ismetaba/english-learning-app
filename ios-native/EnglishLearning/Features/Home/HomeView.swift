import SwiftUI

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var curriculum: [CurriculumUnit] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            let data = try await CurriculumRepository.shared.curriculum(forceRefresh: forceRefresh)
            self.curriculum = data
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = HomeViewModel()
    @State private var showProfile = false
    @State private var selectedLesson: CurriculumLesson? = nil
    @State private var selectedUnit: CurriculumUnit? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()

                if vm.isLoading && vm.curriculum.isEmpty {
                    LoadingState(label: appState.t.t("loading"))
                } else if let err = vm.errorMessage, vm.curriculum.isEmpty {
                    ErrorState(message: err) {
                        Task { await vm.load(forceRefresh: true) }
                    }
                } else {
                    content
                }
            }
            .navigationDestination(item: $selectedLesson) { lesson in
                LessonDetailView(lessonId: lesson.id, lessonTitle: lesson.displayTitle)
                    .environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                header
                streakHero
                recommendedSection
                learningPath
                Spacer().frame(height: 120) // bottom bar clearance
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
        .refreshable {
            await vm.load(forceRefresh: true)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(appState.t.t(appState.greetingKey))
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textMuted)
                Text(appState.progress.onboardingLevel == .beginner ? "Let's learn" : "Keep going")
                    .font(Theme.Font.display(30))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.5)
            }
            Spacer()
            Button {
                showProfile = true
            } label: {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [Theme.Color.primary, Theme.Color.primaryDark],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                    Text("\(appState.levelInfo.level)")
                        .font(Theme.Font.headline(16, weight: .heavy))
                        .foregroundStyle(.white)
                }
                .frame(width: 44, height: 44)
                .overlay(Circle().strokeBorder(.white.opacity(0.15), lineWidth: 1))
                .shadow(color: Theme.Color.primary.opacity(0.4), radius: 12, x: 0, y: 4)
            }
            .buttonStyle(.pressable)
        }
        .padding(.top, 48)
    }

    // MARK: - Streak + daily goal hero

    private var streakHero: some View {
        let level = appState.levelInfo
        return VStack(spacing: 16) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "flame.fill")
                            .foregroundStyle(Theme.Color.streak)
                        Text("\(appState.progress.streak)")
                            .font(Theme.Font.display(36, weight: .heavy))
                            .foregroundStyle(Theme.Color.textPrimary)
                    }
                    Text("\(appState.progress.streak == 1 ? "day" : "days") streak")
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Divider().frame(height: 50).background(Theme.Color.border)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .foregroundStyle(Theme.Color.xp)
                        Text("\(appState.progress.xp)")
                            .font(Theme.Font.display(36, weight: .heavy))
                            .foregroundStyle(Theme.Color.textPrimary)
                    }
                    Text("total XP")
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer()
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(level.name)
                        .font(Theme.Font.headline(14, weight: .bold))
                        .foregroundStyle(Theme.Color.textSecondary)
                    Spacer()
                    Text("Lvl \(level.level)")
                        .font(Theme.Font.caption(12, weight: .bold))
                        .foregroundStyle(Theme.Color.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 3)
                        .background(Theme.Color.primarySoft, in: Capsule())
                }
                ProgressBar(percent: level.percent, height: 8, color: Theme.Color.primary)
                HStack {
                    Text("\(appState.progress.xp - level.current) / \(level.next - level.current) XP")
                        .font(Theme.Font.caption(11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                    Spacer()
                    Text("\(Int(level.percent))%")
                        .font(Theme.Font.caption(11, weight: .bold))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
            }
        }
        .padding(20)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .fill(LinearGradient(
                    colors: [Theme.Color.backgroundElevated, Theme.Color.backgroundCard],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
        }
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .strokeBorder(Theme.Color.borderAccent, lineWidth: 1.5)
        )
        .premiumShadow(.card)
    }

    // MARK: - Recommended next lesson

    @ViewBuilder
    private var recommendedSection: some View {
        if let (unit, lesson) = recommendedLesson() {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(
                    title: appState.t.t("continueLearning"),
                    subtitle: "Pick up where you left off",
                    icon: "sparkles",
                    iconColor: Theme.Color.primary
                )
                Button {
                    Haptics.medium()
                    selectedLesson = lesson
                } label: {
                    RecommendationCard(unit: unit, lesson: lesson, mastery: appState.mastery(for: lesson.id))
                }
                .buttonStyle(.pressable)
            }
        }
    }

    private func recommendedLesson() -> (CurriculumUnit, CurriculumLesson)? {
        // First non-mastered lesson in order
        for unit in vm.curriculum {
            for lesson in unit.lessons {
                if appState.stage(for: lesson.id) != .mastered {
                    return (unit, lesson)
                }
            }
        }
        return vm.curriculum.first.flatMap { u in u.lessons.first.map { (u, $0) } }
    }

    // MARK: - Learning path

    private var learningPath: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(
                title: "Learning path",
                subtitle: "Follow the curriculum step by step",
                icon: "map.fill",
                iconColor: Theme.Color.accent
            )
            VStack(spacing: 28) {
                ForEach(Array(vm.curriculum.enumerated()), id: \.element.id) { idx, unit in
                    UnitTimeline(unit: unit, orderIndex: idx) { lesson in
                        selectedLesson = lesson
                    }
                }
            }
        }
    }
}

// MARK: - Recommendation card

struct RecommendationCard: View {
    @EnvironmentObject var appState: AppState
    let unit: CurriculumUnit
    let lesson: CurriculumLesson
    let mastery: LessonMastery

    var body: some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        ZStack(alignment: .topTrailing) {
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                        .fill(unitColor.opacity(0.2))
                    Image(systemName: mastery.stage == .mastered ? "checkmark.seal.fill" : "play.circle.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(unitColor)
                }
                .frame(width: 54, height: 54)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Chip(label: unit.cefrLevel.uppercased(), color: unitColor)
                        Text(unit.displayTitle)
                            .font(Theme.Font.caption(12, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                            .lineLimit(1)
                    }
                    Text(lesson.displayTitle)
                        .font(Theme.Font.headline(18, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(2)
                    if lesson.titleTr != lesson.title, !lesson.title.isEmpty {
                        Text(lesson.title)
                            .font(Theme.Font.body(13))
                            .foregroundStyle(Theme.Color.textSecondary)
                            .lineLimit(1)
                    }
                    subProgressRow
                }
                Spacer(minLength: 0)
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .fill(Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(unitColor.opacity(0.35), lineWidth: 1.5)
            )
            .overlay(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .fill(LinearGradient(
                        colors: [unitColor.opacity(0.12), .clear],
                        startPoint: .bottomTrailing,
                        endPoint: .topLeading
                    ))
                    .allowsHitTesting(false)
            }
            .premiumShadow(.small)

            Circle()
                .fill(unitColor)
                .frame(width: 10, height: 10)
                .overlay(Circle().strokeBorder(.white.opacity(0.3), lineWidth: 1))
                .padding(14)
        }
    }

    @ViewBuilder
    private var subProgressRow: some View {
        let p = appState.subProgress(for: lesson.id)
        HStack(spacing: 6) {
            pillDot("L", done: p.learnCompleted)
            pillDot("V", done: p.vocabCompleted)
            pillDot("W", done: p.watchCompleted)
            pillDot("T", done: p.testPassed)
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "arrow.right")
                    .font(.system(size: 12, weight: .bold))
                Text(appState.t.t("continue"))
                    .font(Theme.Font.caption(12, weight: .bold))
            }
            .foregroundStyle(Theme.Color.primary)
        }
        .padding(.top, 4)
    }

    private func pillDot(_ letter: String, done: Bool) -> some View {
        Text(letter)
            .font(Theme.Font.caption(10, weight: .heavy))
            .foregroundStyle(done ? .white : Theme.Color.textMuted)
            .frame(width: 20, height: 20)
            .background(done ? Theme.Color.success : Theme.Color.backgroundSurface, in: Circle())
    }
}

// MARK: - Unit timeline

struct UnitTimeline: View {
    @EnvironmentObject var appState: AppState
    let unit: CurriculumUnit
    let orderIndex: Int
    let onLessonTap: (CurriculumLesson) -> Void

    var body: some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(unitColor.opacity(0.2))
                    Text("\(orderIndex + 1)")
                        .font(Theme.Font.headline(16, weight: .heavy))
                        .foregroundStyle(unitColor)
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Chip(label: unit.cefrLevel.uppercased(), color: unitColor)
                        Text("\(unit.lessons.count) lessons")
                            .font(Theme.Font.caption(11, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                    Text(unit.displayTitle)
                        .font(Theme.Font.headline(17, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                }
                Spacer()
                let done = unit.lessons.filter { appState.stage(for: $0.id) == .mastered }.count
                Text("\(done)/\(unit.lessons.count)")
                    .font(Theme.Font.caption(12, weight: .bold))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.Color.backgroundElevated, in: Capsule())
            }

            VStack(spacing: 0) {
                ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { idx, lesson in
                    HStack(spacing: 14) {
                        VStack(spacing: 0) {
                            if idx == 0 {
                                Spacer().frame(height: 12)
                            } else {
                                Rectangle()
                                    .fill(Theme.Color.border)
                                    .frame(width: 2, height: 14)
                            }
                            LessonBullet(
                                stage: appState.stage(for: lesson.id),
                                unitColor: unitColor
                            )
                            if idx < unit.lessons.count - 1 {
                                Rectangle()
                                    .fill(Theme.Color.border)
                                    .frame(width: 2, height: 18)
                            } else {
                                Spacer().frame(height: 12)
                            }
                        }
                        .frame(width: 30)

                        Button {
                            onLessonTap(lesson)
                        } label: {
                            LessonRow(
                                lesson: lesson,
                                stage: appState.stage(for: lesson.id),
                                progress: appState.subProgress(for: lesson.id),
                                unitColor: unitColor
                            )
                        }
                        .buttonStyle(.pressable)
                    }
                }
            }
        }
    }
}

struct LessonBullet: View {
    let stage: LessonStage?
    let unitColor: Color

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.background)
            Circle()
                .strokeBorder(borderColor, lineWidth: 2)
            if stage == .mastered {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(Theme.Color.success, in: Circle())
            } else if stage == nil {
                // default empty
                EmptyView()
            } else {
                Circle().fill(unitColor).frame(width: 8, height: 8)
            }
        }
        .frame(width: 22, height: 22)
    }

    private var borderColor: Color {
        switch stage {
        case .mastered: return Theme.Color.success
        case .none: return Theme.Color.border
        default: return unitColor
        }
    }
}

struct LessonRow: View {
    let lesson: CurriculumLesson
    let stage: LessonStage?
    let progress: LessonProgress
    let unitColor: Color

    var body: some View {
        let isMastered = stage == .mastered
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(lesson.displayTitle)
                    .font(Theme.Font.headline(15, weight: .bold))
                    .foregroundStyle(isMastered ? Theme.Color.textSecondary : Theme.Color.textPrimary)
                    .lineLimit(2)
                if lesson.title != lesson.displayTitle {
                    Text(lesson.title)
                        .font(Theme.Font.body(12))
                        .foregroundStyle(Theme.Color.textMuted)
                        .lineLimit(1)
                }
                if !isMastered && progress.completedCount > 0 {
                    HStack(spacing: 6) {
                        ProgressBar(percent: Double(progress.completedCount) / 3 * 100,
                                   height: 4, color: unitColor)
                            .frame(width: 80)
                        Text("\(progress.completedCount)/3")
                            .font(Theme.Font.caption(10, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(isMastered ? Theme.Color.success.opacity(0.3) : Theme.Color.border, lineWidth: 1)
        )
        .opacity(isMastered ? 0.8 : 1.0)
    }
}
