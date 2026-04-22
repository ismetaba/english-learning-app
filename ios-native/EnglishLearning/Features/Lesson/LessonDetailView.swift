import SwiftUI

@MainActor
final class LessonDetailViewModel: ObservableObject {
    @Published var detail: LessonDetail? = nil
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(id: String) async {
        isLoading = true
        errorMessage = nil
        do {
            self.detail = try await CurriculumRepository.shared.lesson(id: id)
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct LessonDetailView: View {
    @EnvironmentObject var appState: AppState
    let lessonId: String
    let lessonTitle: String

    @StateObject private var vm = LessonDetailViewModel()
    @State private var currentSubTask: SubTask = .learn
    @State private var showClips = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            Group {
                if vm.isLoading {
                    LoadingState(label: appState.t.t("loading"))
                } else if let err = vm.errorMessage {
                    ErrorState(message: err) { Task { await vm.load(id: lessonId) } }
                } else if let d = vm.detail {
                    content(d)
                }
            }
        }
        .navigationTitle(lessonTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .task { await vm.load(id: lessonId) }
        .onAppear {
            currentSubTask = nextSubTask(appState.subProgress(for: lessonId))
        }
        .navigationDestination(isPresented: $showClips) {
            if let d = vm.detail {
                LessonWatchView(lesson: d).environmentObject(appState)
            }
        }
    }

    @ViewBuilder
    private func content(_ detail: LessonDetail) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                heroCard(detail)
                subtaskStepper
                if let sections = detail.sections, !sections.isEmpty {
                    sectionsList(sections)
                } else {
                    basicLessonCard(detail)
                }
                actionButtons(detail)
                Spacer().frame(height: 60)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
    }

    // MARK: - Hero

    private func heroCard(_ d: LessonDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Chip(label: d.lessonType.capitalized, color: Theme.Color.primary)
                if let pattern = d.grammarPattern, !pattern.isEmpty {
                    Chip(label: pattern, color: Theme.Color.accent)
                }
                Spacer()
            }
            Text(d.displayTitle)
                .font(Theme.Font.display(26))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
                .fixedSize(horizontal: false, vertical: true)
            if let desc = d.description, !desc.isEmpty {
                Text(desc)
                    .font(Theme.Font.body(15))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineSpacing(3)
            }
            if let explain = d.grammarExplanationTr ?? d.grammarExplanation, !explain.isEmpty {
                Divider().background(Theme.Color.border)
                Text(explain)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineSpacing(3)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .fill(Theme.Gradient.cardGlow)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .strokeBorder(Theme.Color.borderAccent, lineWidth: 1)
        )
        .premiumShadow(.card)
    }

    // MARK: - Subtask stepper

