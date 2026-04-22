import SwiftUI

struct CoursesView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = HomeViewModel()
    @State private var selectedLesson: CurriculumLesson? = nil
    @State private var selectedLessonForClips: CurriculumLesson? = nil

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
            .navigationDestination(item: $selectedLessonForClips) { lesson in
                LessonClipsView(lesson: lesson).environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 28) {
                header
                ForEach(vm.curriculum) { unit in
                    unitSection(unit)
                }
                Spacer().frame(height: 120)
            }
            .padding(.top, 12)
        }
        .refreshable { await vm.load(forceRefresh: true) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(appState.t.t("video"))
                .font(Theme.Font.display(30))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Real movie clips for each lesson")
                .font(Theme.Font.body(14))
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 48)
    }

    private func unitSection(_ unit: CurriculumUnit) -> some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 10) {
                Chip(label: unit.cefrLevel.uppercased(), color: unitColor)
                Text(unit.displayTitle)
                    .font(Theme.Font.headline(16, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(1)
                Spacer()
                Text("\(unit.lessons.count)")
                    .font(Theme.Font.caption(12, weight: .bold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(unit.lessons) { lesson in
                        Button {
                            Haptics.medium()
                            selectedLessonForClips = lesson
                        } label: {
                            LessonClipCard(
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

struct LessonClipCard: View {
    let lesson: CurriculumLesson
    let stage: LessonStage?
    let progress: LessonProgress
    let unitColor: Color

    var body: some View {
        let isMastered = stage == .mastered
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(LinearGradient(
                        colors: [unitColor.opacity(0.25), unitColor.opacity(0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                Image(systemName: isMastered ? "checkmark.seal.fill" : "play.rectangle.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(isMastered ? Theme.Color.success : unitColor)
            }
            .frame(width: 58, height: 58)

            Text(lesson.displayTitle)
                .font(Theme.Font.headline(14, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if lesson.title != lesson.displayTitle {
                Text(lesson.title)
                    .font(Theme.Font.body(11))
                    .foregroundStyle(Theme.Color.textMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if !isMastered, progress.completedCount > 0 {
                ProgressBar(percent: Double(progress.completedCount) / 3 * 100,
                           height: 3, color: unitColor)
            }
        }
        .frame(width: 160, height: 180, alignment: .topLeading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}
