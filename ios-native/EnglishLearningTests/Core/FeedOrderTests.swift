import XCTest
@testable import EnglishLearning

/// Word Reels card order, on a real `/vocab-feed` response (4 words, 5
/// cards each, dealt time/try/life/make round-robin).
final class FeedOrderTests: XCTestCase {

    private func feed() throws -> [VocabFeedItem] {
        try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json").items
    }

    private func assertNoWordTwiceInARow(_ items: [VocabFeedItem], file: StaticString = #filePath, line: UInt = #line) {
        for (a, b) in zip(items, items.dropFirst()) {
            XCTAssertNotEqual(a.wordId, b.wordId, "\(a.id) then \(b.id)", file: file, line: line)
        }
    }

    // MARK: - Current behaviour

    func test_spliceKeepsTheCardsThroughTheOneOnScreen() throws {
        let all = try feed()
        let current = Array(all.prefix(10))
        let fresh = Array(all.reversed())
        let out = FeedOrder.splice(current: current, keepingThrough: current[3].id, fresh: fresh)

        XCTAssertEqual(Array(out.prefix(4)), Array(current.prefix(4)), "cards up to the one on screen stay put")
        XCTAssertEqual(Set(out.map(\.id)).count, out.count, "no card twice")
        XCTAssertEqual(Set(out.map(\.id)), Set(all.map(\.id)))
        assertNoWordTwiceInARow(out)
    }

    func test_spliceLeadsWithTheWordJustAdded() throws {
        let all = try feed()
        // Before: the learner's pool had no "make"; they were on card 2.
        let current = all.filter { $0.wordId != "a2-make" }
        let out = FeedOrder.splice(current: current, keepingThrough: current[2].id, fresh: all,
                                   leadingWord: "a2-make")
        XCTAssertEqual(out[3].wordId, "a2-make", "the new word is the next card")
        assertNoWordTwiceInARow(out)
    }

    func test_leadingWithNewestStartsOnTheNewestWord() throws {
        let all = try feed()
        let out = FeedOrder.leadingWithNewest(all, newestWordId: "a2-life")
        XCTAssertEqual(out.first?.wordId, "a2-life")
        let again = try XCTUnwrap(out.dropFirst().firstIndex { $0.wordId == "a2-life" })
        XCTAssertLessThanOrEqual(again, FeedOrder.wordCooldown + 1, "seen again soon")
        assertNoWordTwiceInARow(out)
        XCTAssertEqual(Set(out.map(\.id)), Set(all.map(\.id)))
    }

    // MARK: - "Kelimelerimi gör" lands on the word just caught

    /// Review round 2: the Kelimeler tab now stays alive behind the others,
    /// so after a set the feed is still on the reel the learner left. The
    /// reload puts the word they just caught one card *below* it, and
    /// "Kelimelerimi gör" showed the old reel instead of the new word.
    func test_reproduces_myWordsShowsTheOldReel() throws {
        let all = try feed()
        let current = all.filter { $0.wordId != "a2-make" }
        let onScreen = current[2]
        let out = FeedOrder.splice(current: current, keepingThrough: onScreen.id, fresh: all,
                                   leadingWord: "a2-make")
        XCTAssertEqual(out[2], onScreen, "the learner stays on the old word's reel")
        XCTAssertEqual(out[3].wordId, "a2-make", "the word they just caught is one card below")
    }

    func test_myWordsLandsOnTheWordJustCaught() throws {
        let all = try feed()
        let current = all.filter { $0.wordId != "a2-make" }
        let onScreen = current[2]
        let out = FeedOrder.splice(current: current, keepingThrough: onScreen.id, fresh: all,
                                   leadingWord: "a2-make")

        let landing = FeedOrder.landingId(in: out, from: onScreen.id, newestWordId: "a2-make")
        XCTAssertEqual(landing, out[3].id, "the next card, which is the new word's")
        XCTAssertEqual(out.first { $0.id == landing }?.wordId, "a2-make")
    }

    func test_myWordsStaysWhenAlreadyOnTheNewestWord() throws {
        let all = try feed()
        XCTAssertEqual(FeedOrder.landingId(in: all, from: all[3].id, newestWordId: "a2-make"), all[3].id)
    }

    func test_myWordsLandsOnTheNewestWordsNextCardNotAnEarlierOne() throws {
        let all = try feed()
        // On card 5 (try): make's cards are at 3 and 7; forward wins.
        XCTAssertEqual(FeedOrder.landingId(in: all, from: all[5].id, newestWordId: "a2-make"), all[7].id)
    }

    func test_myWordsFallsBackToTheNewestWordsFirstCard() throws {
        let all = try feed()
        // time, try, life, make, time, try: no "make" after the last card.
        let items = Array(all.prefix(6))
        XCTAssertEqual(FeedOrder.landingId(in: items, from: items[5].id, newestWordId: "a2-make"), items[3].id)
        XCTAssertEqual(FeedOrder.landingId(in: items, from: nil, newestWordId: "a2-make"), items[3].id)
        XCTAssertEqual(FeedOrder.landingId(in: items, from: "gone|0", newestWordId: "a2-make"), items[3].id)
    }

    func test_myWordsHasNoLandingWithoutACardForTheWord() throws {
        let all = try feed()
        XCTAssertNil(FeedOrder.landingId(in: all, from: all[0].id, newestWordId: "a2-unknown"))
        XCTAssertNil(FeedOrder.landingId(in: all, from: all[0].id, newestWordId: nil))
        XCTAssertNil(FeedOrder.landingId(in: [], from: nil, newestWordId: "a2-make"))
    }
}
