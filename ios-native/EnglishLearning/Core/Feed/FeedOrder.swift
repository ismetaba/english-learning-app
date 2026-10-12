import Foundation

/// Card order for the Word Reels feed. Pure, so it is tested on its own;
/// `VocabFeedViewModel` applies it to what the server deals.
enum FeedOrder {
    /// The server deals a word again only this many cards later.
    static let wordCooldown = 4

    /// `current` up to and including the card `keepId`, then the `fresh`
    /// cards it doesn't already hold (led by `leadingWord`'s first card when
    /// given); just `fresh` when there's nothing to keep.
    static func splice(current: [VocabFeedItem], keepingThrough keepId: String?,
                       fresh: [VocabFeedItem], leadingWord: String? = nil) -> [VocabFeedItem] {
        guard let keepId, let lastKept = current.firstIndex(where: { $0.id == keepId }) else { return fresh }
        let kept = Array(current[...lastKept])
        let keptIds = Set(kept.map(\.id))
        var upcoming = fresh.filter { !keptIds.contains($0.id) }
        if let leadingWord, let first = upcoming.firstIndex(where: { $0.wordId == leadingWord }) {
            let lead = upcoming.remove(at: first)
            upcoming.insert(lead, at: 0)
        }
        // The server never deals the same word twice in a row; keep that
        // true across the seam (the kept card anchors the pass).
        let separated = separatingRepeats([current[lastKept]] + upcoming)
        return kept + separated.dropFirst()
    }

    /// `fresh` starting with the newest word's first card, its next card
    /// brought up to `wordCooldown` (seen again soon, never back to back).
    /// `learnedWords` is append-only, so the pool's last id is the newest.
    static func leadingWithNewest(_ fresh: [VocabFeedItem], newestWordId: String?) -> [VocabFeedItem] {
        guard let newest = newestWordId,
              let first = fresh.firstIndex(where: { $0.wordId == newest }) else { return fresh }
        var out = fresh
        let lead = out.remove(at: first)
        var again: VocabFeedItem? = nil
        if let second = out.firstIndex(where: { $0.wordId == newest }) {
            again = out.remove(at: second)
        }
        out.insert(lead, at: 0)
        if let again { out.insert(again, at: min(wordCooldown, out.count)) }
        return separatingRepeats(out)
    }

    /// Moves cards forward so no word plays twice in a row, wherever a
    /// different word is left to fill the gap. The first card stays first.
    static func separatingRepeats(_ items: [VocabFeedItem]) -> [VocabFeedItem] {
        var out = items
        var k = 1
        while k < out.count {
            let previousWord = out[k - 1].wordId
            if out[k].wordId == previousWord,
               let other = out[(k + 1)...].firstIndex(where: { $0.wordId != previousWord }) {
                let moved = out.remove(at: other)
                out.insert(moved, at: k)
            }
            k += 1
        }
        return out
    }

    /// The card "Kelimelerimi gör" should land on: the newest word's next
    /// card from `currentId` on, so the learner sees the word they just
    /// caught instead of the reel they left. Nil when the word has no card.
    static func landingId(in items: [VocabFeedItem], from currentId: String?,
                          newestWordId: String?) -> String? {
        guard let newestWordId else { return nil }
        // Forward first, so the learner never steps back over cards they
        // already watched; a card that's gone counts as the top.
        let start = currentId.flatMap { id in items.firstIndex { $0.id == id } } ?? items.startIndex
        let ahead = items[start...].first { $0.wordId == newestWordId }
        return (ahead ?? items.first { $0.wordId == newestWordId })?.id
    }
}
