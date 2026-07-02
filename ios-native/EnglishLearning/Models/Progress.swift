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
