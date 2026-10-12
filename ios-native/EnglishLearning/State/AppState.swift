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

    /// Full-screen video surfaces currently on screen (see
    /// `hidesTabBarWhileVisible()`).
    @Published private var presence = ImmersivePresence()

    /// True while any immersive video screen is on screen — MainTabView
    /// reads this to hide the floating tab bar so the video can fill the
    /// chrome-free space.
    var isVideoPlayerActive: Bool { presence.isActive }

    /// The tab on screen. Screens switch tabs through this (an empty word
    /// list sends the learner to the sets, a finished set to their words).
    @Published var selectedTab: MainTab = .home

    /// Bumped by `showMyWords()`. The Kelimeler tab stays alive behind the
    /// others, so a jump to it from another tab must also bring it back to
    /// its root (an old word card may still be pushed) and onto the newest
    /// word; it watches this to know the jump was asked for.
    @Published private(set) var wordsRoute = 0

    /// Opens the Kelimeler tab at its root, on the word caught last.
    func showMyWords() {
        wordsRoute &+= 1
        selectedTab = .vocab
    }

    /// One playback speed for every player (portrait, cinema, reels), so a
    /// learner who slowed down doesn't snap back to native speed on the
    /// next video or in cinema mode. 0.75× by default: comprehension over
    /// speed for A2 learners.
    @Published var playbackRate: Double = 0.75 {
        didSet { defaults.set(playbackRate, forKey: Keys.playbackRate) }
    }

    /// The learner has added a word from a video at least once. Until then
    /// the player shows a one-time hint teaching the tap-to-add move.
    @Published private(set) var hasCaughtFirstWord = false

    // MARK: - UserDefaults keys
    private enum Keys {
        static let nativeLanguage = "native_language"
        static let completedPatterns = "completed_patterns_v1"
        static let playbackRate = "playback_rate_v1"
        static let hasCaughtFirstWord = "has_caught_first_word_v1"
    }
    private let defaults = UserDefaults.standard

    init() {
        loadInitial()
    }

    // MARK: - Loading

    private func loadInitial() {
        if let raw = defaults.string(forKey: Keys.nativeLanguage),
           let lang = NativeLanguage(rawValue: raw) {
            nativeLanguage = lang
        }
        // A blob that can't be decoded has already been backed up by
        // `ProgressPersistence`, so starting fresh can't destroy it.
        if let stored = ProgressPersistence.load(from: defaults) {
            progress = stored
        }
        if let stored = ProgressPersistence.loadVocabPool(from: defaults) {
            vocabPool = stored
        }
        if let raw = defaults.array(forKey: Keys.completedPatterns) as? [String] {
            completedPatterns = Set(raw)
        }
        let storedRate = defaults.double(forKey: Keys.playbackRate)
        if [0.5, 0.75, 1.0].contains(storedRate) {
            playbackRate = storedRate
        }
        hasCaughtFirstWord = defaults.bool(forKey: Keys.hasCaughtFirstWord) || !progress.learnedWords.isEmpty
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
        ProgressPersistence.save(progress, to: defaults)
    }

    private func persistPool() {
        ProgressPersistence.saveVocabPool(vocabPool, to: defaults)
    }

    private func persistCompletedPatterns() {
        defaults.set(Array(completedPatterns), forKey: Keys.completedPatterns)
    }

    // MARK: - Immersive presence

    /// Registers a full-screen video surface; the tab bar stays hidden until
    /// every registered token has exited, whatever order SwiftUI delivers
    /// the appear/disappear callbacks in.
    func enterImmersive(_ token: UUID) {
        presence.enter(token)
    }

    func exitImmersive(_ token: UUID) {
        presence.exit(token)
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
        markFirstWordCaught()
        guard !progress.learnedWords.contains(wordId) else { return }
        progress.learnedWords.append(wordId)
    }

    /// Ends the one-time tap-to-add hint (also when the learner dismisses it).
    func markFirstWordCaught() {
        guard !hasCaughtFirstWord else { return }
        hasCaughtFirstWord = true
        defaults.set(true, forKey: Keys.hasCaughtFirstWord)
    }

    func markClipWatched(_ clipId: String) {
        guard !progress.watchedClips.contains(clipId) else { return }
        progress.watchedClips.append(clipId)
    }

    func markSceneWatched(_ id: String) {
        guard !progress.watchedScenes.contains(id) else { return }
        progress.watchedScenes.append(id)
    }

    /// Records that the learner watched a `PocVideo` to the end.
    func markVideoWatched(_ videoId: String) {
        guard !progress.watchedVideos.contains(videoId) else { return }
        progress.watchedVideos.append(videoId)
    }

    func isVideoWatched(_ id: String) -> Bool {
        progress.watchedVideos.contains(id)
    }

    func updateStreak() {
        let next = Streak.next(
            streak: progress.streak,
            lastActiveDay: progress.lastActiveDate,
            now: Date(),
            calendar: .current
        )
        guard next.streak != progress.streak || next.lastActiveDay != progress.lastActiveDate else { return }
        // One assignment → one publish and one write.
        var updated = progress
        updated.streak = next.streak
        updated.lastActiveDate = next.lastActiveDay
        progress = updated
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
            let today = SpacedRepetition.isoDay(Date(), calendar: .current)
            let isNewSession = m.lastPracticeDate != today
            m.errorCount += 1
            if isNewSession { m.errorSessionCount += 1 }
            m.lastPracticeDate = today
        }
    }

    // MARK: - Vocab pool / spaced repetition

    func poolEntry(for wordId: String) -> VocabPoolEntry {
        vocabPool[wordId] ?? SpacedRepetition.newEntry(wordId: wordId, now: Date(), calendar: .current)
    }

    func processReview(wordId: String, correct: Bool) {
        let current = poolEntry(for: wordId)
        let next = SpacedRepetition.computeNextReview(current, correct: correct, now: Date(), calendar: .current)
        vocabPool[wordId] = next
        if correct {
            addXP(XPReward.perQuizCorrect)
        }
    }

    var dueForReview: [VocabPoolEntry] {
        SpacedRepetition.dueEntries(Array(vocabPool.values), now: Date(), calendar: .current)
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
