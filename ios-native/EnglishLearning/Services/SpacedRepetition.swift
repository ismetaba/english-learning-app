import Foundation

/// Simplified SM-2-style spaced repetition, matching the RN service behavior.
enum SpacedRepetition {

    private static let ef0: Double = 2.5
    private static let efMin: Double = 1.3
    private static let efMax: Double = 2.5

    private static var today: String { Self.isoDay(Date()) }

    static func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f.string(from: date)
    }

    static func newEntry(wordId: String) -> VocabPoolEntry {
        VocabPoolEntry(
            wordId: wordId,
            masteryLevel: .new,
            easeFactor: ef0,
            interval: 0,
            nextReviewDate: today,
            correctStreak: 0,
            totalReviews: 0,
            lastReviewDate: ""
        )
    }

    static func computeNextReview(_ entry: VocabPoolEntry, correct: Bool) -> VocabPoolEntry {
        var e = entry
        e.totalReviews += 1
        e.lastReviewDate = today

        if correct {
            e.correctStreak += 1
            let newInterval: Int
            if e.interval == 0 { newInterval = 1 }
            else if e.interval == 1 { newInterval = 3 }
            else { newInterval = Int((Double(e.interval) * e.easeFactor).rounded()) }
            e.interval = newInterval
            e.easeFactor = min(efMax, e.easeFactor + 0.1)
        } else {
            e.correctStreak = 0
            e.interval = 1
            e.easeFactor = max(efMin, e.easeFactor - 0.2)
        }

        e.masteryLevel = inferMastery(streak: e.correctStreak)

        let calendar = Calendar(identifier: .iso8601)
        if let base = calendar.date(from: calendar.dateComponents([.year, .month, .day], from: Date())),
           let next = calendar.date(byAdding: .day, value: e.interval, to: base) {
            e.nextReviewDate = isoDay(next)
        }
        return e
    }

    static func inferMastery(streak: Int) -> MasteryLevel {
        if streak >= 5 { return .mastered }
        if streak >= 3 { return .familiar }
        if streak >= 1 { return .learning }
        return .new
    }

    static func dueEntries(_ pool: [VocabPoolEntry]) -> [VocabPoolEntry] {
        let t = today
        return pool.filter { $0.nextReviewDate <= t }
    }

    struct PoolStats {
        var total = 0
        var byLevel: [MasteryLevel: Int] = [:]
        var dueToday = 0
    }

    static func stats(_ pool: [VocabPoolEntry]) -> PoolStats {
        var s = PoolStats()
        s.total = pool.count
        for lvl in MasteryLevel.allCases { s.byLevel[lvl] = 0 }
        for e in pool {
            s.byLevel[e.masteryLevel, default: 0] += 1
        }
        s.dueToday = dueEntries(pool).count
        return s
    }
}
