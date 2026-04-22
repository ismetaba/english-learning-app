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
    @State private var selectedLesson: CurriculumLesson? = nil
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                // Ambient background
                BackgroundAmbience()

                if vm.isLoading && vm.curriculum.isEmpty {
                    LoadingState(label: appState.t.t("loading"))
                } else if let err = vm.errorMessage, vm.curriculum.isEmpty {
                    ErrorState(message: err) {
                        Task { await vm.load(forceRefresh: true) }
                    }
                } else {
                    content
                }

                // Floating sticky header — appears on scroll
                StickyHeader(scrollOffset: scrollOffset)
                    .environmentObject(appState)
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
            VStack(spacing: 26) {
                heroHeader
                heroRecommendation

                ForEach(Array(vm.curriculum.prefix(3).enumerated()), id: \.element.id) { idx, unit in
                    LearningPathView(
                        unit: unit,
                        orderIndex: idx,
                        stage: { appState.stage(for: $0) },
                        subProgress: { appState.subProgress(for: $0) },
                        onTap: { selectedLesson = $0 }
                    )
                    .padding(.horizontal, 16)
                }

                if vm.curriculum.count > 3 {
                    comingSoonCard
                }

                Spacer().frame(height: 120) // tab bar clearance
            }
            .padding(.top, 12)
            .background(
                GeometryReader { geo in
                    Color.clear
                        .onChange(of: geo.frame(in: .named("home-scroll")).minY) { _, newY in
                            scrollOffset = max(0, -newY)
                        }
                }
            )
        }
        .coordinateSpace(name: "home-scroll")
        .refreshable { await vm.load(forceRefresh: true) }
    }

    // MARK: - Hero header (greeting + stats)

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(appState.t.t(appState.greetingKey))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.Color.textSecondary)
                    Text("Your journey")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.5)
                }
                Spacer()
                AvatarBadge(level: appState.levelInfo.level)
            }

            StatsRow(
                xp: appState.progress.xp,
                streak: appState.progress.streak,
                levelInfo: appState.levelInfo
            )
        }
        .padding(.horizontal, 20)
        .padding(.top, 58)
    }

    // MARK: - Continue learning (big feature card)

    @ViewBuilder
    private var heroRecommendation: some View {
        if let (unit, lesson) = recommendedLesson() {
            ContinueLearningCard(
                unit: unit,
                lesson: lesson,
                subProgress: appState.subProgress(for: lesson.id),
                onTap: { selectedLesson = lesson }
            )
            .padding(.horizontal, 20)
        }
    }

    private func recommendedLesson() -> (CurriculumUnit, CurriculumLesson)? {
        for unit in vm.curriculum {
            for lesson in unit.lessons {
                if appState.stage(for: lesson.id) != .mastered {
                    return (unit, lesson)
                }
            }
        }
        return vm.curriculum.first.flatMap { u in u.lessons.first.map { (u, $0) } }
    }

    // MARK: - Coming soon card

    private var comingSoonCard: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.Color.primarySoft).frame(width: 54, height: 54)
                Image(systemName: "sparkles")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Theme.Color.primary)
            }
            Text("More levels coming soon")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
            Text("Complete the current units to unlock B1 and beyond.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
        }
        .padding(.vertical, 26)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
        .padding(.horizontal, 20)
    }
}

// MARK: - Background ambience — subtle, not gaudy

struct BackgroundAmbience: View {
    var body: some View {
        ZStack {
            Theme.Color.background
            // Single soft violet haze — provides depth without drawing attention
            Circle()
                .fill(Theme.Color.primary.opacity(0.08))
                .blur(radius: 120)
                .frame(width: 360, height: 360)
                .offset(x: -120, y: -220)
        }
        .ignoresSafeArea()
    }
}

// MARK: - Avatar badge (level)

struct AvatarBadge: View {
    let level: Int

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.Color.backgroundElevated)
            Circle()
                .stroke(Theme.Color.primary.opacity(0.4), lineWidth: 1.5)
            VStack(spacing: -1) {
                Text("LVL")
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.textMuted)
                Text("\(level)")
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.primary)
            }
        }
        .frame(width: 46, height: 46)
    }
}

// MARK: - Stats row

struct StatsRow: View {
    let xp: Int
    let streak: Int
    let levelInfo: Levels.Info

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                StatBubble(
                    icon: "flame.fill",
                    value: "\(streak)",
                    label: "streak",
                    color: Theme.Color.streak,
                    glow: streak > 0
                )
                StatBubble(
                    icon: "bolt.fill",
                    value: "\(xp)",
                    label: "XP",
                    color: Theme.Color.xp,
                    glow: true
                )
            }
            LevelBubble(info: levelInfo)
        }
    }
}

struct StatBubble: View {
    let icon: String
    let value: String
    let label: String
    let color: Color
    var glow: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}

struct LevelBubble: View {
    let info: Levels.Info
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.primary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 0) {
                    Text(info.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(1)
                    Text("Level \(info.level) · \(Int(info.percent))%")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer(minLength: 0)
            }
            ProgressBar(percent: info.percent, height: 5, color: Theme.Color.primary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}

// MARK: - Continue learning card

struct ContinueLearningCard: View {
    @EnvironmentObject var appState: AppState
    let unit: CurriculumUnit
    let lesson: CurriculumLesson
    let subProgress: LessonProgress
    let onTap: () -> Void

    var body: some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        Button(action: { Haptics.medium(); onTap() }) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(unitColor.opacity(0.18))
                    Image(systemName: "play.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(unitColor)
                }
                .frame(width: 52, height: 52)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("CONTINUE")
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
                    Text(lesson.displayTitle)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        ProgressBar(
                            percent: Double(subProgress.completedCount) / 3 * 100,
                            height: 3,
                            color: unitColor
                        )
                        .frame(width: 80)
                        Text("\(subProgress.completedCount)/3")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.Color.border, lineWidth: 1)
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
    }
}

// MARK: - Sticky header on scroll

struct StickyHeader: View {
    @EnvironmentObject var appState: AppState
    let scrollOffset: CGFloat

    private var visibility: Double {
        min(1.0, max(0.0, Double(scrollOffset - 90) / 60.0))
    }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(visibility)
            Rectangle()
                .fill(Theme.Color.background.opacity(0.7 * visibility))
            HStack(spacing: 10) {
                Text("Your journey")
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(Theme.Color.streak)
                    Text("\(appState.progress.streak)")
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                }
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .foregroundStyle(Theme.Color.xp)
                    Text("\(appState.progress.xp)")
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 50)
            .padding(.bottom, 10)
            .opacity(visibility)
        }
        .frame(height: 96)
        .overlay(
            Rectangle()
                .fill(Theme.Color.border.opacity(0.5 * visibility))
                .frame(height: 0.5),
            alignment: .bottom
        )
        .allowsHitTesting(false)
        .ignoresSafeArea(edges: .top)
    }
}
