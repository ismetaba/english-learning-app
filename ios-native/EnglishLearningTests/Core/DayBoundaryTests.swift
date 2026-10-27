import XCTest
@testable import EnglishLearning

/// Review dates and streaks must follow the learner's LOCAL calendar day.
/// Previously the day string was formatted in GMT while intervals were added
/// on the local calendar: in Istanbul (UTC+3) a word answered correctly with
/// interval 1 was due again the same day, and the streak day rolled over at
/// 03:00. The formatter also leaked the device calendar (Buddhist year 2569
/// on Thai devices, Arabic-Indic digits on ar_SA).
final class DayBoundaryTests: XCTestCase {

    private func calendar(_ tz: String, id: Calendar.Identifier = .gregorian, locale: String = "tr_TR") -> Calendar {
        var c = Calendar(identifier: id)
        c.timeZone = TimeZone(identifier: tz)!
        c.locale = Locale(identifier: locale)
        return c
    }

    private func date(_ s: String, _ tz: String) -> Date {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: tz)!
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    private let ist = "Europe/Istanbul"

    func test_isoDayUsesTheLocalDay() {
        let cal = calendar(ist)
        XCTAssertEqual(SpacedRepetition.isoDay(date("2026-07-02 10:00", ist), calendar: cal), "2026-07-02")
        XCTAssertEqual(SpacedRepetition.isoDay(date("2026-07-03 01:30", ist), calendar: cal), "2026-07-03",
                       "01:30 local is already the next day for the learner")
    }

    func test_isoDayIsAlwaysGregorianAsciiWhateverTheDeviceCalendar() {
        let now = date("2026-07-02 10:00", ist)
        XCTAssertEqual(SpacedRepetition.isoDay(now, calendar: calendar(ist, id: .buddhist, locale: "th_TH")), "2026-07-02")
        XCTAssertEqual(SpacedRepetition.isoDay(now, calendar: calendar(ist, id: .islamicUmmAlQura, locale: "ar_SA")), "2026-07-02")
    }

    func test_correctAnswerIsNotDueAgainTheSameDay() {
        let cal = calendar(ist)
        let now = date("2026-07-02 10:00", ist)
        let fresh = SpacedRepetition.newEntry(wordId: "a2-make", now: now, calendar: cal)
        let next = SpacedRepetition.computeNextReview(fresh, correct: true, now: now, calendar: cal)
        XCTAssertEqual(next.interval, 1)
        XCTAssertEqual(next.nextReviewDate, "2026-07-03")
        XCTAssertEqual(SpacedRepetition.dueEntries([next], now: now, calendar: cal).count, 0)
        XCTAssertEqual(SpacedRepetition.dueEntries([next], now: date("2026-07-03 00:05", ist), calendar: cal).count, 1)
    }

    func test_intervalLadder() {
        let cal = calendar(ist)
        var e = SpacedRepetition.newEntry(wordId: "w", now: date("2026-07-01 09:00", ist), calendar: cal)
        e = SpacedRepetition.computeNextReview(e, correct: true, now: date("2026-07-01 09:00", ist), calendar: cal)
        XCTAssertEqual(e.nextReviewDate, "2026-07-02")
        e = SpacedRepetition.computeNextReview(e, correct: true, now: date("2026-07-02 21:00", ist), calendar: cal)
        XCTAssertEqual(e.interval, 3)
        XCTAssertEqual(e.nextReviewDate, "2026-07-05")
    }

    func test_repeatingACorrectAnswerTheSameDayDoesNotInflateTheInterval() {
        let cal = calendar(ist)
        let now = date("2026-07-02 10:00", ist)
        var e = SpacedRepetition.newEntry(wordId: "w", now: now, calendar: cal)
        e = SpacedRepetition.computeNextReview(e, correct: true, now: now, calendar: cal)
        let again = SpacedRepetition.computeNextReview(e, correct: true, now: date("2026-07-02 10:05", ist), calendar: cal)
        XCTAssertEqual(again.interval, e.interval)
        XCTAssertEqual(again.nextReviewDate, e.nextReviewDate)
        XCTAssertEqual(again.totalReviews, e.totalReviews + 1)
    }

    func test_wrongAnswerResetsEvenOnTheSameDay() {
        let cal = calendar(ist)
        let now = date("2026-07-02 10:00", ist)
        var e = SpacedRepetition.newEntry(wordId: "w", now: now, calendar: cal)
        e = SpacedRepetition.computeNextReview(e, correct: true, now: now, calendar: cal)
        let wrong = SpacedRepetition.computeNextReview(e, correct: false, now: now, calendar: cal)
        XCTAssertEqual(wrong.interval, 1)
        XCTAssertEqual(wrong.correctStreak, 0)
    }

    // MARK: - Streak

    func test_streak() {
        let cal = calendar(ist)
        let now = date("2026-07-03 00:30", ist)
        XCTAssertEqual(Streak.next(streak: 0, lastActiveDay: "", now: now, calendar: cal).streak, 1, "first day")
        XCTAssertEqual(Streak.next(streak: 4, lastActiveDay: "2026-07-03", now: now, calendar: cal).streak, 4, "same day")
        XCTAssertEqual(Streak.next(streak: 4, lastActiveDay: "2026-07-02", now: now, calendar: cal).streak, 5,
                       "23:30 yesterday → 00:30 today continues the streak")
        XCTAssertEqual(Streak.next(streak: 4, lastActiveDay: "2026-06-30", now: now, calendar: cal).streak, 1, "gap resets")
        XCTAssertEqual(Streak.next(streak: 4, lastActiveDay: "2026-07-02", now: now, calendar: cal).lastActiveDay, "2026-07-03")
    }
}
