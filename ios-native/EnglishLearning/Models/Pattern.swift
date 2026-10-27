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
    let verbTr: String      // "(-im)" / "(-dır)" / "istiyor"
    let rest: String        // "happy" / "two cats"
    let restTr: String      // "mutlu" / "iki kedi"
    let tr: String          // Full sentence translation
    /// Turkish-style okunuş for each chunk, e.g. "ay" under "I",
    /// "hepi" under "happy". Optional — only filled in for patterns
    /// we've written a beginner reading for.
    let subjectPhonetic: String?
    let verbPhonetic: String?
    let restPhonetic: String?

    init(
        subject: String,
        subjectTr: String,
        verb: String,
        verbTr: String,
        rest: String,
        restTr: String,
        tr: String,
        subjectPhonetic: String? = nil,
        verbPhonetic: String? = nil,
        restPhonetic: String? = nil
    ) {
        self.subject = subject
        self.subjectTr = subjectTr
        self.verb = verb
        self.verbTr = verbTr
        self.rest = rest
        self.restTr = restTr
        self.tr = tr
        self.subjectPhonetic = subjectPhonetic
        self.verbPhonetic = verbPhonetic
        self.restPhonetic = restPhonetic
    }

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
    /// `familyTr` for the capitalised header labels, spelled out: it mixes
    /// English and Turkish, so neither locale uppercases all of it right
    /// ("THERE İS" under tr_TR, "FIIL" under en).
    let familyTrCaps: String     // "BE + SIFAT"
    let titleTr: String          // "Ben + -im + sıfat"
    let titleEn: String          // "I + am + adjective"
    let summaryTr: String        // One-line tease
    let introTr: String          // Short Turkish hook for the intro screen
    let formula: [PatternToken]
    let examples: [PatternExample]
    let tipTr: String?
    let icon: String
    /// Pattern key recognized by the backend's
    /// `/api/v1/patterns/{id}/scenes` route. When set the akış card
    /// pushes a vertical reel of movie scenes opening with this
    /// pattern; nil leaves the video card out of the akış until the
    /// backend adds a filter for this pattern.
    let videoStructureId: String?

    static func == (lhs: Pattern, rhs: Pattern) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Catalog (one pattern per conjugation row)

enum PatternCatalog {

    /// The pattern path for the learning language: English keeps its
    /// BE / V1 / there-is / want-to catalog, Spanish starts with ser/estar
    /// + adjective (the analog of BE + adjective).
    static func catalog(for learning: LearningLanguage) -> [Pattern] {
        switch learning {
        case .en: return all
        case .es: return spanishAll
        }
    }

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

    /// ser/estar + adjective, one row per subject. `serEstarAdjNosotros`
    /// waits off the path until the Spanish corpus has scenes for it (the
    /// first set has none, and an empty reel is a dead end).
    static let spanishAll: [Pattern] = [
        serEstarAdjYo, serEstarAdjTu, serEstarAdjEl, serEstarAdjEllos,
    ]

    // MARK: BE + adjective ------------------------------------------------

