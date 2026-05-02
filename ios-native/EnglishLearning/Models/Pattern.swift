import SwiftUI

// MARK: - Slot kinds (same 3-color palette as the video player)

enum PatternSlotKind {
    case subject      // I / You / He…
    case verb         // am / is / are / want to / wants to / V1 / V1+s
    case rest         // adjective / noun / verb …

    var color: Color {
        switch self {
        case .subject: return Color(hex: 0x5BA3DD)      // sky blue
        case .verb:    return Color(hex: 0x6BC084)      // sage green
        case .rest:    return Color(hex: 0xB093D2)      // lavender
        }
    }

    var labelTr: String {
        switch self {
        case .subject: return "özne"
        case .verb:    return "fiil"
        case .rest:    return "tamamlayıcı"
        }
    }
}

/// One token in a formula display. Real words ("I", "am") render literally;
/// placeholder tokens ("+ adjective") render in italic with the slot color.
struct PatternToken: Identifiable {
    let id = UUID()
    let text: String
    let kind: PatternSlotKind
    let isPlaceholder: Bool
}

// MARK: - Example (3-color slots, each with its own Turkish gloss)

struct PatternExample: Identifiable {
    let id = UUID()
    let subject: String     // "I" / "She" / "There"
    let subjectTr: String   // "Ben" / "O (kadın)" / "(orada)"
    let verb: String        // "am" / "is" / "wants to"
    let verbTr: String      // "(-im eki)" / "-(d)ır" / "istiyor"
    let rest: String        // "happy" / "two cats"
    let restTr: String      // "mutlu" / "iki kedi"
    let tr: String          // Full sentence translation

    /// Reconstructed English sentence — used as fallback rendering.
    var en: String {
        let needsPeriod = !rest.hasSuffix(".") && !rest.hasSuffix("?") && !rest.hasSuffix("!")
        return "\(subject) \(verb) \(rest)" + (needsPeriod ? "." : "")
    }
}

// MARK: - Pattern (one teaching unit — one conjugation row)

struct Pattern: Identifiable, Hashable {
    let id: String
    let familyTr: String         // "BE + sıfat" — short label shown on path
    let titleTr: String          // "Ben + -im + sıfat"
    let titleEn: String          // "I + am + adjective"
    let summaryTr: String        // One-line tease
    let introTr: String          // Short Turkish hook for the intro screen
    let formula: [PatternToken]
    let examples: [PatternExample]
    let tipTr: String?
    let icon: String
    /// `lesson_id` in the existing `clip_structures` table, if any.
    /// Leave nil for patterns that don't have movie-clip coverage yet —
    /// the akış will show a "Video akışı yakında" placeholder instead.
    let videoStructureId: String?

    static func == (lhs: Pattern, rhs: Pattern) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Catalog (one pattern per conjugation row)

enum PatternCatalog {

    static let all: [Pattern] = [
        // BE + adjective (4 conjugations)
        beAdjI, beAdjYou, beAdjHeSheIt, beAdjWeThey,
        // Simple present V1 (4 conjugations)
        simplePresentI, simplePresentWe, simplePresentThey, simplePresentHeSheIt,
        // There is / are (1 step covering both forms)
        thereIsAre,
        // want to + verb (4 conjugations)
        wantToI, wantToYou, wantToWeThey, wantToHeSheIt,
    ]

    // MARK: BE + adjective ------------------------------------------------

