import Foundation

// MARK: - Lessons and Units

struct CurriculumLesson: Codable, Identifiable, Hashable, Equatable {
    let id: String
    let unitId: String
    let title: String
    let titleTr: String?
    let description: String?
    let sortOrder: Int
    let lessonType: String
    let grammarPattern: String?
    let status: String

    enum CodingKeys: String, CodingKey {
        case id
        case unitId = "unit_id"
        case title
        case titleTr = "title_tr"
        case description
        case sortOrder = "sort_order"
        case lessonType = "lesson_type"
        case grammarPattern = "grammar_pattern"
        case status
    }

    var displayTitle: String { titleTr?.isEmpty == false ? titleTr! : title }
}

struct CurriculumUnit: Codable, Identifiable, Hashable, Equatable {
    let id: String
    let title: String
    let titleTr: String?
    let description: String?
    let cefrLevel: String
    let sortOrder: Int
    let color: String?
    let lessonCount: Int
    let lessons: [CurriculumLesson]

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case titleTr = "title_tr"
        case description
        case cefrLevel = "cefr_level"
        case sortOrder = "sort_order"
        case color
        case lessonCount = "lesson_count"
        case lessons
    }

    var displayTitle: String { titleTr?.isEmpty == false ? titleTr! : title }
}

// MARK: - Lesson Content Sections (tagged union)

enum LessonSectionType: String, Codable {
    case vocab, rule, tip, dialogue, exercise
}

enum LessonSection: Codable, Identifiable, Equatable, Hashable {
    case vocab(VocabSection)
    case rule(RuleSection)
    case tip(TipSection)
    case dialogue(DialogueSection)
    case exercise(ExerciseSection)

    var id: String {
        switch self {
        case .vocab(let s):    return "vocab-\(s.title)"
        case .rule(let s):     return "rule-\(s.title)"
        case .tip(let s):      return "tip-\(s.title)"
        case .dialogue(let s): return "dialogue-\(s.title)"
        case .exercise(let s): return "exercise-\(s.title)"
        }
    }

    enum CodingKeys: String, CodingKey { case type }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(LessonSectionType.self, forKey: .type)
        let single = try decoder.singleValueContainer()
        switch type {
        case .vocab:    self = .vocab(try single.decode(VocabSection.self))
        case .rule:     self = .rule(try single.decode(RuleSection.self))
        case .tip:      self = .tip(try single.decode(TipSection.self))
        case .dialogue: self = .dialogue(try single.decode(DialogueSection.self))
        case .exercise: self = .exercise(try single.decode(ExerciseSection.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var single = encoder.singleValueContainer()
        switch self {
        case .vocab(let s):    try single.encode(s)
        case .rule(let s):     try single.encode(s)
        case .tip(let s):      try single.encode(s)
        case .dialogue(let s): try single.encode(s)
        case .exercise(let s): try single.encode(s)
        }
    }
}

struct VocabSection: Codable, Equatable, Hashable {
    let type: String
    let title: String
    let titleTr: String
    let words: [VocabWordItem]
    enum CodingKeys: String, CodingKey {
        case type, title, words
        case titleTr = "title_tr"
    }

    struct VocabWordItem: Codable, Equatable, Hashable, Identifiable {
        var id: String { word }
        let word: String
        let translation: String
        let ipa: String?
        let example: String
        let exampleTr: String
        enum CodingKeys: String, CodingKey {
            case word, translation, ipa, example
            case exampleTr = "example_tr"
        }
    }
}

struct RuleSection: Codable, Equatable, Hashable {
    let type: String
    let title: String
    let titleTr: String
    let explanation: String
    let explanationTr: String
    let pattern: String?
    let examples: [RuleExample]
    enum CodingKeys: String, CodingKey {
        case type, title, explanation, pattern, examples
        case titleTr = "title_tr"
        case explanationTr = "explanation_tr"
    }
    struct RuleExample: Codable, Equatable, Hashable, Identifiable {
        var id: String { en }
        let en: String
        let tr: String
        let highlight: String?
    }
}

struct TipSection: Codable, Equatable, Hashable {
    let type: String
    let title: String
    let content: String
    let contentTr: String
    enum CodingKeys: String, CodingKey {
        case type, title, content
        case contentTr = "content_tr"
    }
}

struct DialogueSection: Codable, Equatable, Hashable {
    let type: String
    let title: String
    let lines: [DialogueLine]
    struct DialogueLine: Codable, Equatable, Hashable, Identifiable {
        var id: String { "\(speaker)-\(text)" }
        let speaker: String
        let text: String
        let translation: String
    }
}

struct ExerciseSection: Codable, Equatable, Hashable {
    let type: String
    let title: String
    let items: [ExerciseItem]
    struct ExerciseItem: Codable, Equatable, Hashable, Identifiable {
        var id: String { question }
        let question: String
        let options: [String]
        let correct: Int
        let hint: String?
    }
}

// MARK: - Lesson Detail

struct LessonDetail: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let unitId: String
    let title: String
    let titleTr: String?
    let description: String?
    let sortOrder: Int
    let lessonType: String
    let grammarPattern: String?
    let status: String
    let grammarExplanation: String?
    let grammarExplanationTr: String?
    let examples: [String]
    let sections: [LessonSection]?
    let prerequisites: [String]

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, examples, sections, prerequisites
        case unitId = "unit_id"
        case titleTr = "title_tr"
        case sortOrder = "sort_order"
        case lessonType = "lesson_type"
        case grammarPattern = "grammar_pattern"
        case grammarExplanation = "grammar_explanation"
        case grammarExplanationTr = "grammar_explanation_tr"
    }

