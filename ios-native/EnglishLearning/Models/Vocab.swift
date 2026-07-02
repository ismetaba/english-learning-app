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
