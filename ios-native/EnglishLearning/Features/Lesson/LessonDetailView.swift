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
    @State private var showClips = false
    @Environment(\.dismiss) private var dismiss

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
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("LESSON")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(Theme.Color.textMuted)
                    Text(lessonTitle)
                        .font(Theme.Font.headline(15, weight: .semibold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(1)
                }
            }
        }
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(id: lessonId) }
        .navigationDestination(isPresented: $showClips) {
            if let d = vm.detail {
                LessonWatchView(lesson: d).environmentObject(appState)
            }
        }
    }

    @ViewBuilder
    private func content(_ detail: LessonDetail) -> some View {
        GeometryReader { geo in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    heroCard(detail)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)

                    subtaskStepper
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                        .padding(.bottom, 20)

                    sectionsOrFallback(detail)
                        .padding(.horizontal, 20)

                    Spacer().frame(height: 24)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Sticky action bar
            VStack(spacing: 0) {
                Spacer()
                actionBar(detail)
            }
            .ignoresSafeArea(.keyboard)
        }
    }

    // MARK: - Hero card

    private func heroCard(_ d: LessonDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // Meta strip
            HStack(spacing: 6) {
                MetaTag(text: d.lessonType.uppercased(), color: Theme.Color.primary)
                if let _ = d.grammarPattern {
                    MetaTag(text: "A1", color: Theme.Color.accent)
                }
                Spacer()
            }

            // Title
            Text(d.displayTitle)
                .font(Theme.Font.title(26, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.4)
                .fixedSize(horizontal: false, vertical: true)

            if d.title != d.displayTitle {
                Text(d.title)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
            }

            // Grammar pattern as a tasteful formula block
            if let pattern = d.grammarPattern, !pattern.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "function")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(Theme.Color.accent)
                        Text("PATTERN")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(1.2)
                            .foregroundStyle(Theme.Color.accent)
                    }
                    Text(pattern)
                        .font(Theme.Font.mono(13, weight: .semibold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Color.backgroundElevated)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Theme.Color.accent.opacity(0.2), lineWidth: 1)
                )
            }

            // Description / grammar explanation
            if let explain = d.grammarExplanationTr ?? d.grammarExplanation ?? d.description,
               !explain.isEmpty {
                Text(explain)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }

    // MARK: - Subtask stepper — connecting line fixed

    private var subtaskStepper: some View {
        let p = appState.subProgress(for: lessonId)
        let steps: [(SubTask, String, String)] = [
            (.learn, "Learn", "book"),
            (.vocab, "Vocab", "character.book.closed"),
            (.watch, "Watch", "play.rectangle"),
            (.test, "Test", "checkmark.shield")
        ]
        let currentTask = nextSubTask(p)

        return VStack(spacing: 8) {
            ZStack(alignment: .top) {
                // Connecting line — positioned to sit behind the circles
                HStack(spacing: 0) {
                    ForEach(0..<(steps.count - 1), id: \.self) { i in
                        Rectangle()
                            .fill(connectorColor(forIndex: i, steps: steps, p: p))
                            .frame(height: 2)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 19)

                HStack(spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                        let done = isDone(step.0, p)
                        let active = step.0 == currentTask
                        VStack(spacing: 8) {
                            stepCircle(icon: step.2, done: done, active: active)
                            Text(step.1)
                                .font(.system(size: 11, weight: active ? .bold : .semibold))
                                .foregroundStyle(active ? Theme.Color.textPrimary : Theme.Color.textMuted)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func connectorColor(forIndex i: Int, steps: [(SubTask, String, String)], p: LessonProgress) -> Color {
        let a = steps[i].0, b = steps[i + 1].0
        if isDone(a, p) && isDone(b, p) { return Theme.Color.success.opacity(0.7) }
        if isDone(a, p) { return Theme.Color.primary.opacity(0.4) }
        return Theme.Color.border
    }

    private func stepCircle(icon: String, done: Bool, active: Bool) -> some View {
        ZStack {
            Circle().fill(Theme.Color.background)
            Circle()
                .strokeBorder(
                    done ? Theme.Color.success :
                    active ? Theme.Color.primary : Theme.Color.border,
                    lineWidth: 2
                )
            if done {
                Circle().fill(Theme.Color.success)
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
            } else if active {
                Circle().fill(Theme.Color.primary)
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
            } else {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
        .frame(width: 38, height: 38)
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
    private func sectionsOrFallback(_ d: LessonDetail) -> some View {
        if let sections = d.sections, !sections.isEmpty {
            VStack(spacing: 14) {
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
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("Examples")
                    .font(Theme.Font.headline(15, weight: .semibold))
                    .foregroundStyle(Theme.Color.textPrimary)
                if d.examples.isEmpty {
                    Text("No examples yet.")
                        .font(Theme.Font.body(14))
                        .foregroundStyle(Theme.Color.textMuted)
                } else {
                    ForEach(Array(d.examples.enumerated()), id: \.offset) { _, ex in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(Theme.Color.primary).frame(width: 5, height: 5).padding(.top, 8)
                            Text(ex)
                                .font(Theme.Font.body(15))
                                .foregroundStyle(Theme.Color.textPrimary)
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.Color.backgroundCard))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.Color.border, lineWidth: 1))
        }
    }

    // MARK: - Sticky action bar

    private func actionBar(_ d: LessonDetail) -> some View {
        let p = appState.subProgress(for: lessonId)
        return VStack(spacing: 0) {
            Rectangle()
                .fill(LinearGradient(
                    colors: [Theme.Color.background.opacity(0), Theme.Color.background],
                    startPoint: .top, endPoint: .bottom
                ))
                .frame(height: 24)
                .allowsHitTesting(false)
            HStack(spacing: 10) {
                if p.learnCompleted && p.vocabCompleted {
                    Button {
                        Haptics.medium()
                        showClips = true
                    } label: {
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.Color.textPrimary)
                            .frame(width: 52, height: 52)
                            .background(Theme.Color.backgroundElevated, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.Color.border, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                }
                PrimaryButton(
                    title: labelForCurrentTask(p),
                    icon: iconForCurrentTask(p),
                    style: .primary,
                    fullWidth: true
                ) { performCurrentTask(d, p: p) }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .padding(.top, 8)
            .background(Theme.Color.background)
        }
    }

    private func labelForCurrentTask(_ p: LessonProgress) -> String {
        switch nextSubTask(p) {
        case .learn: return "Start learning"
        case .vocab: return "Study vocabulary"
        case .watch: return "Watch clips"
        case .test: return "Take the test"
        case .bonus: return "Review again"
        default: return appState.t.t("continue")
        }
    }

    private func iconForCurrentTask(_ p: LessonProgress) -> String {
        switch nextSubTask(p) {
        case .learn: return "book.fill"
        case .vocab: return "character.book.closed.fill"
        case .watch: return "play.fill"
        case .test: return "checkmark.shield.fill"
        default: return "arrow.clockwise"
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
                    for word in vs.words { appState.markVocabLearned(word.word) }
                }
            }
            appState.addXP(XPReward.perVocab)
        case .watch:
            showClips = true
        case .test:
            appState.updateSubProgress(lessonId: lessonId) {
                $0.testPassed = true; $0.testScore = 100
            }
            appState.markLessonComplete(lessonId)
        case .bonus: showClips = true
        default: break
        }
    }
}

// MARK: - Meta tag

struct MetaTag: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.0)
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(color.opacity(0.14))
            )
            .overlay(
                Capsule().strokeBorder(color.opacity(0.28), lineWidth: 0.5)
            )
    }
}

// MARK: - Section header (used inside every section card)

struct SectionCardHeader: View {
    let icon: String
    let iconColor: Color
    let title: String
    var subtitle: String?

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(iconColor.opacity(0.16))
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
            }
            .frame(width: 34, height: 34)
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
}

// MARK: - Section cards (professional, restrained)

struct VocabSectionCard: View {
    let section: VocabSection

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCardHeader(
                icon: "character.book.closed.fill",
                iconColor: Theme.Color.accent,
                title: section.title,
                subtitle: section.titleTr
            )
            VStack(spacing: 8) {
                ForEach(section.words) { w in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(w.word)
                                .font(Theme.Font.headline(17, weight: .semibold))
                                .foregroundStyle(Theme.Color.textPrimary)
                            if let ipa = w.ipa, !ipa.isEmpty {
                                Text(ipa)
                                    .font(Theme.Font.mono(12))
                                    .foregroundStyle(Theme.Color.textMuted)
                            }
                            Spacer()
                            Text(w.translation)
                                .font(Theme.Font.body(14, weight: .medium))
                                .foregroundStyle(Theme.Color.textSecondary)
                                .lineLimit(1)
                        }
                        if !w.example.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.example)
                                    .font(Theme.Font.body(13))
                                    .foregroundStyle(Theme.Color.textPrimary.opacity(0.85))
                                    .italic()
                                Text(w.exampleTr)
                                    .font(Theme.Font.body(12))
                                    .foregroundStyle(Theme.Color.textMuted)
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .professionalCard()
    }
}

struct RuleSectionCard: View {
    let section: RuleSection

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCardHeader(
                icon: "text.alignleft",
                iconColor: Theme.Color.warning,
                title: section.title,
                subtitle: section.titleTr
            )
            if let pattern = section.pattern, !pattern.isEmpty {
                HStack {
                    Text(pattern)
                        .font(Theme.Font.mono(13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accent)
                    Spacer()
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Theme.Color.accentSoft)
                )
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
            if !section.examples.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("EXAMPLES")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.textMuted)
                    ForEach(section.examples) { ex in
                        VStack(alignment: .leading, spacing: 2) {
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
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Theme.Color.backgroundElevated)
                        )
                    }
                }
                .padding(.top, 2)
            }
        }
        .professionalCard()
    }
}

