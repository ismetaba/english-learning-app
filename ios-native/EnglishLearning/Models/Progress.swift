import Foundation

// MARK: - Native language

enum NativeLanguage: String, Codable, CaseIterable, Identifiable {
    case tr, es, ar, zh, pt, en
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .tr: return "Türkçe"
        case .es: return "Español"
        case .ar: return "العربية"
        case .zh: return "中文"
        case .pt: return "Português"
        case .en: return "English"
        }
    }

    var flag: String {
        switch self {
        case .tr: return "🇹🇷"
        case .es: return "🇪🇸"
        case .ar: return "🇸🇦"
        case .zh: return "🇨🇳"
        case .pt: return "🇧🇷"
        case .en: return "🇬🇧"
        }
    }
}

// MARK: - Onboarding

enum OnboardingLevel: String, Codable, CaseIterable {
    case none = ""
    case beginner, elementary, intermediate
}

enum LearningGoal: String, Codable, CaseIterable {
    case none = ""
    case travel, work, school, personal
}

// MARK: - Lesson mastery stages

enum LessonStage: String, Codable {
    case learn, watch, practice, reinforce, mastered, reviewNeeded = "review_needed"
}

struct LessonProgress: Codable, Equatable, Hashable {
    var learnCompleted: Bool = false
    var vocabCompleted: Bool = false
    var watchCompleted: Bool = false
    var testScore: Int? = nil
    var testPassed: Bool = false
    var bonusWatchCount: Int = 0

    var completedCount: Int {
        (learnCompleted ? 1 : 0) + (vocabCompleted ? 1 : 0) + (watchCompleted ? 1 : 0)
    }
}

enum SubTask: String {
    case learn, vocab, watch, test, bonus, done
}

func nextSubTask(_ p: LessonProgress) -> SubTask {
    if !p.learnCompleted { return .learn }
    if !p.vocabCompleted { return .vocab }
    if !p.watchCompleted { return .watch }
    if !p.testPassed     { return .test }
    return .bonus
}

func isSubTaskUnlocked(_ p: LessonProgress, task: SubTask) -> Bool {
    switch task {
    case .learn: return true
    case .vocab: return p.learnCompleted
    case .watch: return p.vocabCompleted
    default: return false
    }
}

struct LessonMastery: Codable, Equatable, Hashable {
    var stage: LessonStage = .learn
    var subProgress: LessonProgress = LessonProgress()
    var watchQuizScore: Int = 0
    var watchClipsCompleted: Int = 0
    var practiceScore: Int = 0
    var practiceAttempts: Int = 0
    var reinforceClipsWatched: Int = 0
    var lastPracticeDate: String = ""
    var errorCount: Int = 0
    var errorSessionCount: Int = 0
}

struct CheckpointResult: Codable, Equatable {
    let score: Int
    let perLessonScores: [String: Int]
    let attemptCount: Int
    let passedAt: String?
}

struct SessionEntry: Codable, Equatable, Identifiable {
    let date: String
    let minutesWatched: Double
    let xpEarned: Int
    let clipsWatched: Int
    let wordsReviewed: Int
    var id: String { date }
}

// MARK: - Daily tasks

enum DailyTaskType: String, Codable {
    case grammarClip = "grammar-clip"
    case vocabReview = "vocab-review"
    case newContent  = "new-content"
    case listening
}

struct DailyTaskItem: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let type: DailyTaskType
    let clipId: String?
    let lessonId: String?
    let vocabWordId: String?
    let estimatedSeconds: Int
}

struct DailyTaskBundle: Codable, Equatable {
    var date: String
    var items: [DailyTaskItem]
    var completedItemIds: [String]
}

// MARK: - User Progress

struct UserProgress: Codable, Equatable {
    var completedLessons: [String] = []
    var learnedWords: [String] = []
    var watchedScenes: [String] = []
    var xp: Int = 0
    var level: Int = 1
    var streak: Int = 0
    var lastActiveDate: String = ""
    var onboardingCompleted: Bool = false
    var onboardingLevel: OnboardingLevel = .none
    var learningGoal: LearningGoal = .none
    var dailyGoalMinutes: Int = 10

