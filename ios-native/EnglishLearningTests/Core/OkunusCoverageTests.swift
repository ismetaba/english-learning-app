import XCTest
@testable import EnglishLearning

/// Every word a learner can catch from a video shows its okunuş on the
/// reel card, the word page and the list tile. The fixture is every
/// starter word tagged in an approved PoC clip (production data,
/// 2026-10-12); none of the 10 that were missing has an IPA either, so
/// their pronunciation row was simply blank.
final class OkunusCoverageTests: XCTestCase {

    private struct StarterWord: Decodable {
        let id: String
        let word: String
    }

    func test_everyCatchableStarterWordHasAnOkunus() throws {
        let words = try Fixture.decode([StarterWord].self, "catchable-starter-words.json")
        XCTAssertEqual(words.count, 98)
        let missing = words.filter { TurkishPhonetics.reading(for: $0.word) == nil }.map(\.word)
        XCTAssertEqual(missing, [], "no okunuş for \(missing.count) catchable words")
    }

    func test_newReadingsFollowTheTableConventions() {
        // /oʊ/ → o, /ʃ/ → ş, /tʃ/ → ç, /eɪ/ → ey, /ʌ/ → a, /w/ → v, /aɪ/ → ay
        XCTAssertEqual(TurkishPhonetics.reading(for: "show"), "şo")
        XCTAssertEqual(TurkishPhonetics.reading(for: "change"), "çeync")
        XCTAssertEqual(TurkishPhonetics.reading(for: "hope"), "hop")
        XCTAssertEqual(TurkishPhonetics.reading(for: "become"), "bikam")
        XCTAssertEqual(TurkishPhonetics.reading(for: "week"), "vik")
        XCTAssertEqual(TurkishPhonetics.reading(for: "drive"), "drayv")
    }
}
