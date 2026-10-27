import Foundation

/// Simplified SM-2-style spaced repetition, matching the RN service behavior.
///
/// All dates are `yyyy-MM-dd` strings of the learner's LOCAL calendar day
/// (compared lexicographically and persisted). Day strings used to be GMT
/// while intervals were added on the local calendar, so east of Greenwich a
/// word answered correctly was due again the same day.
enum SpacedRepetition {

    static let initialEaseFactor: Double = 2.5
    private static let efMin: Double = 1.3
    private static let efMax: Double = 2.5

    // MARK: - Local days

    /// The local calendar day of `date` in `calendar`'s time zone. Always
    /// Gregorian with ASCII digits whatever the device calendar or locale
    /// (a Thai device would otherwise write Buddhist year 2569).
    static func isoDay(_ date: Date, calendar: Calendar = .current) -> String {
        DayFormatterCache.shared.string(from: date, timeZone: calendar.timeZone)
    }

    /// The day `days` local days after (negative: before) `date`'s day.
    static func isoDay(byAdding days: Int, to date: Date, calendar: Calendar = .current) -> String {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        // Step whole days from local midnight so a DST change in between
        // can't push the result an hour into a neighbouring day.
        let start = gregorian.startOfDay(for: date)
        let shifted = gregorian.date(byAdding: .day, value: days, to: start)
            ?? start.addingTimeInterval(Double(days) * 86_400)
        return isoDay(shifted, calendar: gregorian)
    }

    // MARK: - Scheduling

    static func newEntry(wordId: String, now: Date = Date(), calendar: Calendar = .current) -> VocabPoolEntry {
        VocabPoolEntry(
            wordId: wordId,
            masteryLevel: .new,
            easeFactor: initialEaseFactor,
            interval: 0,
            nextReviewDate: isoDay(now, calendar: calendar),
            correctStreak: 0,
            totalReviews: 0,
            lastReviewDate: ""
        )
    }

    static func computeNextReview(
        _ entry: VocabPoolEntry,
        correct: Bool,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> VocabPoolEntry {
        let today = isoDay(now, calendar: calendar)
        var e = entry
        e.totalReviews += 1

        // A word can come up more than once a day. Only the first correct
        // answer of the day climbs the ladder (otherwise a few taps would
        // push it weeks out); a wrong answer always resets.
        if correct, entry.lastReviewDate == today, entry.interval > 0 {
            return e
        }

        e.lastReviewDate = today
        if correct {
            e.correctStreak += 1
            if e.interval == 0 { e.interval = 1 }
            else if e.interval == 1 { e.interval = 3 }
            else { e.interval = Int((Double(e.interval) * e.easeFactor).rounded()) }
            e.easeFactor = min(efMax, e.easeFactor + 0.1)
        } else {
            e.correctStreak = 0
            e.interval = 1
            e.easeFactor = max(efMin, e.easeFactor - 0.2)
        }

        e.masteryLevel = inferMastery(streak: e.correctStreak)
        e.nextReviewDate = isoDay(byAdding: e.interval, to: now, calendar: calendar)
        return e
    }

    static func inferMastery(streak: Int) -> MasteryLevel {
        if streak >= 5 { return .mastered }
        if streak >= 3 { return .familiar }
        if streak >= 1 { return .learning }
        return .new
    }

    static func dueEntries(_ pool: [VocabPoolEntry], now: Date = Date(), calendar: Calendar = .current) -> [VocabPoolEntry] {
        let today = isoDay(now, calendar: calendar)
        return pool.filter { $0.nextReviewDate <= today }
    }

    struct PoolStats {
        var total = 0
        var byLevel: [MasteryLevel: Int] = [:]
        var dueToday = 0
    }

    static func stats(_ pool: [VocabPoolEntry], now: Date = Date(), calendar: Calendar = .current) -> PoolStats {
        var s = PoolStats()
        s.total = pool.count
        for lvl in MasteryLevel.allCases { s.byLevel[lvl] = 0 }
        for e in pool {
            s.byLevel[e.masteryLevel, default: 0] += 1
        }
        s.dueToday = dueEntries(pool, now: now, calendar: calendar).count
        return s
    }
}

/// `DateFormatter` is expensive to create and day strings are formatted on
/// every review and streak check, so keep one per time zone. The lock makes
/// it safe off the main actor too.
private final class DayFormatterCache: @unchecked Sendable {
    static let shared = DayFormatterCache()

    private let lock = NSLock()
    private var formatters: [String: DateFormatter] = [:]

    func string(from date: Date, timeZone: TimeZone) -> String {
        lock.lock()
        defer { lock.unlock() }
        if let formatter = formatters[timeZone.identifier] {
            return formatter.string(from: date)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = timeZone
        formatter.calendar = gregorian
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatters[timeZone.identifier] = formatter
        return formatter.string(from: date)
    }
}