    private var subtaskStepper: some View {
        let p = appState.subProgress(for: lessonId)
        let tasks: [(SubTask, String, String)] = [
            (.learn, "Learn", "book"),
            (.vocab, "Vocab", "character.book.closed"),
            (.watch, "Watch", "film"),
            (.test, "Test", "checkmark.shield")
        ]
        return HStack(spacing: 6) {
            ForEach(Array(tasks.enumerated()), id: \.offset) { idx, task in
                let done = isDone(task.0, p)
                let active = task.0 == currentSubTask
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .strokeBorder(
                                done ? Theme.Color.success :
                                    (active ? Theme.Color.primary : Theme.Color.border),
                                lineWidth: 2
                            )
                        if done {
                            Circle().fill(Theme.Color.success)
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        } else {
                            Image(systemName: task.2)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(active ? Theme.Color.primary : Theme.Color.textMuted)
                        }
                    }
                    .frame(width: 40, height: 40)
                    Text(task.1)
                        .font(Theme.Font.caption(11, weight: .bold))
                        .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textMuted)
                }
                .frame(maxWidth: .infinity)
                if idx < tasks.count - 1 {
                    Rectangle()
                        .fill(done ? Theme.Color.success : Theme.Color.border)
                        .frame(height: 2)
                        .offset(y: -14)
                }
            }
        }
    }

    private func isDone(_ task: SubTask, _ p: LessonProgress) -> Bool {
        switch task {
        case .learn: return p.learnCompleted
        case .vocab: return p.vocabCompleted
        case .watch: return p.watchCompleted
        case .test: return p.testPassed
        default: return false
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func sectionsList(_ sections: [LessonSection]) -> some View {
        ForEach(sections) { section in
            switch section {
            case .vocab(let s): VocabSectionCard(section: s)
            case .rule(let s): RuleSectionCard(section: s)
            case .tip(let s): TipSectionCard(section: s)
            case .dialogue(let s): DialogueSectionCard(section: s)
            case .exercise(let s):
                ExerciseSectionCard(section: s) { correct in
                    if correct { appState.addXP(XPReward.perQuizCorrect) }
                    else { appState.recordLessonError(lessonId: lessonId) }
                }
            }
        }
    }

    private func basicLessonCard(_ d: LessonDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(appState.t.t("examples"))
                .font(Theme.Font.headline(16, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
            if d.examples.isEmpty {
                Text("No examples available yet.")
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textMuted)
            } else {
                ForEach(Array(d.examples.enumerated()), id: \.offset) { _, ex in
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(Theme.Color.primary).frame(width: 6, height: 6).padding(.top, 8)
                        Text(ex)
                            .font(Theme.Font.body(15))
                            .foregroundStyle(Theme.Color.textPrimary)
                    }
                }
            }
        }
        .card()
    }

    // MARK: - Action buttons

    private func actionButtons(_ d: LessonDetail) -> some View {
        let p = appState.subProgress(for: lessonId)
        return VStack(spacing: 12) {
            PrimaryButton(
                title: labelForCurrentTask(p),
                icon: iconForCurrentTask(p),
                style: .primary
            ) {
                performCurrentTask(d, p: p)
            }
            if p.learnCompleted && p.vocabCompleted {
                PrimaryButton(
                    title: appState.t.t("watchClips"),
                    icon: "play.circle.fill",
                    style: .secondary
                ) {
                    showClips = true
                }
            }
        }
    }

    private func labelForCurrentTask(_ p: LessonProgress) -> String {
        switch nextSubTask(p) {
        case .learn: return appState.t.t("startLesson")
        case .vocab: return appState.t.t("studyVocab")
        case .watch: return appState.t.t("watchClips")
        case .test:  return appState.t.t("practiceTest")
        case .bonus: return appState.t.t("reviewLesson")
        default:     return appState.t.t("continue")
        }
    }

    private func iconForCurrentTask(_ p: LessonProgress) -> String {
        switch nextSubTask(p) {
        case .learn: return "book.fill"
        case .vocab: return "character.book.closed.fill"
        case .watch: return "play.circle.fill"
        case .test:  return "checkmark.shield.fill"
        default:     return "sparkles"
        }
    }

    private func performCurrentTask(_ d: LessonDetail, p: LessonProgress) {
        let next = nextSubTask(p)
        switch next {
        case .learn:
            appState.updateSubProgress(lessonId: lessonId) { $0.learnCompleted = true }
            appState.addXP(XPReward.perLesson / 3)
        case .vocab:
            appState.updateSubProgress(lessonId: lessonId) { $0.vocabCompleted = true }
            for section in d.sections ?? [] {
                if case let .vocab(vs) = section {
                    for word in vs.words {
                        appState.markVocabLearned(word.word)
                    }
                }
            }
            appState.addXP(XPReward.perVocab)
        case .watch:
            showClips = true
        case .test:
            // In a fuller version this would open a test flow; for now mark passed.
            appState.updateSubProgress(lessonId: lessonId) {
                $0.testPassed = true
                $0.testScore = 100
            }
            appState.markLessonComplete(lessonId)
        case .bonus:
            showClips = true
        default:
            break
        }
    }
}

// MARK: - Section cards