    var lessonMastery: [String: LessonMastery] = [:]
    var checkpointResults: [String: CheckpointResult] = [:]
    var sessionHistory: [SessionEntry] = []
    var dailyTasks: DailyTaskBundle? = nil
    var achievements: [String] = []
    var watchedClips: [String] = []
    /// `PocVideo.id`s the learner watched to the end (set flow).
    var watchedVideos: [String] = []
}

// MARK: - Tolerant decoding
//
// `UserProgress` is persisted as a single JSON blob. Synthesized `Decodable`
// throws on any missing key or unknown enum raw value, so adding a field (as
// `watchedVideos` did) made every existing blob unreadable and the learner's
// progress was replaced with an empty record. Every field below falls back to
// its declared default instead; only a value of the wrong JSON type still
// throws, which `ProgressPersistence` treats as corruption and backs up.
// Encoding stays synthesized, so the on-disk format is unchanged.
//
// When adding a stored property to any of these types, decode it here with
// `decodeIfPresent` too.

private extension KeyedDecodingContainer {
    /// `decodeIfPresent` for String-backed enums that also maps a raw value
    /// this build doesn't know (a case added in a later version) to `nil`.
    func decodeKnownCase<E: RawRepresentable>(_ type: E.Type, forKey key: Key) throws -> E? where E.RawValue == String {
        try decodeIfPresent(String.self, forKey: key).flatMap(E.init(rawValue:))
    }
}

extension UserProgress {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        completedLessons = try c.decodeIfPresent([String].self, forKey: .completedLessons) ?? completedLessons
        learnedWords = try c.decodeIfPresent([String].self, forKey: .learnedWords) ?? learnedWords
        watchedScenes = try c.decodeIfPresent([String].self, forKey: .watchedScenes) ?? watchedScenes
        xp = try c.decodeIfPresent(Int.self, forKey: .xp) ?? xp
        level = try c.decodeIfPresent(Int.self, forKey: .level) ?? level
        streak = try c.decodeIfPresent(Int.self, forKey: .streak) ?? streak
        lastActiveDate = try c.decodeIfPresent(String.self, forKey: .lastActiveDate) ?? lastActiveDate
        onboardingCompleted = try c.decodeIfPresent(Bool.self, forKey: .onboardingCompleted) ?? onboardingCompleted
        onboardingLevel = try c.decodeKnownCase(OnboardingLevel.self, forKey: .onboardingLevel) ?? onboardingLevel
        learningGoal = try c.decodeKnownCase(LearningGoal.self, forKey: .learningGoal) ?? learningGoal
        dailyGoalMinutes = try c.decodeIfPresent(Int.self, forKey: .dailyGoalMinutes) ?? dailyGoalMinutes
        lessonMastery = try c.decodeIfPresent([String: LessonMastery].self, forKey: .lessonMastery) ?? lessonMastery
        checkpointResults = try c.decodeIfPresent([String: CheckpointResult].self, forKey: .checkpointResults) ?? checkpointResults
        sessionHistory = try c.decodeIfPresent([SessionEntry].self, forKey: .sessionHistory) ?? sessionHistory
        // Regenerated every day, so a bundle this build can't read (e.g. a
        // task type added later) is dropped rather than failing the blob.
        dailyTasks = try? c.decodeIfPresent(DailyTaskBundle.self, forKey: .dailyTasks)
        achievements = try c.decodeIfPresent([String].self, forKey: .achievements) ?? achievements
        watchedClips = try c.decodeIfPresent([String].self, forKey: .watchedClips) ?? watchedClips
        watchedVideos = try c.decodeIfPresent([String].self, forKey: .watchedVideos) ?? watchedVideos
    }
}

