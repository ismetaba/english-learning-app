import Foundation

/// One rendered unit of a reel sentence. Indices are positions in the
/// `words` array passed to `SentenceCells.build`.
enum SentenceCell: Equatable {
    case word(index: Int)
    case phrase(range: ClosedRange<Int>, translationTr: String)
}

enum SentenceCells {
    /// Folds phrase spans into single cells; every word appears in exactly
    /// one cell, in order. Spans are keyed by the server's `wordIndex`
    /// (context sentences can start mid-line), and spans that are inverted,
    /// reference missing words or overlap an earlier span are skipped —
    /// one bad row must not take down the feed.
    static func build(words: [ClipWord], phrases: [PhraseSpan]?) -> [SentenceCell] {
        var position: [Int: Int] = [:]
        for (i, w) in words.enumerated() {
            if let index = w.wordIndex, position[index] == nil { position[index] = i }
        }

        // phraseAt[p] = (last position, gloss) for an accepted span starting at p.
        var phraseAt: [Int: (end: Int, translationTr: String)] = [:]
        var covered = Set<Int>()
        for span in phrases ?? [] {
            guard span.startIndex <= span.endIndex,
                  let p = position[span.startIndex], let q = position[span.endIndex], p <= q,
                  covered.isDisjoint(with: p...q)
            else { continue }
            covered.formUnion(p...q)
            phraseAt[p] = (q, span.translationTr)
        }

        var cells: [SentenceCell] = []
        var i = 0
        while i < words.count {
            if let phrase = phraseAt[i] {
                cells.append(.phrase(range: i...phrase.end, translationTr: phrase.translationTr))
                i = phrase.end + 1
            } else {
                cells.append(.word(index: i))
                i += 1
            }
        }
        return cells
    }
}
