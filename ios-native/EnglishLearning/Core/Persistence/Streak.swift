import Foundation

// STUB — API contract only. Implementation pending (see DayBoundaryTests).

enum Streak {
    static func next(streak: Int, lastActiveDay: String, now: Date, calendar: Calendar) -> (streak: Int, lastActiveDay: String) {
        let today = SpacedRepetition.isoDay(now)
        if lastActiveDay == today { return (streak, today) }
        return (1, today)
    }
}