struct VocabSectionCard: View {
    let section: VocabSection

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                icon: "character.book.closed.fill",
                iconColor: Theme.Color.accent,
                title: section.title,
                subtitle: section.titleTr
            )
            VStack(spacing: 10) {
                ForEach(section.words) { w in
                    HStack(alignment: .top, spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: Theme.Radius.xs)
                                .fill(Theme.Color.accentSoft)
                            Image(systemName: "quote.bubble.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.accent)
                        }
                        .frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(w.word)
                                    .font(Theme.Font.headline(16, weight: .bold))
                                    .foregroundStyle(Theme.Color.textPrimary)
                                if let ipa = w.ipa {
                                    Text(ipa)
                                        .font(Theme.Font.mono(11))
                                        .foregroundStyle(Theme.Color.textMuted)
                                }
                            }
                            Text(w.translation)
                                .font(Theme.Font.body(13))
                                .foregroundStyle(Theme.Color.textSecondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.example)
                                    .font(Theme.Font.body(13))
                                    .italic()
                                    .foregroundStyle(Theme.Color.textPrimary)
                                Text(w.exampleTr)
                                    .font(Theme.Font.body(12))
                                    .foregroundStyle(Theme.Color.textMuted)
                            }
                            .padding(.top, 4)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .card(padding: 18)
    }
}

struct RuleSectionCard: View {
    let section: RuleSection

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                icon: "lightbulb.max.fill",
                iconColor: Theme.Color.warning,
                title: section.title,
                subtitle: section.titleTr
            )
            if let pattern = section.pattern, !pattern.isEmpty {
                Text(pattern)
                    .font(Theme.Font.mono(13, weight: .semibold))
                    .foregroundStyle(Theme.Color.accent)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Color.accentSoft, in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(section.explanation)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineSpacing(3)
                if !section.explanationTr.isEmpty {
                    Text(section.explanationTr)
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                        .lineSpacing(3)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("Examples")
                    .font(Theme.Font.headline(13, weight: .bold))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .textCase(.uppercase)
                    .tracking(0.6)
                ForEach(section.examples) { ex in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(ex.en)
                            .font(Theme.Font.body(14))
                            .foregroundStyle(Theme.Color.textPrimary)
                        Text(ex.tr)
                            .font(Theme.Font.body(13))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .card(padding: 18)
    }
}

struct TipSectionCard: View {
    let section: TipSection
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(
                icon: "sparkles",
                iconColor: Theme.Color.primary,
                title: section.title,
                subtitle: nil
            )
            Text(section.content)
                .font(Theme.Font.body(14))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineSpacing(3)
            if !section.contentTr.isEmpty {
                Text(section.contentTr)
                    .font(Theme.Font.body(13))
                    .foregroundStyle(Theme.Color.textMuted)
                    .lineSpacing(3)
            }
        }
        .card(padding: 18, border: Theme.Color.primaryGlow)
    }
}