struct TipSectionCard: View {
    let section: TipSection
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionCardHeader(
                icon: "lightbulb.fill",
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
        .professionalCard(accent: Theme.Color.primary.opacity(0.25))
    }
}

struct DialogueSectionCard: View {
    let section: DialogueSection
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCardHeader(
                icon: "bubble.left.and.bubble.right.fill",
                iconColor: Theme.Color.levelElementary,
                title: section.title,
                subtitle: nil
            )
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(section.lines.enumerated()), id: \.offset) { idx, line in
                    HStack(alignment: .top, spacing: 10) {
                        ZStack {
                            Circle()
                                .fill(speakerColor(line.speaker, idx: idx).opacity(0.18))
                            Text(String(line.speaker.prefix(1)).uppercased())
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundStyle(speakerColor(line.speaker, idx: idx))
                        }
                        .frame(width: 28, height: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.speaker)
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(0.6)
                                .foregroundStyle(speakerColor(line.speaker, idx: idx))
                            Text(line.text)
                                .font(Theme.Font.body(14))
                                .foregroundStyle(Theme.Color.textPrimary)
                            Text(line.translation)
                                .font(Theme.Font.body(12))
                                .foregroundStyle(Theme.Color.textMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .professionalCard()
    }

    private func speakerColor(_ s: String, idx: Int) -> Color {
        let palette: [Color] = [Theme.Color.primary, Theme.Color.accent,
                                Theme.Color.warning, Theme.Color.success, Theme.Color.levelUpper]
        let hash = abs(s.hashValue) &+ idx
        return palette[hash % palette.count]
    }
}

struct ExerciseSectionCard: View {
    let section: ExerciseSection
    var onAnswer: (Bool) -> Void

    @State private var answers: [Int: Int] = [:]
    @State private var revealed: [Int: Bool] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCardHeader(
                icon: "checkmark.circle",
                iconColor: Theme.Color.success,
                title: section.title,
                subtitle: nil
            )
            VStack(spacing: 12) {
                ForEach(Array(section.items.enumerated()), id: \.offset) { idx, item in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(item.question)
                            .font(Theme.Font.body(14, weight: .medium))
                            .foregroundStyle(Theme.Color.textPrimary)
                        VStack(spacing: 6) {
                            ForEach(Array(item.options.enumerated()), id: \.offset) { optIdx, opt in
                                optionRow(item: item, optionIdx: optIdx, option: opt, itemIdx: idx)
                            }
                        }
                        if let answer = answers[idx], revealed[idx] == true {
                            feedbackLine(item: item, answer: answer)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.Color.backgroundElevated)
                    )
                }
            }
        }
        .professionalCard()
    }

    private func feedbackLine(item: ExerciseSection.ExerciseItem, answer: Int) -> some View {
        let correct = answer == item.correct
        return HStack(spacing: 6) {
            Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(correct ? Theme.Color.success : Theme.Color.error)
            Text(correct ? "Correct" : "Answer: \(item.options[item.correct])")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(correct ? Theme.Color.success : Theme.Color.error)
            if let hint = item.hint, !hint.isEmpty {
                Text("· \(hint)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.textMuted)
                    .lineLimit(2)
            }
        }
        .padding(.top, 2)
    }

    private func optionRow(item: ExerciseSection.ExerciseItem,
                           optionIdx: Int, option: String, itemIdx: Int) -> some View {
        let picked = answers[itemIdx]
        let isPicked = picked == optionIdx
        let isCorrect = revealed[itemIdx] == true && optionIdx == item.correct
        let isWrong = revealed[itemIdx] == true && isPicked && optionIdx != item.correct

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
                        .strokeBorder(borderFor(isCorrect: isCorrect, isWrong: isWrong, isPicked: isPicked), lineWidth: 1.5)
                    if isCorrect {
                        Circle().fill(Theme.Color.success)
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                    } else if isWrong {
                        Circle().fill(Theme.Color.error)
                        Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                    } else if isPicked {
                        Circle().fill(Theme.Color.primary).frame(width: 10, height: 10)
                    }
                }
                .frame(width: 18, height: 18)
                Text(option)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(backgroundFor(isCorrect: isCorrect, isWrong: isWrong, isPicked: isPicked))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(borderFor(isCorrect: isCorrect, isWrong: isWrong, isPicked: isPicked), lineWidth: 1)
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

// MARK: - Professional card modifier

private struct ProfessionalCard: ViewModifier {
    var accent: Color = Theme.Color.border
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(accent, lineWidth: 1)
            )
    }
}

extension View {
    fileprivate func professionalCard(accent: Color = Theme.Color.border) -> some View {
        modifier(ProfessionalCard(accent: accent))
    }
}
