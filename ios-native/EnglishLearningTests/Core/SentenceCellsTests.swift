import XCTest
@testable import EnglishLearning

/// Reels render a sentence as cells: single words, or a phrasal verb
/// ("clean off") folded into one cell with one Turkish gloss.
final class SentenceCellsTests: XCTestCase {

    private func words(_ texts: [String], firstIndex: Int = 0) -> [ClipWord] {
        texts.enumerated().map { i, t in
            ClipWord(word: t, startTime: Double(i), endTime: Double(i) + 0.5, wordIndex: firstIndex + i,
                     starterId: nil, starterTr: nil, translationTr: nil)
        }
    }

    private func span(_ s: Int, _ e: Int, _ tr: String = "x") -> PhraseSpan {
        PhraseSpan(startIndex: s, endIndex: e, translationTr: tr, joinedText: "")
    }

    func test_plainSentenceIsOneCellPerWord() {
        let cells = SentenceCells.build(words: words(["I", "am", "happy"]), phrases: nil)
        XCTAssertEqual(cells, [.word(index: 0), .word(index: 1), .word(index: 2)])
    }

    func test_phrasalVerbFoldsIntoOneCell() {
        let cells = SentenceCells.build(words: words(["Clean", "it", "off", "now"]),
                                        phrases: [span(0, 2, "temizle")])
        XCTAssertEqual(cells, [.phrase(range: 0...2, translationTr: "temizle"), .word(index: 3)])
    }

    func test_spansAreMatchedByWordIndexNotArrayPosition() {
        // Context sentences can start mid-line: word_index 4,5,6.
        let cells = SentenceCells.build(words: words(["look", "at", "me"], firstIndex: 4),
                                        phrases: [span(4, 5, "bak")])
        XCTAssertEqual(cells, [.phrase(range: 0...1, translationTr: "bak"), .word(index: 2)])
    }

    /// Previously `for idx in p.startIndex...p.endIndex` trapped (crash)
    /// on an inverted span — one bad row would kill the whole feed.
    func test_malformedSpansAreIgnoredNotFatal() {
        let ws = words(["a", "b", "c", "d"])
        let cells = SentenceCells.build(words: ws, phrases: [
            span(2, 1),          // inverted
            span(7, 9),          // out of range
            span(3, 8),          // runs past the sentence
            span(0, 1, "ab"),
            span(1, 2, "bc"),    // overlaps an accepted span
        ])
        XCTAssertEqual(cells, [.phrase(range: 0...1, translationTr: "ab"), .word(index: 2), .word(index: 3)])
    }

    func test_everyWordAppearsExactlyOnce() throws {
        let feed = try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json")
        for item in feed.items {
            let cells = SentenceCells.build(words: item.context.words, phrases: item.context.phrases)
            var covered: [Int] = []
            for c in cells {
                switch c {
                case .word(let i): covered.append(i)
                case .phrase(let r, _): covered.append(contentsOf: r)
                }
            }
            XCTAssertEqual(covered, Array(item.context.words.indices), "line \(item.context.lineId)")
        }
    }
}