    var displayTitle: String { titleTr?.isEmpty == false ? titleTr! : title }
}

// MARK: - Clips

struct ClipWord: Codable, Equatable, Hashable, Identifiable {
    var id: String { "\(word)-\(startTime)" }
    let word: String
    let startTime: Double
    let endTime: Double
    /// Whitespace-tokenized index from word_timestamps.word_index. Nullable
    /// for back-compat with existing endpoints (lessons routes don't return it).
    let wordIndex: Int?
    /// vocab_words.id (e.g. "a2-need") if this surface form matches an
    /// inflection of a starter-set word; nil otherwise.
    let starterId: String?
    /// Turkish translation of the matched starter word, joined from
    /// vocab_words.translation_tr at request time. Nil for non-starter
    /// words. Used by the tap-to-learn banner so the player doesn't need
    /// a separate lookup table.
    let starterTr: String?
    /// Best-effort base-form Turkish gloss for *any* word in the
    /// dialogue (not just starter set), joined from word_translations.
    /// Rendered as a small italic label under each English word so the
    /// learner sees a word-by-word translation without needing to tap.
    /// Nil when the surface form has no entry in the table.
    let translationTr: String?

    enum CodingKeys: String, CodingKey {
        case word, startTime, endTime, wordIndex, starterId, starterTr, translationTr
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.word          = try c.decode(String.self, forKey: .word)
        self.startTime     = try c.decode(Double.self, forKey: .startTime)
        self.endTime       = try c.decode(Double.self, forKey: .endTime)
        self.wordIndex     = try c.decodeIfPresent(Int.self, forKey: .wordIndex)
        self.starterId     = try c.decodeIfPresent(String.self, forKey: .starterId)
        self.starterTr     = try c.decodeIfPresent(String.self, forKey: .starterTr)
        self.translationTr = try c.decodeIfPresent(String.self, forKey: .translationTr)
    }
}

/// Sentence-structure tag for a subtitle line. Indices reference
/// word_timestamps.word_index for that line. Subject and aux_verb may be
/// empty (imperatives, fragments, no auxiliary).
struct ClipLineStructure: Codable, Equatable, Hashable {
    let subject: [Int]
    let auxVerb: [Int]
    let rest: [Int]

    enum CodingKeys: String, CodingKey {
        case subject
        case auxVerb = "aux_verb"
        case rest
    }
}

struct ClipLine: Codable, Identifiable, Equatable, Hashable {
    let id: Int
    let speaker: String
    let text: String
    let translationTr: String?
    let startTime: Double
    let endTime: Double
    let isTarget: Bool?
    let structure: ClipLineStructure?
    let words: [ClipWord]

    enum CodingKeys: String, CodingKey {
        case id, speaker, text, translationTr, startTime, endTime, isTarget, structure, words
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id            = try c.decode(Int.self, forKey: .id)
        self.speaker       = try c.decode(String.self, forKey: .speaker)
        self.text          = try c.decode(String.self, forKey: .text)
        self.translationTr = try c.decodeIfPresent(String.self, forKey: .translationTr)
        self.startTime     = try c.decode(Double.self, forKey: .startTime)
        self.endTime       = try c.decode(Double.self, forKey: .endTime)
        self.isTarget      = try c.decodeIfPresent(Bool.self, forKey: .isTarget)
        self.structure     = try c.decodeIfPresent(ClipLineStructure.self, forKey: .structure)
        self.words         = try c.decode([ClipWord].self, forKey: .words)
    }
}

struct LessonClip: Codable, Identifiable, Equatable, Hashable {
    let id: Int
    let youtubeVideoId: String
    let movieTitle: String
    let startTime: Double
    let endTime: Double
    let lines: [ClipLine]

    var duration: Double { endTime - startTime }
    var targetLineIndex: Int? {
        lines.firstIndex(where: { $0.isTarget == true })
    }
}

struct PaginatedClips: Codable, Equatable {
    let clips: [LessonClip]
    let total: Int
    let page: Int
    let perPage: Int
    let totalPages: Int
}
