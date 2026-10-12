import Foundation

/// Daily-activity streak over the learner's local calendar days, so activity
/// at 23:30 and again at 00:30 counts as two consecutive days (GMT day
/// strings used to roll over at 03:00 in Istanbul).
enum Streak {
    /// The streak after activity at `now`: unchanged on the same day, +1 when
    /// the last active day was yesterday, otherwise a fresh streak of 1.
    /// `lastActiveDay` is returned as today's `SpacedRepetition.isoDay`.
    static func next(streak: Int, lastActiveDay: String, now: Date, calendar: Calendar) -> (streak: Int, lastActiveDay: String) {
        let today = SpacedRepetition.isoDay(now, calendar: calendar)
        if lastActiveDay == today { return (streak, today) }
        let yesterday = SpacedRepetition.isoDay(byAdding: -1, to: now, calendar: calendar)
        return (lastActiveDay == yesterday ? streak + 1 : 1, today)
    }
}
