import Foundation

/// One sentence in which a starter word appeared, with everything the
/// vocab detail screen needs to render and re-watch it: the line text,
/// per-word data (structure colors, Turkish gloss), the YouTube video
/// it came from and the exact clip timestamp to seek to.
///
/// Mirrors the JSON shape returned by /api/v1/starter-words/{id}/contexts.
/// Multi-word translation span — a phrasal verb ("clean off", "look at")
/// that should render as a single cell with one Turkish gloss instead
/// of one cell per English word with separate per-word translations.
/// Indexes match `ClipWord.wordIndex` so the frontend can fold the
/// covered words into a merged display unit.
struct PhraseSpan: Codable, Hashable {
    let startIndex: Int
    let endIndex: Int
    let translationTr: String
    let joinedText: String
}

struct VocabContext: Codable, Identifiable, Hashable {
    let lineId: Int
    let text: String
    /// Full-sentence Turkish translation, when the source row has one.
    /// Optional because the older vocab-feed endpoint doesn't include
    /// it (translation lives per-word there); the pattern scenes
    /// endpoint always sets it.
    let translationTr: String?
    let startTime: Double
    let endTime: Double
    let clipStartTime: Double
    let clipEndTime: Double
    let structure: ClipLineStructure?
    let videoId: String
    let youtubeVideoId: String
    let videoTitle: String
    let movieTitle: String
    let isPoc: Bool
    let words: [ClipWord]
    let phrases: [PhraseSpan]?

    var id: Int { lineId }

    enum CodingKeys: String, CodingKey {
        case lineId, text, translationTr,
             startTime, endTime, clipStartTime, clipEndTime,
             structure, videoId, youtubeVideoId, videoTitle, movieTitle,
             isPoc, words, phrases
    }

    /// Minimal stub used by VocabWordDetailView to drop the user into
    /// the existing ClipPlayerView at the right line. The player only
    /// needs id + youtubeVideoId + clip-bounds + this single line, so
    /// we synthesize a one-line clip from the context.
    ///
    /// Goes through JSONDecoder so we share ClipLine's custom decoder
    /// rather than duplicating its init. Nil optionals are omitted
    /// from the dict (NSNull would round-trip OK, but skipping the key
    /// keeps the JSON closer to what the network returns).
    func asLessonClip() -> LessonClip {
        var word_dicts: [[String: Any]] = []
        for w in words {
            var d: [String: Any] = [
                "word": w.word,
                "startTime": w.startTime,
                "endTime": w.endTime,
            ]
            if let wi = w.wordIndex     { d["wordIndex"]     = wi }
            if let si = w.starterId     { d["starterId"]     = si }
            if let st = w.starterTr     { d["starterTr"]     = st }
            if let tt = w.translationTr { d["translationTr"] = tt }
            word_dicts.append(d)
        }

        var lineDict: [String: Any] = [
            "id": lineId,
            "speaker": "",
            "text": text,
            "startTime": startTime,
            "endTime": endTime,
            "isTarget": true,
            "words": word_dicts,
        ]
        if let tr = translationTr { lineDict["translationTr"] = tr }
        if let s = structure {
            lineDict["structure"] = [
                "subject":  s.subject,
                "aux_verb": s.auxVerb,
                "rest":     s.rest,
            ]
        }

        let clipDict: [String: Any] = [
            "id": lineId,
            "youtubeVideoId": youtubeVideoId,
            "movieTitle": movieTitle,
            "startTime": clipStartTime,
            "endTime": clipEndTime,
            "lines": [lineDict],
        ]
        let data = try! JSONSerialization.data(withJSONObject: clipDict, options: [])
        return try! JSONDecoder().decode(LessonClip.self, from: data)
    }
}

/// Top-level response: the starter word + every distinct sentence it
/// shows up in across the POC corpus. The vocab detail screen renders
/// `contexts` as a vertical stack of "context cards", one per scene.
struct StarterWordContexts: Codable, Hashable {
    let id: String
    let word: String
    let translationTr: String?
    let ipa: String?
    let partOfSpeech: String?
    let cefrLevel: String?
    let contextCount: Int
    let contexts: [VocabContext]

    enum CodingKeys: String, CodingKey {
        case id, word, ipa, contexts
        case translationTr  = "translationTr"
        case partOfSpeech   = "partOfSpeech"
        case cefrLevel      = "cefrLevel"
        case contextCount   = "contextCount"
    }
}

/// One card in the Word Reels feed — a starter word + a single
/// playable context. The feed is a flat shuffled list of these,
/// rendered one per vertical page in VocabFeedView.
struct VocabFeedItem: Codable, Identifiable, Hashable {
    let wordId: String
    let word: String
    let translationTr: String?
    let ipa: String?
    let partOfSpeech: String?
    let cefrLevel: String?
    let wordContextCount: Int
    let isInPool: Bool
    let context: VocabContext

    /// Composite id keeps each (word, context) pair unique even when
    /// the feed cycles the same word through multiple contexts.
    var id: String { "\(wordId)|\(context.lineId)" }
}

struct VocabFeedResponse: Codable {
    let items: [VocabFeedItem]
    let total: Int
}

/// Pattern akış payload — a list of `VocabContext`s curated to start
/// with a specific pattern (e.g. "I am ..."). The response carries the
/// pattern id + a short label so the screen header can show "I AM
/// KALIBI" without the iOS side needing its own copy of the mapping.
struct PatternScenesResponse: Codable {
    let patternId: String
    let label: String
    let items: [VocabContext]
    let total: Int
}

/// Map an English part-of-speech tag (as stored in the corpus —
/// "verb"/"adj"/"noun" today, with room for "adv" later) to its
/// Turkish equivalent. Returns nil for nil/empty input so callers
/// can hide the badge when no POS is set, and falls back to the
/// raw value for unknown tags rather than dropping them.
func partOfSpeechTr(_ pos: String?) -> String? {
    guard let raw = pos?.lowercased(), !raw.isEmpty else { return nil }
    switch raw {
    case "verb":             return "fiil"
    case "adj", "adjective": return "sıfat"
    case "noun":             return "isim"
    case "adv", "adverb":    return "zarf"
    default:                 return raw
    }
}

/// Lightweight summary used by the Kelime Haznem grid. The full
/// per-sentence list lives behind the detail-screen contexts call —
/// this is just enough to render a tile (word + TR + progress dots).
struct StarterWordSummary: Codable, Identifiable, Hashable {
    let id: String
    let word: String
    let translationTr: String?
    let ipa: String?
    let partOfSpeech: String?
    let cefrLevel: String?
    let pocContextCount: Int

    /// 7 distinct contexts is the Feynman-flow mastery threshold —
    /// once the learner has seen the word in seven different scenes,
    /// it stops being "studying vocab" and becomes "knowing the word".
    static let masteryThreshold: Int = 7

    var isMastered: Bool { pocContextCount >= Self.masteryThreshold }
    var contextProgressFraction: Double {
        min(1.0, Double(pocContextCount) / Double(Self.masteryThreshold))
    }
}