struct DialogueSectionCard: View {
    let section: DialogueSection
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(
                icon: "bubble.left.and.bubble.right.fill",
                iconColor: Theme.Color.accent,
                title: section.title,
                subtitle: nil
            )
            VStack(alignment: .leading, spacing: 10) {
                ForEach(section.lines) { line in
                    HStack(alignment: .top, spacing: 10) {
                        ZStack {
                            Circle().fill(color(for: line.speaker).opacity(0.2))
                            Text(String(line.speaker.prefix(1)).uppercased())
                                .font(Theme.Font.caption(12, weight: .heavy))
                                .foregroundStyle(color(for: line.speaker))
                        }
                        .frame(width: 32, height: 32)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(line.speaker)
                                .font(Theme.Font.caption(11, weight: .bold))
                                .foregroundStyle(color(for: line.speaker))
                            Text(line.text)
                                .font(Theme.Font.body(14))
                                .foregroundStyle(Theme.Color.textPrimary)
                            Text(line.translation)
                                .font(Theme.Font.body(12))
                                .foregroundStyle(Theme.Color.textMuted)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .card(padding: 18)
    }

    private func color(for speaker: String) -> Color {
        let colors: [Color] = [Theme.Color.primary, Theme.Color.accent, Theme.Color.warning, Theme.Color.success]
        let hash = abs(speaker.hashValue) % colors.count
        return colors[hash]
    }
}

struct ExerciseSectionCard: View {
    let section: ExerciseSection
    var onAnswer: (Bool) -> Void

    @State private var answers: [Int: Int?] = [:]
    @State private var revealed: [Int: Bool] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                icon: "checklist",
                iconColor: Theme.Color.success,
                title: section.title,
                subtitle: nil
            )
            VStack(spacing: 14) {
                ForEach(Array(section.items.enumerated()), id: \.offset) { idx, item in
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(idx + 1). \(item.question)")
                            .font(Theme.Font.body(15, weight: .medium))
                            .foregroundStyle(Theme.Color.textPrimary)
                        VStack(spacing: 8) {
                            ForEach(Array(item.options.enumerated()), id: \.offset) { optIdx, opt in
                                optionRow(
                                    item: item,
                                    optionIdx: optIdx,
                                    option: opt,
                                    itemIdx: idx
                                )
                            }
                        }
                        if let answer = answers[idx] ?? nil, revealed[idx] == true {
                            HStack(spacing: 6) {
                                Image(systemName: answer == item.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(answer == item.correct ? Theme.Color.success : Theme.Color.error)
                                Text(answer == item.correct ? "Correct!" : "Correct answer: \(item.options[item.correct])")
                                    .font(Theme.Font.caption(13, weight: .bold))
                                    .foregroundStyle(answer == item.correct ? Theme.Color.success : Theme.Color.error)
                                if let hint = item.hint, !hint.isEmpty {
                                    Text("· \(hint)")
                                        .font(Theme.Font.body(12))
                                        .foregroundStyle(Theme.Color.textMuted)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .card(padding: 18)
    }

    private func optionRow(item: ExerciseSection.ExerciseItem, optionIdx: Int, option: String, itemIdx: Int) -> some View {
        let picked = answers[itemIdx] ?? nil
        let isPicked = picked == optionIdx
        let isCorrect = revealed[itemIdx] == true && optionIdx == item.correct
        let isWrongPick = revealed[itemIdx] == true && isPicked && optionIdx != item.correct

        return Button {
            guard revealed[itemIdx] != true else { return }
            answers[itemIdx] = optionIdx
            revealed[itemIdx] = true
            let correct = optionIdx == item.correct
            if correct { Haptics.success() } else { Haptics.error() }
            onAnswer(correct)
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .strokeBorder(borderFor(isCorrect: isCorrect, isWrong: isWrongPick, isPicked: isPicked), lineWidth: 2)
                    if isCorrect {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                        Circle().fill(Theme.Color.success).frame(width: 22, height: 22)
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                    } else if isWrongPick {
                        Circle().fill(Theme.Color.error).frame(width: 22, height: 22)
                        Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                    } else if isPicked {
                        Circle().fill(Theme.Color.primary).frame(width: 14, height: 14)
                    }
                }
                .frame(width: 22, height: 22)
                Text(option)
                    .font(Theme.Font.body(14, weight: .medium))
                    .foregroundStyle(Theme.Color.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(backgroundFor(isCorrect: isCorrect, isWrong: isWrongPick, isPicked: isPicked))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .strokeBorder(borderFor(isCorrect: isCorrect, isWrong: isWrongPick, isPicked: isPicked), lineWidth: 1.5)
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private func backgroundFor(isCorrect: Bool, isWrong: Bool, isPicked: Bool) -> Color {
        if isCorrect { return Theme.Color.successSoft }
        if isWrong { return Theme.Color.errorSoft }
        if isPicked { return Theme.Color.primarySoft }
        return Theme.Color.backgroundCard
    }

    private func borderFor(isCorrect: Bool, isWrong: Bool, isPicked: Bool) -> Color {
        if isCorrect { return Theme.Color.success }
        if isWrong { return Theme.Color.error }
        if isPicked { return Theme.Color.primary }
        return Theme.Color.border
    }
}

// MARK: - Section header helper

@ViewBuilder
private func sectionHeader(icon: String, iconColor: Color, title: String, subtitle: String?) -> some View {
    HStack(spacing: 12) {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                .fill(iconColor.opacity(0.18))
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iconColor)
        }
        .frame(width: 38, height: 38)
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(Theme.Font.headline(15, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
            if let subtitle = subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(Theme.Font.body(12))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
        Spacer(minLength: 0)
    }
}