extension LessonMastery {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stage = try c.decodeKnownCase(LessonStage.self, forKey: .stage) ?? stage
        subProgress = try c.decodeIfPresent(LessonProgress.self, forKey: .subProgress) ?? subProgress
        watchQuizScore = try c.decodeIfPresent(Int.self, forKey: .watchQuizScore) ?? watchQuizScore
        watchClipsCompleted = try c.decodeIfPresent(Int.self, forKey: .watchClipsCompleted) ?? watchClipsCompleted
        practiceScore = try c.decodeIfPresent(Int.self, forKey: .practiceScore) ?? practiceScore
        practiceAttempts = try c.decodeIfPresent(Int.self, forKey: .practiceAttempts) ?? practiceAttempts
        reinforceClipsWatched = try c.decodeIfPresent(Int.self, forKey: .reinforceClipsWatched) ?? reinforceClipsWatched
        lastPracticeDate = try c.decodeIfPresent(String.self, forKey: .lastPracticeDate) ?? lastPracticeDate
        errorCount = try c.decodeIfPresent(Int.self, forKey: .errorCount) ?? errorCount
        errorSessionCount = try c.decodeIfPresent(Int.self, forKey: .errorSessionCount) ?? errorSessionCount
    }
}

extension LessonProgress {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        learnCompleted = try c.decodeIfPresent(Bool.self, forKey: .learnCompleted) ?? learnCompleted
        vocabCompleted = try c.decodeIfPresent(Bool.self, forKey: .vocabCompleted) ?? vocabCompleted
        watchCompleted = try c.decodeIfPresent(Bool.self, forKey: .watchCompleted) ?? watchCompleted
        testScore = try c.decodeIfPresent(Int.self, forKey: .testScore)
        testPassed = try c.decodeIfPresent(Bool.self, forKey: .testPassed) ?? testPassed
        bonusWatchCount = try c.decodeIfPresent(Int.self, forKey: .bonusWatchCount) ?? bonusWatchCount
    }
}

extension CheckpointResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        score = try c.decodeIfPresent(Int.self, forKey: .score) ?? 0
        perLessonScores = try c.decodeIfPresent([String: Int].self, forKey: .perLessonScores) ?? [:]
        attemptCount = try c.decodeIfPresent(Int.self, forKey: .attemptCount) ?? 0
        passedAt = try c.decodeIfPresent(String.self, forKey: .passedAt)
    }
}

extension SessionEntry {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decodeIfPresent(String.self, forKey: .date) ?? ""
        minutesWatched = try c.decodeIfPresent(Double.self, forKey: .minutesWatched) ?? 0
        xpEarned = try c.decodeIfPresent(Int.self, forKey: .xpEarned) ?? 0
        clipsWatched = try c.decodeIfPresent(Int.self, forKey: .clipsWatched) ?? 0
        wordsReviewed = try c.decodeIfPresent(Int.self, forKey: .wordsReviewed) ?? 0
    }
}

// MARK: - Level helpers

enum Levels {
    static let thresholds: [Int] = [0, 50, 150, 300, 500, 800, 1200]
    static let names: [String] = [
        "Beginner", "Elementary", "Pre-Intermediate",
        "Intermediate", "Upper-Intermediate", "Advanced", "Expert"
    ]

    static func levelFromXP(_ xp: Int) -> Int {
        for i in stride(from: thresholds.count - 1, through: 0, by: -1) {
            if xp >= thresholds[i] { return i + 1 }
        }
        return 1
    }

    struct Info {
        let level: Int
        let current: Int
        let next: Int
        let percent: Double
        let name: String
    }

    static func info(forXP xp: Int) -> Info {
        let level = levelFromXP(xp)
        let idx = level - 1
        let current = thresholds[safe: idx] ?? 0
        let next = thresholds[safe: idx + 1] ?? (current + 500)
        let denom = max(Double(next - current), 1)
        let percent = min(Double(xp - current) / denom * 100.0, 100)
        let name = names[safe: idx] ?? "Expert"
        return Info(level: level, current: current, next: next, percent: percent, name: name)
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

enum XPReward {
    static let perLesson = 20
    static let perVocab = 15
    static let perScene = 10
    static let perQuizCorrect = 5
    static let perReview = 25
}
