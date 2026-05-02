import Foundation
import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {

    // MARK: - Published state

    @Published private(set) var isLoaded = false
    @Published var nativeLanguage: NativeLanguage = .tr {
        didSet { persistLanguage() ; rebuildTranslations() }
    }
    @Published private(set) var progress: UserProgress = UserProgress() {
        didSet { persistProgress() }
    }
    @Published private(set) var vocabPool: [String: VocabPoolEntry] = [:] {
        didSet { persistPool() }
    }
    /// Set of `Pattern.id`s the user has finished the akış for. Stored in
    /// its own UserDefaults key so adding it doesn't risk breaking the
    /// `UserProgress` Codable decoder for users with existing data.
    @Published private(set) var completedPatterns: Set<String> = [] {
        didSet { persistCompletedPatterns() }
    }
    @Published private(set) var t: Translations = Localization.bundle(for: .tr)

    /// True while an immersive ClipPlayerView is on screen — MainTabView
    /// reads this to hide the floating tab bar so the video can fill the
    /// chrome-free space. Set by VideoWatchView's onAppear / onDisappear.
    @Published var isVideoPlayerActive: Bool = false

    // MARK: - UserDefaults keys
    private enum Keys {
        static let nativeLanguage = "native_language"
        static let progress = "user_progress_v2"
        static let vocabPool = "vocab_pool_v2"
        static let completedPatterns = "completed_patterns_v1"
    }
    private let defaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        loadInitial()
    }

    // MARK: - Loading

    private func loadInitial() {
        if let raw = defaults.string(forKey: Keys.nativeLanguage),
           let lang = NativeLanguage(rawValue: raw) {
            nativeLanguage = lang
        }
        if let data = defaults.data(forKey: Keys.progress),
           let parsed = try? decoder.decode(UserProgress.self, from: data) {
            progress = parsed
        }
        if let data = defaults.data(forKey: Keys.vocabPool),
           let parsed = try? decoder.decode([String: VocabPoolEntry].self, from: data) {
            vocabPool = parsed
        }
        if let raw = defaults.array(forKey: Keys.completedPatterns) as? [String] {
            completedPatterns = Set(raw)
        }
        rebuildTranslations()
        isLoaded = true
    }

    private func rebuildTranslations() {
        t = Localization.bundle(for: nativeLanguage)
    }

    // MARK: - Persistence

    private func persistLanguage() {
        defaults.set(nativeLanguage.rawValue, forKey: Keys.nativeLanguage)
    }

    private func persistProgress() {
        guard let data = try? encoder.encode(progress) else { return }
        defaults.set(data, forKey: Keys.progress)
    }

    private func persistPool() {
        guard let data = try? encoder.encode(vocabPool) else { return }
        defaults.set(data, forKey: Keys.vocabPool)
    }

    private func persistCompletedPatterns() {
        defaults.set(Array(completedPatterns), forKey: Keys.completedPatterns)
    }

    // MARK: - Pattern progress

    func isPatternCompleted(_ id: String) -> Bool {
        completedPatterns.contains(id)
    }

    func markPatternComplete(_ id: String) {
        guard !completedPatterns.contains(id) else { return }
        completedPatterns.insert(id)
        Haptics.success()
    }

    // MARK: - XP / level

    var levelInfo: Levels.Info { Levels.info(forXP: progress.xp) }

    func addXP(_ amount: Int) {
        progress.xp += amount
        progress.level = Levels.levelFromXP(progress.xp)
        Haptics.success()
    }

    func markLessonComplete(_ id: String) {
        guard !progress.completedLessons.contains(id) else { return }
        progress.completedLessons.append(id)
        addXP(XPReward.perLesson)
    }

    func markVocabLearned(_ wordId: String) {
        guard !progress.learnedWords.contains(wordId) else { return }
        progress.learnedWords.append(wordId)
    }

    func markClipWatched(_ clipId: String) {
        guard !progress.watchedClips.contains(clipId) else { return }
        progress.watchedClips.append(clipId)
    }

    func markSceneWatched(_ id: String) {
        guard !progress.watchedScenes.contains(id) else { return }
        progress.watchedScenes.append(id)
    }

    func updateStreak() {
        let today = SpacedRepetition.isoDay(Date())
        guard progress.lastActiveDate != today else { return }
        let yesterday: String = {
            let cal = Calendar(identifier: .iso8601)
            if let d = cal.date(byAdding: .day, value: -1, to: Date()) {
                return SpacedRepetition.isoDay(d)
            }
            return ""
        }()
        if progress.lastActiveDate == yesterday {
            progress.streak += 1
        } else {
            progress.streak = max(progress.streak, 1)
            if progress.lastActiveDate.isEmpty == false { progress.streak = 1 }
            else { progress.streak = 1 }
        }
        progress.lastActiveDate = today
    }

    // MARK: - Onboarding

    func completeOnboarding(level: OnboardingLevel, goal: LearningGoal, minutes: Int) {
        progress.onboardingCompleted = true
        progress.onboardingLevel = level
        progress.learningGoal = goal
        progress.dailyGoalMinutes = minutes
        updateStreak()
    }

    // MARK: - Lesson mastery / sub-progress

    func mastery(for lessonId: String) -> LessonMastery {
        progress.lessonMastery[lessonId] ?? LessonMastery()
    }

    func subProgress(for lessonId: String) -> LessonProgress {
        progress.lessonMastery[lessonId]?.subProgress ?? LessonProgress()
    }

    func stage(for lessonId: String) -> LessonStage? {
        progress.lessonMastery[lessonId]?.stage
    }

    func updateSubProgress(lessonId: String, _ update: (inout LessonProgress) -> Void) {
        var current = mastery(for: lessonId)
        update(&current.subProgress)

        // Auto-derive stage
        let s = current.subProgress
        if s.testPassed {
            current.stage = .mastered
        } else if s.learnCompleted && s.vocabCompleted && s.watchCompleted {
            current.stage = .practice
        } else if s.watchCompleted {
            current.stage = .reinforce
        } else if s.vocabCompleted {
            current.stage = .watch
        } else if s.learnCompleted {
            current.stage = .watch
        } else {
            current.stage = .learn
        }
        progress.lessonMastery[lessonId] = current
    }

    func updateMastery(lessonId: String, _ update: (inout LessonMastery) -> Void) {
        var current = mastery(for: lessonId)
        update(&current)
        progress.lessonMastery[lessonId] = current
    }

    func recordLessonError(lessonId: String) {
        updateMastery(lessonId: lessonId) { m in
            let today = SpacedRepetition.isoDay(Date())
            let isNewSession = m.lastPracticeDate != today
            m.errorCount += 1
            if isNewSession { m.errorSessionCount += 1 }
            m.lastPracticeDate = today
        }
    }

    // MARK: - Vocab pool / spaced repetition

    func poolEntry(for wordId: String) -> VocabPoolEntry {
        vocabPool[wordId] ?? SpacedRepetition.newEntry(wordId: wordId)
    }

    func processReview(wordId: String, correct: Bool) {
        let current = poolEntry(for: wordId)
        let next = SpacedRepetition.computeNextReview(current, correct: correct)
        vocabPool[wordId] = next
        if correct {
            addXP(XPReward.perQuizCorrect)
        }
    }

    var dueForReview: [VocabPoolEntry] {
        SpacedRepetition.dueEntries(Array(vocabPool.values))
    }

    // MARK: - Daily tasks

    func setDailyTasks(_ bundle: DailyTaskBundle) {
        progress.dailyTasks = bundle
    }

    func completeDailyTaskItem(_ itemId: String) {
        guard var bundle = progress.dailyTasks else { return }
        guard !bundle.completedItemIds.contains(itemId) else { return }
        bundle.completedItemIds.append(itemId)
        progress.dailyTasks = bundle
    }

    // MARK: - Session log

    func logSession(_ entry: SessionEntry) {
        var history = progress.sessionHistory
        history.append(entry)
        if history.count > 90 { history = Array(history.suffix(90)) }
        progress.sessionHistory = history
    }

    // MARK: - Time of day

    var greetingKey: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "goodMorning" }
        if hour < 18 { return "goodAfternoon" }
        return "goodEvening"
    }
}
