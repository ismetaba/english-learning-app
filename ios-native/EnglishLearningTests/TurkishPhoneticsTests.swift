import XCTest
@testable import EnglishLearning

/// Regression coverage for the okunuş dictionary used by the kalıp
/// example cards and the pattern reels.
///
/// The first crash we saw shipped a dictionary literal with duplicate
/// keys ("open"/"close"/"love"/"no"). Swift evaluates dictionary
/// literals lazily on first access, so the trap surfaces at the moment
/// the reels card calls `TurkishPhonetics.reading(_:)`. These tests
/// touch the table early so future edits get caught at test time
/// instead of in production.
final class TurkishPhoneticsTests: XCTestCase {

    /// If the dictionary literal contains duplicate keys, Swift traps
    /// with "Dictionary literal contains duplicate keys" on first
    /// access. Any non-nil lookup forces evaluation; the assert below
    /// proves we hit a real entry.
    func test_dictionaryEvaluatesWithoutDuplicateKeys() {
        XCTAssertEqual(TurkishPhonetics.reading(for: "I"), "ay")
        XCTAssertEqual(TurkishPhonetics.reading(for: "am"), "em")
        XCTAssertEqual(TurkishPhonetics.reading(for: "happy"), "hepi")
    }

    func test_caseAndPunctuationStripping() {
        // Trailing punctuation, capitalization, and curly apostrophe
        // should all normalize to the canonical lowercase key.
        XCTAssertEqual(TurkishPhonetics.reading(for: "Sorry,"), "sori")
        XCTAssertEqual(TurkishPhonetics.reading(for: "won't."), "vont")
        XCTAssertEqual(TurkishPhonetics.reading(for: "I’m"), "aym")
    }

    func test_unknownWordReturnsNil() {
        XCTAssertNil(TurkishPhonetics.reading(for: "antidisestablishmentarianism"))
        XCTAssertNil(TurkishPhonetics.reading(for: ""))
        XCTAssertNil(TurkishPhonetics.reading(for: "?!"))
    }

    /// Covers the 4 BE + adj subjects we ship phonetics for in the
    /// static example cards — the reels card should agree.
    func test_beAdjSubjectsAndAuxes() {
        XCTAssertEqual(TurkishPhonetics.reading(for: "you"), "yu")
        XCTAssertEqual(TurkishPhonetics.reading(for: "he"), "hi")
        XCTAssertEqual(TurkishPhonetics.reading(for: "she"), "şi")
        XCTAssertEqual(TurkishPhonetics.reading(for: "it"), "it")
        XCTAssertEqual(TurkishPhonetics.reading(for: "we"), "vi")
        XCTAssertEqual(TurkishPhonetics.reading(for: "they"), "dey")
        XCTAssertEqual(TurkishPhonetics.reading(for: "is"), "iz")
        XCTAssertEqual(TurkishPhonetics.reading(for: "are"), "ar")
    }
}