    static let beAdjI = Pattern(
        id: "be-adj-i",
        familyTr: "BE + sıfat",
        familyTrCaps: "BE + SIFAT",
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
                           verb: "am", verbTr: "(-im)",
                           rest: "happy", restTr: "mutlu",
                           tr: "Ben mutluyum.",
                           subjectPhonetic: "ay",
                           verbPhonetic: "em",
                           restPhonetic: "hepi"),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im)",
                           rest: "tired", restTr: "yorgun",
                           tr: "Ben yorgunum.",
                           subjectPhonetic: "ay",
                           verbPhonetic: "em",
                           restPhonetic: "tayırd"),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im)",
                           rest: "ready", restTr: "hazır",
                           tr: "Hazırım.",
                           subjectPhonetic: "ay",
                           verbPhonetic: "em",
                           restPhonetic: "redi"),
            PatternExample(subject: "I", subjectTr: "Ben",
                           verb: "am", verbTr: "(-im)",
                           rest: "hungry", restTr: "aç",
                           tr: "Açım.",
                           subjectPhonetic: "ay",
                           verbPhonetic: "em",
                           restPhonetic: "hangri"),
        ],
        tipTr: "\"I am\" → \"I'm\" (konuşma dilinde): I'm happy.",
        icon: "person.fill",
        videoStructureId: "be-adj-i"
    )

    static let beAdjYou = Pattern(
        id: "be-adj-you",
        familyTr: "BE + sıfat",
        familyTrCaps: "BE + SIFAT",
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
                           verb: "are", verbTr: "(-sın)",
                           rest: "kind", restTr: "iyi (birisi)",
                           tr: "Sen iyi birisin.",
                           subjectPhonetic: "yu",
                           verbPhonetic: "ar",
                           restPhonetic: "kaynd"),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın)",
                           rest: "late", restTr: "geç",
                           tr: "Geç kaldın.",
                           subjectPhonetic: "yu",
                           verbPhonetic: "ar",
                           restPhonetic: "leyt"),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın)",
                           rest: "right", restTr: "haklı",
                           tr: "Haklısın.",
                           subjectPhonetic: "yu",
                           verbPhonetic: "ar",
                           restPhonetic: "rayt"),
            PatternExample(subject: "You", subjectTr: "Sen",
                           verb: "are", verbTr: "(-sın)",
                           rest: "funny", restTr: "komik",
                           tr: "Komiksin.",
                           subjectPhonetic: "yu",
                           verbPhonetic: "ar",
                           restPhonetic: "fani"),
        ],
        tipTr: "\"You are\" → \"You're\" (konuşma dilinde): You're right.",
        icon: "person.fill.checkmark",
        videoStructureId: "be-adj-you"
    )

    static let beAdjHeSheIt = Pattern(
        id: "be-adj-hesheIt",
        familyTr: "BE + sıfat",
        familyTrCaps: "BE + SIFAT",
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
                           verb: "is", verbTr: "(-dır)",
                           rest: "busy", restTr: "meşgul",
                           tr: "O meşgul.",
                           subjectPhonetic: "hi",
                           verbPhonetic: "iz",
                           restPhonetic: "bizi"),
            PatternExample(subject: "She", subjectTr: "O (kadın)",
                           verb: "is", verbTr: "(-dır)",
                           rest: "beautiful", restTr: "güzel",
                           tr: "O güzel.",
                           subjectPhonetic: "şi",
                           verbPhonetic: "iz",
                           restPhonetic: "biyutıful"),
            PatternExample(subject: "It", subjectTr: "O (nesne)",
                           verb: "is", verbTr: "(-dır)",
                           rest: "cold", restTr: "soğuk",
                           tr: "(Hava) soğuk.",
                           subjectPhonetic: "it",
                           verbPhonetic: "iz",
                           restPhonetic: "kold"),
            PatternExample(subject: "He", subjectTr: "O (erkek)",
                           verb: "is", verbTr: "(-dır)",
                           rest: "tall", restTr: "uzun (boylu)",
                           tr: "O uzun boylu.",
                           subjectPhonetic: "hi",
                           verbPhonetic: "iz",
                           restPhonetic: "tal"),
        ],
        tipTr: "Konuşma dilinde: He's, She's, It's. He's busy.",
        icon: "person.2.fill",
        videoStructureId: "be-adj-hesheIt"
    )

    static let beAdjWeThey = Pattern(
        id: "be-adj-wethey",
        familyTr: "BE + sıfat",
        familyTrCaps: "BE + SIFAT",
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
                           verb: "are", verbTr: "(-ız)",
                           rest: "hungry", restTr: "aç",
                           tr: "Biz açız.",
                           subjectPhonetic: "vi",
                           verbPhonetic: "ar",
                           restPhonetic: "hangri"),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "are", verbTr: "(-lar)",
                           rest: "happy", restTr: "mutlu",
                           tr: "Onlar mutlu.",
                           subjectPhonetic: "dey",
                           verbPhonetic: "ar",
                           restPhonetic: "hepi"),
            PatternExample(subject: "We", subjectTr: "Biz",
                           verb: "are", verbTr: "(-ız)",
                           rest: "friends", restTr: "arkadaş",
                           tr: "Biz arkadaşız.",
                           subjectPhonetic: "vi",
                           verbPhonetic: "ar",
                           restPhonetic: "frendz"),
            PatternExample(subject: "They", subjectTr: "Onlar",
                           verb: "are", verbTr: "(-lar)",
                           rest: "ready", restTr: "hazır",
                           tr: "Onlar hazır.",
                           subjectPhonetic: "dey",
                           verbPhonetic: "ar",
                           restPhonetic: "redi"),
        ],
        tipTr: "Konuşma dilinde: We're, They're. We're friends.",
        icon: "person.3.fill",
        videoStructureId: "be-adj-wethey"
    )

    // MARK: Simple present (V1) ------------------------------------------

    static let simplePresentI = Pattern(
        id: "v1-i",
        familyTr: "Geniş zaman (V1)",
        familyTrCaps: "GENİŞ ZAMAN (V1)",
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
        familyTrCaps: "GENİŞ ZAMAN (V1)",
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
        familyTrCaps: "GENİŞ ZAMAN (V1)",
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
        familyTrCaps: "GENİŞ ZAMAN (V1)",
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
        familyTrCaps: "THERE IS / ARE",
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
        familyTrCaps: "WANT TO + FİİL",
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
        familyTrCaps: "WANT TO + FİİL",
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
        familyTrCaps: "WANT TO + FİİL",
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
        familyTrCaps: "WANT TO + FİİL",
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

    // MARK: ser / estar + adjetivo (Spanish) --------------------------
    //
    // İspanyolca'da "olmak" iki fiildir: SER (kalıcı özellik — boy, karakter,
    // meslek) ve ESTAR (geçici durum — ruh hali, yorgunluk, yer). İkisi de
    // sıfatla kullanılır; hangi fiilin geldiği anlamı belirler. İspanyolca
    // özneyi sık düşürür ("Estoy cansado" = "Yorgunum"), o yüzden örneklerde
    // özne parantezle gösterilir.

    static let serEstarAdjYo = Pattern(
        id: "ser-estar-adj-yo",
        familyTr: "ser / estar + sıfat",
        familyTrCaps: "SER / ESTAR + SIFAT",
        titleTr: "Yo + soy / estoy + sıfat",
        titleEn: "Yo + soy/estoy + adjetivo",
        summaryTr: "Kendinden bahsederken: \"(Ben) yorgunum\".",
        introTr:
            "Kendi durumunu söylersin. Kalıcı özellik için \"soy\", geçici " +
            "durum için \"estoy\" gelir. İspanyolca'da \"yo\" çoğu zaman düşer: " +
            "\"Estoy cansado\" = \"Yorgunum\".",
        formula: [
            PatternToken(text: "yo", kind: .subject, isPlaceholder: false),
            PatternToken(text: "soy / estoy", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "Yo", subjectTr: "Ben",
                           verb: "estoy", verbTr: "(durum)",
                           rest: "cansado", restTr: "yorgun",
                           tr: "Yorgunum.",
                           subjectPhonetic: "yo",
                           verbPhonetic: "estoy",
                           restPhonetic: "kansado"),
            PatternExample(subject: "Yo", subjectTr: "Ben",
                           verb: "soy", verbTr: "(özellik)",
                           rest: "feliz", restTr: "mutlu",
                           tr: "Mutluyum.",
                           subjectPhonetic: "yo",
                           verbPhonetic: "soy",
                           restPhonetic: "felis"),
            PatternExample(subject: "Yo", subjectTr: "Ben",
                           verb: "estoy", verbTr: "(durum)",
                           rest: "listo", restTr: "hazır",
                           tr: "Hazırım.",
                           subjectPhonetic: "yo",
                           verbPhonetic: "estoy",
                           restPhonetic: "listo"),
            PatternExample(subject: "Yo", subjectTr: "Ben",
                           verb: "soy", verbTr: "(özellik)",
                           rest: "alto", restTr: "uzun boylu",
                           tr: "Uzun boyluyum.",
                           subjectPhonetic: "yo",
                           verbPhonetic: "soy",
                           restPhonetic: "alto"),
        ],
        tipTr:
            "ser (soy) = kalıcı özellik, estar (estoy) = geçici durum. " +
            "\"Soy alto\" (hep uzunum) ama \"Estoy cansado\" (şu an yorgunum).",
        icon: "person.fill",
        videoStructureId: "ser-estar-adj-yo"
    )

    static let serEstarAdjTu = Pattern(
        id: "ser-estar-adj-tu",
        familyTr: "ser / estar + sıfat",
        familyTrCaps: "SER / ESTAR + SIFAT",
        titleTr: "Tú + eres / estás + sıfat",
        titleEn: "Tú + eres/estás + adjetivo",
        summaryTr: "Karşındakine: \"Naziksin\", \"Yorgunsun\".",
        introTr:
            "Karşındakinin durumunu söylersin. Kalıcı özellik için \"eres\", " +
            "geçici durum için \"estás\" kullanılır.",
        formula: [
            PatternToken(text: "tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "eres / estás", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "Tú", subjectTr: "Sen",
                           verb: "eres", verbTr: "(özellik)",
                           rest: "amable", restTr: "nazik",
                           tr: "Naziksin.",
                           subjectPhonetic: "tu",
                           verbPhonetic: "eres",
                           restPhonetic: "amable"),
            PatternExample(subject: "Tú", subjectTr: "Sen",
                           verb: "estás", verbTr: "(durum)",
                           rest: "cansado", restTr: "yorgun",
                           tr: "Yorgunsun.",
                           subjectPhonetic: "tu",
                           verbPhonetic: "estas",
                           restPhonetic: "kansado"),
            PatternExample(subject: "Tú", subjectTr: "Sen",
                           verb: "eres", verbTr: "(özellik)",
                           rest: "guapo", restTr: "yakışıklı",
                           tr: "Yakışıklısın.",
                           subjectPhonetic: "tu",
                           verbPhonetic: "eres",
                           restPhonetic: "guapo"),
            PatternExample(subject: "Tú", subjectTr: "Sen",
                           verb: "estás", verbTr: "(durum)",
                           rest: "listo", restTr: "hazır",
                           tr: "Hazırsın.",
                           subjectPhonetic: "tu",
                           verbPhonetic: "estas",
                           restPhonetic: "listo"),
        ],
        tipTr:
            "\"Eres guapo\" (yakışıklısın — özellik) ama \"Estás cansado\" " +
            "(yorgunsun — şu anki durum).",
        icon: "person.fill.checkmark",
        videoStructureId: "ser-estar-adj-tu"
    )

    static let serEstarAdjEl = Pattern(
        id: "ser-estar-adj-el",
        familyTr: "ser / estar + sıfat",
        familyTrCaps: "SER / ESTAR + SIFAT",
        titleTr: "Él / Ella + es / está + sıfat",
        titleEn: "Él/Ella + es/está + adjetivo",
        summaryTr: "Üçüncü kişi: \"O güçlü\", \"O hasta\".",
        introTr:
            "Él (erkek) ve Ella (kadın) için \"es\" (özellik) veya \"está\" " +
            "(durum) gelir. Türkçede \"O … -dır\" anlamı verir.",
        formula: [
            PatternToken(text: "él / ella", kind: .subject, isPlaceholder: false),
            PatternToken(text: "es / está", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "Ella", subjectTr: "O (kadın)",
                           verb: "es", verbTr: "(özellik)",
                           rest: "fuerte", restTr: "güçlü",
                           tr: "O güçlü.",
                           subjectPhonetic: "eya",
                           verbPhonetic: "es",
                           restPhonetic: "fuerte"),
            PatternExample(subject: "Él", subjectTr: "O (erkek)",
                           verb: "está", verbTr: "(durum)",
                           rest: "enfermo", restTr: "hasta",
                           tr: "O hasta.",
                           subjectPhonetic: "el",
                           verbPhonetic: "esta",
                           restPhonetic: "enfermo"),
            PatternExample(subject: "Él", subjectTr: "O (erkek)",
                           verb: "es", verbTr: "(özellik)",
                           rest: "alto", restTr: "uzun boylu",
                           tr: "O uzun boylu.",
                           subjectPhonetic: "el",
                           verbPhonetic: "es",
                           restPhonetic: "alto"),
            PatternExample(subject: "Ella", subjectTr: "O (kadın)",
                           verb: "está", verbTr: "(durum)",
                           rest: "contenta", restTr: "memnun",
                           tr: "O memnun.",
                           subjectPhonetic: "eya",
                           verbPhonetic: "esta",
                           restPhonetic: "kontenta"),
        ],
        tipTr:
            "Sıfat özneye uyar: erkek için -o (cansado), kadın için -a " +
            "(cansada). \"Ella está contenta\", \"Él está contento\".",
        icon: "person.2.fill",
        videoStructureId: "ser-estar-adj-el"
    )

    static let serEstarAdjNosotros = Pattern(
        id: "ser-estar-adj-nosotros",
        familyTr: "ser / estar + sıfat",
        familyTrCaps: "SER / ESTAR + SIFAT",
        titleTr: "Nosotros + somos / estamos + sıfat",
        titleEn: "Nosotros + somos/estamos + adjetivo",
        summaryTr: "Çoğul (biz): \"Arkadaşız\", \"Yorgunuz\".",
        introTr:
            "\"Nosotros\" (biz) için \"somos\" (özellik) veya \"estamos\" " +
            "(durum) gelir. Sıfat çoğul olur: -os / -as eki alır.",
        formula: [
            PatternToken(text: "nosotros", kind: .subject, isPlaceholder: false),
            PatternToken(text: "somos / estamos", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "Nosotros", subjectTr: "Biz",
                           verb: "somos", verbTr: "(özellik)",
                           rest: "jóvenes", restTr: "genç",
                           tr: "Biz genciz.",
                           subjectPhonetic: "nosotros",
                           verbPhonetic: "somos",
                           restPhonetic: "hobenes"),
            PatternExample(subject: "Nosotros", subjectTr: "Biz",
                           verb: "estamos", verbTr: "(durum)",
                           rest: "cansados", restTr: "yorgun",
                           tr: "Yorgunuz.",
                           subjectPhonetic: "nosotros",
                           verbPhonetic: "estamos",
                           restPhonetic: "kansados"),
            PatternExample(subject: "Nosotras", subjectTr: "Biz (kadınlar)",
                           verb: "estamos", verbTr: "(durum)",
                           rest: "listas", restTr: "hazır",
                           tr: "Hazırız.",
                           subjectPhonetic: "nosotras",
                           verbPhonetic: "estamos",
                           restPhonetic: "listas"),
            PatternExample(subject: "Nosotros", subjectTr: "Biz",
                           verb: "somos", verbTr: "(özellik)",
                           rest: "felices", restTr: "mutlu",
                           tr: "Mutluyuz.",
                           subjectPhonetic: "nosotros",
                           verbPhonetic: "somos",
                           restPhonetic: "felises"),
        ],
        tipTr:
            "Sıfat çoğul olur: cansado → cansados, lista → listas. " +
            "Grup karışıksa (erkek+kadın) eril çoğul (-os) kullanılır.",
        icon: "person.3.fill",
        videoStructureId: "ser-estar-adj-nosotros"
    )

    static let serEstarAdjEllos = Pattern(
        id: "ser-estar-adj-ellos",
        familyTr: "ser / estar + sıfat",
        familyTrCaps: "SER / ESTAR + SIFAT",
        titleTr: "Ellos / Ellas + son / están + sıfat",
        titleEn: "Ellos/Ellas + son/están + adjetivo",
        summaryTr: "Çoğul (onlar): \"Uzun boylular\", \"Meşguller\".",
        introTr:
            "\"Ellos\" (onlar, eril) ve \"Ellas\" (onlar, dişil) için \"son\" " +
            "(özellik) veya \"están\" (durum) gelir.",
        formula: [
            PatternToken(text: "ellos / ellas", kind: .subject, isPlaceholder: false),
            PatternToken(text: "son / están", kind: .verb, isPlaceholder: false),
            PatternToken(text: "sıfat", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            PatternExample(subject: "Ellos", subjectTr: "Onlar",
                           verb: "son", verbTr: "(özellik)",
                           rest: "altos", restTr: "uzun boylu",
                           tr: "Onlar uzun boylu.",
                           subjectPhonetic: "eyos",
                           verbPhonetic: "son",
                           restPhonetic: "altos"),
            PatternExample(subject: "Ellos", subjectTr: "Onlar",
                           verb: "están", verbTr: "(durum)",
                           rest: "ocupados", restTr: "meşgul",
                           tr: "Onlar meşgul.",
                           subjectPhonetic: "eyos",
                           verbPhonetic: "estan",
                           restPhonetic: "okupados"),
            PatternExample(subject: "Ellas", subjectTr: "Onlar (kadınlar)",
                           verb: "están", verbTr: "(durum)",
                           rest: "contentas", restTr: "memnun",
                           tr: "Onlar memnun.",
                           subjectPhonetic: "eyas",
                           verbPhonetic: "estan",
                           restPhonetic: "kontentas"),
            PatternExample(subject: "Ellos", subjectTr: "Onlar",
                           verb: "son", verbTr: "(özellik)",
                           rest: "simpáticos", restTr: "cana yakın",
                           tr: "Onlar cana yakın.",
                           subjectPhonetic: "eyos",
                           verbPhonetic: "son",
                           restPhonetic: "simpatikos"),
        ],
        tipTr:
            "\"ll\" → \"y\" okunur: ellos = \"eyos\". Karışık grupta (erkek + " +
            "kadın) eril çoğul kullanılır: ellos, contentos.",
        icon: "person.3.fill",
        videoStructureId: "ser-estar-adj-ellos"
    )
}
