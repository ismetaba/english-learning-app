import SwiftUI

struct DailyTasksView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var tasks: [DailyTaskItem] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                if isLoading {
                    LoadingState(label: "Building today's plan…")
                } else {
                    content
                }
            }
            .navigationTitle(appState.t.t("dailyTasksTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Theme.Color.textSecondary)
                            .frame(width: 32, height: 32)
                            .background(Theme.Color.backgroundCard, in: Circle())
                    }
                }
            }
            .toolbarBackground(Theme.Color.background, for: .navigationBar)
            .task { await buildPlan() }
        }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                dayHero
                tasksList
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
    }

    private var dayHero: some View {
        let done = appState.progress.dailyTasks?.completedItemIds.count ?? 0
        let total = tasks.count
        let pct = total > 0 ? Double(done) / Double(total) * 100 : 0
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(appState.t.t("todaysPlan"))
                        .font(Theme.Font.caption(12, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                        .textCase(.uppercase)
                        .tracking(0.8)
                    Text(appState.t.t("dailyTasksSubtitle"))
                        .font(Theme.Font.headline(17, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(done) / \(total)")
                        .font(Theme.Font.display(20, weight: .heavy))
                        .foregroundStyle(Theme.Color.primary)
                    Text("tasks")
                        .font(Theme.Font.caption(11, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
            ProgressBar(percent: pct, height: 8, color: Theme.Color.primary)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .fill(Theme.Gradient.cardGlow)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .strokeBorder(Theme.Color.borderAccent, lineWidth: 1)
        )
        .premiumShadow(.small)
    }

    private var tasksList: some View {
        VStack(spacing: 10) {
            ForEach(tasks) { task in
                DailyTaskRow(
                    task: task,
                    done: appState.progress.dailyTasks?.completedItemIds.contains(task.id) ?? false,
                    onTap: {
                        Haptics.success()
                        appState.completeDailyTaskItem(task.id)
                        appState.addXP(task.type == .vocabReview ? XPReward.perVocab : XPReward.perScene)
                    }
                )
            }
        }
    }

    // MARK: - Plan builder (simple local version of dailyTaskGenerator.ts)

    private func buildPlan() async {
        isLoading = true
        let today = SpacedRepetition.isoDay(Date())

        // Reuse existing plan if today's plan already generated
        if let existing = appState.progress.dailyTasks, existing.date == today {
            self.tasks = existing.items
            isLoading = false
            return
        }

        var items: [DailyTaskItem] = []

        // 1 vocab-review task
        items.append(DailyTaskItem(
            id: UUID().uuidString,
            type: .vocabReview,
            clipId: nil, lessonId: nil, vocabWordId: nil,
            estimatedSeconds: 180
        ))

        // Try to add a grammar-clip + new-content from curriculum
        if let curriculum = try? await CurriculumRepository.shared.curriculum() {
            let nextLesson = curriculum.flatMap { $0.lessons }
                .first(where: { appState.stage(for: $0.id) != .mastered })
            if let l = nextLesson {
                items.append(DailyTaskItem(
                    id: UUID().uuidString,
                    type: .grammarClip,
                    clipId: nil, lessonId: l.id, vocabWordId: nil,
                    estimatedSeconds: 240
                ))
                items.append(DailyTaskItem(
                    id: UUID().uuidString,
                    type: .newContent,
                    clipId: nil, lessonId: l.id, vocabWordId: nil,
                    estimatedSeconds: 180
                ))
            }
        }

        items.append(DailyTaskItem(
            id: UUID().uuidString,
            type: .listening,
            clipId: nil, lessonId: nil, vocabWordId: nil,
            estimatedSeconds: 120
        ))

        let bundle = DailyTaskBundle(date: today, items: items, completedItemIds: [])
        appState.setDailyTasks(bundle)
        self.tasks = items
        isLoading = false
    }
}

struct DailyTaskRow: View {
    @EnvironmentObject var appState: AppState
    let task: DailyTaskItem
    let done: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: done ? {} : onTap) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                        .fill(color.opacity(0.18))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(color)
                }
                .frame(width: 46, height: 46)
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(Theme.Font.headline(15, weight: .bold))
                        .foregroundStyle(done ? Theme.Color.textMuted : Theme.Color.textPrimary)
                        .strikethrough(done)
                    Text("\(task.estimatedSeconds / 60) min")
                        .font(Theme.Font.caption(11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer()
                if done {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(Theme.Color.success)
                } else {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(done ? Theme.Color.success.opacity(0.3) : Theme.Color.border, lineWidth: 1)
            )
            .opacity(done ? 0.7 : 1.0)
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private var color: Color {
        switch task.type {
        case .grammarClip: return Theme.Color.primary
        case .vocabReview: return Theme.Color.accent
        case .newContent:  return Theme.Color.success
        case .listening:   return Theme.Color.warning
        }
    }

    private var icon: String {
        switch task.type {
        case .grammarClip: return "film.fill"
        case .vocabReview: return "arrow.2.squarepath"
        case .newContent:  return "sparkles"
        case .listening:   return "ear.fill"
        }
    }

    private var label: String {
        switch task.type {
        case .grammarClip: return appState.t.t("taskGrammar")
        case .vocabReview: return appState.t.t("taskVocab")
        case .newContent:  return appState.t.t("taskNew")
        case .listening:   return appState.t.t("taskListening")
        }
    }
}
