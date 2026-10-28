import Foundation

/// The sentence a pattern card reads aloud, built from its chunks. A chunk
/// in parentheses is the subject Spanish drops ("(Yo) quiero comer"), shown
/// to explain the sentence but not said.
enum SpokenSentence {
    static func text(_ chunks: [String]) -> String {
        let said = chunks
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !($0.hasPrefix("(") && $0.hasSuffix(")")) }
        var out = said.joined(separator: " ")
        // The first letter after an opening ¿ or ¡ starts the sentence.
        if let i = out.firstIndex(where: { $0.isLetter }) {
            out.replaceSubrange(i...i, with: String(out[i]).uppercased())
        }
        if let last = out.last, !".?!…".contains(last) { out += "." }
        return out
    }
}