    static let beAdjI = Pattern(
        id: "be-adj-i",
        familyTr: "BE + sıfat",
        titleTr: "I + am + sıfat",
        titleEn: "I + am + adjective",
        summaryTr: "Kendinden bahsederken: \"Ben mutluyum\".",
        introTr:
            "Kendi durumunu söylersin. \"I am\" + sıfat = \"… -im\". " +
            "Konuşma dilinde sıkça \"I'm\" şeklinde birleşir.",
        formula: [
            PatternToken(text: "Ben", kind: .subject, isPlaceholder: false),
            PatternToken(text: "(-im)", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im eki)",
                           rest: "happy", restTr: "mutlu",
                           tr: "Ben mutluyum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im eki)",
                           rest: "tired", restTr: "yorgun",
                           tr: "Ben yorgunum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im eki)",
                           rest: "ready", restTr: "hazır",
                           tr: "Hazırım."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im eki)",
                           rest: "hungry", restTr: "aç",
                           tr: "Açım."),
        ],
        tipTr: "\"I am\" → \"I'm\" (konuşma dilinde): I'm happy.",
        icon: "person.fill",
        videoStructureId: "lesson-05-to-be-adjective"
    )

    static let beAdjYou = Pattern(
        id: "be-adj-you",
        familyTr: "BE + sıfat",
        titleTr: "You + are + sıfat",
        titleEn: "You + are + adjective",
        summaryTr: "Karşındakine: \"Sen iyisin\".",
        introTr:
            "Karşındakinin durumunu söylersin. \"You are\" + sıfat = \"sen … -sın\". " +
            "Hem tekil (sen) hem çoğul (siz) için kullanılır.",
        formula: [
            PatternToken(text: "Sen", kind: .subject, isPlaceholder: false),
            PatternToken(text: "(-sın)", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın eki)",
                           rest: "kind", restTr: "iyi (birisi)",
                           tr: "Sen iyi birisin."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın eki)",
                           rest: "late", restTr: "geç",
                           tr: "Geç kaldın."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın eki)",
                           rest: "right", restTr: "haklı",
                           tr: "Haklısın."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın eki)",
                           rest: "funny", restTr: "komik",
                           tr: "Komiksin."),
        ],
        tipTr: "\"You are\" → \"You're\" (konuşma dilinde): You're right.",
        icon: "person.fill.checkmark",
        videoStructureId: "lesson-05-to-be-adjective"
    )

    static let beAdjHeSheIt = Pattern(
        id: "be-adj-hesheIt",
        familyTr: "BE + sıfat",
        titleTr: "He / She / It + is + sıfat",
        titleEn: "He / She / It + is + adjective",
        summaryTr: "Üçüncü kişi: \"O meşgul\".",
        introTr:
            "He (erkek), She (kadın) ve It (nesne/hayvan) için \"is\" kullanılır. " +
            "\"O … -dır / -dir\" anlamı verir.",
        formula: [
            PatternToken(text: "O", kind: .subject, isPlaceholder: false),
            PatternToken(text: "(-dır)", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "is", verbTr: "-dır",
                           rest: "busy", restTr: "meşgul",
                           tr: "O meşgul."),
            PatternExample(subject: "She", subjectTr: "O (kadın)",
                           verb: "is", verbTr: "-dır",
                           rest: "beautiful", restTr: "güzel",
                           tr: "O güzel."),
            PatternExample(subject: "It", subjectTr: "O (nesne)",
                           verb: "is", verbTr: "-dır",
                           rest: "cold", restTr: "soğuk",
                           tr: "(Hava) soğuk."),
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "is", verbTr: "-dır",
                           rest: "tall", restTr: "uzun (boylu)",
                           tr: "O uzun boylu."),
        ],
        tipTr: "Konuşma dilinde: He's, She's, It's. He's busy.",
        icon: "person.2.fill",
        videoStructureId: "lesson-05-to-be-adjective"
    )

    static let beAdjWeThey = Pattern(
        id: "be-adj-wethey",
        familyTr: "BE + sıfat",
        titleTr: "We / They + are + sıfat",
        titleEn: "We / They + are + adjective",
        summaryTr: "Çoğul: \"Biz açız\", \"Onlar mutlu\".",
        introTr:
            "Çoğul özneler (biz, onlar) için \"are\" kullanılır. " +
            "Türkçede \"-ız\" (biz) veya \"-lar\" (onlar) ekine denk gelir.",
        formula: [
            PatternToken(text: "Biz / Onlar", kind: .subject, isPlaceholder: false),
            PatternToken(text: "(-ız / -lar)", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "are", verbTr: "(-ız eki)",
                           rest: "hungry", restTr: "aç",
                           tr: "Biz açız."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "are", verbTr: "(-lar eki)",
                           rest: "happy", restTr: "mutlu",
                           tr: "Onlar mutlu."),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "are", verbTr: "(-ız eki)",
                           rest: "friends", restTr: "arkadaş",
                           tr: "Biz arkadaşız."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "are", verbTr: "(-lar eki)",
                           rest: "ready", restTr: "hazır",
                           tr: "Onlar hazır."),
        ],
        tipTr: "Konuşma dilinde: We're, They're. We're friends.",
        icon: "person.3.fill",
        videoStructureId: "lesson-05-to-be-adjective"
    )

    // MARK: Simple present (V1) ------------------------------------------

    static let simplePresentI = Pattern(
        id: "v1-i",
        familyTr: "Geniş zaman (V1)",
        titleTr: "I + fiil (V1)",
        titleEn: "I + verb (V1)",
        summaryTr: "Her zaman yaptığın şeyler: \"Ben çalışırım\".",
        introTr:
            "Her gün, genellikle veya alışkanlık olarak yaptığın işleri anlatırsın. " +
            "Fiil kök haliyle (V1) gelir: work, speak, live…",
        formula: [
            PatternToken(text: "Ben", kind: .subject, isPlaceholder: false),
            PatternToken(text: "fiil + -ırım", kind: .verb, isPlaceholder: false),
            PatternToken(text: "devamı", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "work", verbTr: "çalışırım",
                           rest: "every day", restTr: "her gün",
                           tr: "Her gün çalışırım."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "speak", verbTr: "konuşurum",
                           rest: "English", restTr: "İngilizce",
                           tr: "İngilizce konuşurum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "drink", verbTr: "içerim",
                           rest: "coffee", restTr: "kahve",
                           tr: "Kahve içerim."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "love", verbTr: "severim",
                           rest: "music", restTr: "müziği",
                           tr: "Müziği severim."),
        ],
        tipTr: nil,
        icon: "person.fill",
        videoStructureId: nil
    )

    static let simplePresentWe = Pattern(
        id: "v1-we",
        familyTr: "Geniş zaman (V1)",
        titleTr: "We + fiil (V1)",
        titleEn: "We + verb (V1)",
        summaryTr: "Birlikte yaptıklarımız: \"Biz seyahat ederiz\".",
        introTr:
            "\"We\" (biz) için fiil kök halinde kalır — değişmez. " +
            "Aynı I/You/They gibi V1 kullanılır.",
        formula: [
            PatternToken(text: "Biz", kind: .subject, isPlaceholder: false),
            PatternToken(text: "fiil + -ırız", kind: .verb, isPlaceholder: false),
            PatternToken(text: "devamı", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "live", verbTr: "yaşarız",
                           rest: "in Istanbul", restTr: "İstanbul'da",
                           tr: "İstanbul'da yaşarız."),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "travel", verbTr: "seyahat ederiz",
                           rest: "every summer", restTr: "her yaz",
                           tr: "Her yaz seyahat ederiz."),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "play", verbTr: "oynarız",
                           rest: "football", restTr: "futbol",
                           tr: "Futbol oynarız."),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "study", verbTr: "çalışırız",
                           rest: "together", restTr: "birlikte",
                           tr: "Birlikte çalışırız."),
        ],
        tipTr: nil,
        icon: "person.3.fill",
        videoStructureId: nil
    )

    static let simplePresentThey = Pattern(
        id: "v1-they",
        familyTr: "Geniş zaman (V1)",
        titleTr: "They + fiil (V1)",
        titleEn: "They + verb (V1)",
        summaryTr: "Onların yaptıkları: \"Onlar bizi tanır\".",
        introTr:
            "\"They\" (onlar) için fiil kök halinde kalır. " +
            "İnsanlar, hayvanlar, nesneler — hepsi için They.",
        formula: [
            PatternToken(text: "Onlar", kind: .subject, isPlaceholder: false),
            PatternToken(text: "fiil + -lar", kind: .verb, isPlaceholder: false),
            PatternToken(text: "devamı", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "like", verbTr: "severler",
                           rest: "coffee", restTr: "kahveyi",
                           tr: "Onlar kahveyi sever."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "know", verbTr: "tanırlar",
                           rest: "us", restTr: "bizi",
                           tr: "Onlar bizi tanır."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "want", verbTr: "isterler",
                           rest: "answers", restTr: "cevaplar",
                           tr: "Onlar cevap ister."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "live", verbTr: "yaşarlar",
                           rest: "near here", restTr: "buraya yakın",
                           tr: "Buraya yakın yaşarlar."),
        ],
        tipTr: nil,
        icon: "person.2.fill",
        videoStructureId: nil
    )

    static let simplePresentHeSheIt = Pattern(
        id: "v1-hesheIt",
        familyTr: "Geniş zaman (V1)",
        titleTr: "He / She / It + fiil + s",
        titleEn: "He / She / It + verb (V1+s)",
        summaryTr: "Üçüncü tekil — fiile -s eklenir: \"He works\".",
        introTr:
            "ÖNEMLİ: He / She / It için fiile -s ya da -es eklenir. " +
            "I work → He works. She speak değil → She speaks.",
        formula: [
            PatternToken(text: "O", kind: .subject, isPlaceholder: false),
            PatternToken(text: "fiil + -r", kind: .verb, isPlaceholder: false),
            PatternToken(text: "devamı", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "works", verbTr: "çalışır",
                           rest: "every day", restTr: "her gün",
                           tr: "O her gün çalışır."),
            PatternExample(subject: "She", subjectTr: "O (kadın)",
                           verb: "speaks", verbTr: "konuşur",
                           rest: "English", restTr: "İngilizce",
                           tr: "O İngilizce konuşur."),
            PatternExample(subject: "It", subjectTr: "O (nesne)",
                           verb: "rains", verbTr: "yağar",
                           rest: "a lot", restTr: "çok",
                           tr: "Çok yağmur yağar."),
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "goes", verbTr: "gider",
                           rest: "home", restTr: "eve",
                           tr: "O eve gider."),
        ],
        tipTr:
            "En sık unutulan kural — \"He go\" YANLIŞ, \"He goes\" DOĞRU. " +
            "Bazı fiillerde -es: go → goes, do → does, watch → watches.",
        icon: "person.fill.questionmark",
        videoStructureId: nil
    )

    // MARK: There is / are -----------------------------------------------

    static let thereIsAre = Pattern(
        id: "there-is-are",
        familyTr: "There is / are",
        titleTr: "There + is / are + isim",
        titleEn: "There + is / are + noun",
        summaryTr: "Bir şey \"var\" demek için: \"Odada bir kedi var\".",
        introTr:
            "Bir yerde bir şey var dersin. Tekil isimle \"There is\", " +
            "çoğul isimle \"There are\" kullanılır.",
        formula: [
            PatternToken(text: "(orada)", kind: .subject, isPlaceholder: false),
            PatternToken(text: "… var", kind: .verb, isPlaceholder: false),
            PatternToken(text: "isim", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "There", subjectTr: "(orada)",
                           verb: "is", verbTr: "vardır",
                           rest: "a cat in the room", restTr: "odada bir kedi",
                           tr: "Odada bir kedi var."),
            PatternExample(subject: "There", subjectTr: "(orada)",
                           verb: "are", verbTr: "vardır",
                           rest: "two cats", restTr: "iki kedi",
                           tr: "İki kedi var."),
            PatternExample(subject: "There", subjectTr: "(orada)",
                           verb: "is", verbTr: "vardır",
                           rest: "a problem", restTr: "bir sorun",
                           tr: "Bir sorun var."),
            PatternExample(subject: "There", subjectTr: "(orada)",
                           verb: "are", verbTr: "vardır",
                           rest: "many people", restTr: "çok insan",
                           tr: "Çok insan var."),
            PatternExample(subject: "There", subjectTr: "(orada)",
                           verb: "is", verbTr: "vardır",
                           rest: "milk in the fridge", restTr: "buzdolabında süt",
                           tr: "Buzdolabında süt var."),
        ],
        tipTr:
            "Konuşmada \"There's\" çok yaygın: There's a cat. " +
            "Sayılamayan isimler tekildir: There is water (su var).",
        icon: "mappin.and.ellipse",
        videoStructureId: nil
    )

    // MARK: want to + verb -----------------------------------------------

    static let wantToI = Pattern(
        id: "want-to-i",
        familyTr: "want to + fiil",
        titleTr: "I + want to + fiil",
        titleEn: "I + want to + verb",
        summaryTr: "İsteğini söylersin: \"Pizza yemek istiyorum\".",
        introTr:
            "Bir şey yapma isteğini belirtir. " +
            "\"want to\" + fiil (V1) = \"… yapmak istiyorum\".",
        formula: [
            PatternToken(text: "Ben", kind: .subject, isPlaceholder: false),
            PatternToken(text: "…mek istiyorum", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "want to", verbTr: "istiyorum",
                           rest: "eat pizza", restTr: "pizza yemek",
                           tr: "Pizza yemek istiyorum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "want to", verbTr: "istiyorum",
                           rest: "go home", restTr: "eve gitmek",
                           tr: "Eve gitmek istiyorum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "want to", verbTr: "istiyorum",
                           rest: "learn English", restTr: "İngilizce öğrenmek",
                           tr: "İngilizce öğrenmek istiyorum."),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "want to", verbTr: "istiyorum",
                           rest: "sleep", restTr: "uyumak",
                           tr: "Uyumak istiyorum."),
        ],
        tipTr: "\"to\"'dan sonra her zaman fiilin V1 hali gelir.",
        icon: "hand.raised.fill",
        videoStructureId: nil
    )

    static let wantToYou = Pattern(
        id: "want-to-you",
        familyTr: "want to + fiil",
        titleTr: "You + want to + fiil",
        titleEn: "You + want to + verb",
        summaryTr: "Karşındakinin isteği: \"Yardım etmek istiyorsun\".",
        introTr:
            "\"You want to\" — karşındakinin isteğini söylersin ya da soru sorarsın. " +
            "Want kök halinde kalır.",
        formula: [
            PatternToken(text: "Sen", kind: .subject, isPlaceholder: false),
            PatternToken(text: "…mek istiyorsun", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "want to", verbTr: "istiyorsun",
                           rest: "help", restTr: "yardım etmek",
                           tr: "Yardım etmek istiyorsun."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "want to", verbTr: "istiyorsun",
                           rest: "learn English", restTr: "İngilizce öğrenmek",
                           tr: "İngilizce öğrenmek istiyorsun."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "want to", verbTr: "istiyorsun",
                           rest: "go now", restTr: "şimdi gitmek",
                           tr: "Şimdi gitmek istiyorsun."),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "want to", verbTr: "istiyorsun",
                           rest: "stay here", restTr: "burada kalmak",
                           tr: "Burada kalmak istiyorsun."),
        ],
        tipTr: nil,
        icon: "hand.raised.fingers.spread.fill",
        videoStructureId: nil
    )

    static let wantToWeThey = Pattern(
        id: "want-to-wethey",
        familyTr: "want to + fiil",
        titleTr: "We / They + want to + fiil",
        titleEn: "We / They + want to + verb",
        summaryTr: "Çoğul: \"Seyahat etmek istiyoruz\".",
        introTr:
            "We (biz) ve They (onlar) için \"want to\" değişmez — V1 hali. " +
            "Türkçede -ız (biz) veya -lar (onlar) eki gelir.",
        formula: [
            PatternToken(text: "Biz / Onlar", kind: .subject, isPlaceholder: false),
            PatternToken(text: "…mek istiyoruz / istiyorlar", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "want to", verbTr: "istiyoruz",
                           rest: "travel", restTr: "seyahat etmek",
                           tr: "Seyahat etmek istiyoruz."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "want to", verbTr: "istiyorlar",
                           rest: "help", restTr: "yardım etmek",
                           tr: "Yardım etmek istiyorlar."),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "want to", verbTr: "istiyoruz",
                           rest: "stay home", restTr: "evde kalmak",
                           tr: "Evde kalmak istiyoruz."),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "want to", verbTr: "istiyorlar",
                           rest: "win", restTr: "kazanmak",
                           tr: "Kazanmak istiyorlar."),
        ],
        tipTr: nil,
        icon: "hand.raised.fill",
        videoStructureId: nil
    )

    static let wantToHeSheIt = Pattern(
        id: "want-to-hesheIt",
        familyTr: "want to + fiil",
        titleTr: "He / She / It + wants to + fiil",
        titleEn: "He / She / It + wants to + verb",
        summaryTr: "Üçüncü tekil — want değil \"wants\": \"O uyumak istiyor\".",
        introTr:
            "ÖNEMLİ: He / She / It için \"want\" değil \"wants\" olur. " +
            "\"to\" değişmez, sonrasında V1 gelir.",
        formula: [
            PatternToken(text: "O", kind: .subject, isPlaceholder: false),
            PatternToken(text: "…mek istiyor", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "wants to", verbTr: "istiyor",
                           rest: "sleep", restTr: "uyumak",
                           tr: "O uyumak istiyor."),
            PatternExample(subject: "She", subjectTr: "O (kadın)",
                           verb: "wants to", verbTr: "istiyor",
                           rest: "dance", restTr: "dans etmek",
                           tr: "O dans etmek istiyor."),
            PatternExample(subject: "It", subjectTr: "O (nesne)",
                           verb: "wants to", verbTr: "istiyor",
                           rest: "play", restTr: "oynamak",
                           tr: "(O) oynamak istiyor."),
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "wants to", verbTr: "istiyor",
                           rest: "leave", restTr: "ayrılmak",
                           tr: "O ayrılmak istiyor."),
        ],
        tipTr:
            "\"He want to\" YANLIŞ → \"He wants to\" DOĞRU. " +
            "\"to\"'dan sonra fiilin V1 hali gelir (eat, NOT eating).",
        icon: "person.fill.questionmark",
        videoStructureId: nil
    )
}
