import Foundation

// STUB — API contract only. Implementation pending (see SentenceCellsTests).

/// One rendered unit of a reel sentence. Indices are positions in the
/// `words` array passed to `SentenceCells.build`.
enum SentenceCell: Equatable {
    case word(index: Int)
    case phrase(range: ClosedRange<Int>, translationTr: String)
}

enum SentenceCells {
    static func build(words: [ClipWord], phrases: [PhraseSpan]?) -> [SentenceCell] { [] }
}
