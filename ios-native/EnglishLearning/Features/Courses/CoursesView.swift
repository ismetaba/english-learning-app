import SwiftUI

struct CoursesView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = HomeViewModel()
    @State private var selectedLessonForClips: CurriculumLesson? = nil
    @State private var activeFilter: String = "ALL"

    var body: some View {
        NavigationStack {
            ZStack {
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
            }
            .navigationDestination(item: $selectedLessonForClips) { lesson in
                LessonClipsView(lesson: lesson).environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header
                filterBar
                ForEach(filteredUnits()) { unit in
                    unitSection(unit)
                }
                Spacer().frame(height: 120)
            }
            .padding(.top, 58)
        }
        .refreshable { await vm.load(forceRefresh: true) }
    }

    private func filteredUnits() -> [CurriculumUnit] {
        activeFilter == "ALL" ? vm.curriculum :
            vm.curriculum.filter { $0.cefrLevel.uppercased() == activeFilter }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Library")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Learn with authentic movie scenes")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 20)
    }

    private var filterBar: some View {
        let options = ["ALL"] + Array(Set(vm.curriculum.map { $0.cefrLevel.uppercased() })).sorted()
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { opt in
                    Button {
                        Haptics.selection()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            activeFilter = opt
                        }
                    } label: {
                        Text(opt)
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .tracking(0.8)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .foregroundStyle(activeFilter == opt ? .white : Theme.Color.textSecondary)
                            .background(
                                Capsule().fill(activeFilter == opt
                                               ? AnyShapeStyle(Theme.Gradient.heroPrimary)
                                               : AnyShapeStyle(Theme.Color.backgroundCard))
                            )
                            .overlay(
                                Capsule().strokeBorder(
                                    activeFilter == opt ? Color.clear : Theme.Color.border,
                                    lineWidth: 1
                                )
                            )
                    }
                    .buttonStyle(.pressable(scale: 0.92))
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func unitSection(_ unit: CurriculumUnit) -> some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        return VStack(alignment: .leading, spacing: 14) {
            // Section header with gradient stripe
            HStack(alignment: .center, spacing: 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(unitColor)
                    .frame(width: 4, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(unit.cefrLevel.uppercased())
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(unitColor)
                        Text("·")
                            .foregroundStyle(Theme.Color.textMuted)
                        Text("\(unit.lessons.count) LESSONS")
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                    Text(unit.displayTitle)
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.3)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(unit.lessons) { lesson in
                        Button {
                            Haptics.medium()
                            selectedLessonForClips = lesson
                        } label: {
                            ModernLessonCard(
                                lesson: lesson,
                                stage: appState.stage(for: lesson.id),
                                progress: appState.subProgress(for: lesson.id),
                                unitColor: unitColor
                            )
                        }
                        .buttonStyle(.pressable)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

struct ModernLessonCard: View {
    let lesson: CurriculumLesson
    let stage: LessonStage?
    let progress: LessonProgress
    let unitColor: Color

    var body: some View {
        let isMastered = stage == .mastered
        VStack(alignment: .leading, spacing: 12) {
            // Thumbnail area with gradient + play badge
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [unitColor.opacity(0.45), unitColor.opacity(0.15)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                // Dotted overlay
                Image(systemName: "film.fill")
                    .font(.system(size: 48, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.22))

                // Play badge
                ZStack {
                    Circle().fill(.black.opacity(0.45))
                    Image(systemName: isMastered ? "checkmark" : "play.fill")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(.white)
                }
                .frame(width: 32, height: 32)
                .padding(8)
            }
            .frame(width: 180, height: 108)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(.white.opacity(0.08), lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(lesson.displayTitle)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(height: 40, alignment: .top)
                if !isMastered, progress.completedCount > 0 {
                    ProgressBar(percent: Double(progress.completedCount) / 3 * 100, height: 3, color: unitColor)
                } else if isMastered {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 11, weight: .bold))
                        Text("MASTERED")
                            .font(.system(size: 9, weight: .heavy, design: .rounded))
                            .tracking(1)
                    }
                    .foregroundStyle(Theme.Color.success)
                } else {
                    Text("Not started")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
        }
        .frame(width: 180)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.7))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}
