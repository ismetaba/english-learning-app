import Foundation

struct VocabWord: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let word: String
    let ipa: String?
    let partOfSpeech: String?
    let translationTr: String?
    let exampleSentence: String?
    let exampleTranslationTr: String?
    let frequencyRank: Int?
    let cefrLevel: String?

    enum CodingKeys: String, CodingKey {
        case id, word, ipa
        case partOfSpeech = "part_of_speech"
        case translationTr = "translation_tr"
        case exampleSentence = "example_sentence"
        case exampleTranslationTr = "example_translation_tr"
        case frequencyRank = "frequency_rank"
        case cefrLevel = "cefr_level"
    }
}

struct VocabSet: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let lessonId: String?
    let title: String
    let titleTr: String?
    let wordCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case lessonId = "lesson_id"
        case title
        case titleTr = "title_tr"
        case wordCount = "word_count"
    }

    var displayTitle: String { titleTr?.isEmpty == false ? titleTr! : title }
}

struct VocabSetWithWords: Codable, Identifiable, Equatable {
    let id: String
    let lessonId: String?
    let title: String
    let titleTr: String?
    let wordCount: Int
    let words: [VocabWord]

    enum CodingKeys: String, CodingKey {
        case id, title, words
        case lessonId = "lesson_id"
        case titleTr = "title_tr"
        case wordCount = "word_count"
    }
}

// MARK: - Spaced repetition

enum MasteryLevel: String, Codable, CaseIterable {
    case new, learning, familiar, mastered
}

struct VocabPoolEntry: Codable, Identifiable, Equatable {
    let wordId: String
    var masteryLevel: MasteryLevel
    var easeFactor: Double
    var interval: Int
    var nextReviewDate: String
    var correctStreak: Int
    var totalReviews: Int
    var lastReviewDate: String

    var id: String { wordId }
}

extension VocabPoolEntry {
    /// The pool is persisted as one JSON blob, so, as with `UserProgress`, a
    /// missing field or a mastery level added in a later version must not
    /// make every entry unreadable: they fall back to a new entry's values.
    /// Encoding stays synthesized, so the stored format is unchanged.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        wordId = try c.decode(String.self, forKey: .wordId)
        masteryLevel = try c.decodeIfPresent(String.self, forKey: .masteryLevel)
            .flatMap(MasteryLevel.init(rawValue:)) ?? .new
        easeFactor = try c.decodeIfPresent(Double.self, forKey: .easeFactor) ?? SpacedRepetition.initialEaseFactor
        interval = try c.decodeIfPresent(Int.self, forKey: .interval) ?? 0
        // "" sorts before every day string, i.e. due now like a new entry.
        nextReviewDate = try c.decodeIfPresent(String.self, forKey: .nextReviewDate) ?? ""
        correctStreak = try c.decodeIfPresent(Int.self, forKey: .correctStreak) ?? 0
        totalReviews = try c.decodeIfPresent(Int.self, forKey: .totalReviews) ?? 0
        lastReviewDate = try c.decodeIfPresent(String.self, forKey: .lastReviewDate) ?? ""
    }
}
