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
    /// One line on why the sentence is built this way ("estar: şu anki
    /// durum"). Written for the Spanish path.
    let noteTr: String?

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
        restPhonetic: String? = nil,
        noteTr: String? = nil
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
        self.noteTr = noteTr
    }

    /// The sentence as it is said aloud: a dropped subject in parentheses
    /// is left out ("(Yo) quiero comer" → "Quiero comer.").
    var spoken: String { SpokenSentence.text([subject, verb, rest]) }

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

    /// ser/estar + adjective, one row per subject, then the verb patterns
    /// a beginner says most: want, have, have to, can, going to, know,
    /// there is. `serEstarAdjNosotros` and `serEstarAdjEllos` wait off the
    /// path until the Spanish corpus has scenes for them (the animated-film
    /// set has 2 and 8; a near-empty reel is a dead end).
    static let spanishAll: [Pattern] = [
        serEstarAdjYo, serEstarAdjTu, serEstarAdjEl,
        esQuiero, esTengo, esTengoQue, esPuedo, esVoyA, esSe, esHay,
    ]

    /// The pattern of either language with this id.
    static func pattern(id: String) -> Pattern? {
        (all + spanishAll).first { $0.id == id }
    }

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
            es("(Yo)", "Ben", "estoy", "-ım (şu an)", "cansado", "yorgun",
               tr: "Yorgunum.",
               note: "Yorgunluk geçici bir durum, o yüzden estar: estoy. \"Yo\" çoğu zaman söylenmez."),
            es("(Yo)", "Ben", "soy", "-ım (kalıcı)", "feliz", "mutlu",
               tr: "Mutlu biriyim.",
               note: "Soy feliz = mutlu bir insanım (kalıcı). Şu an mutluysan: Estoy feliz."),
            es("(Yo)", "Ben", "estoy", "-ım (şu an)", "listo", "hazır",
               tr: "Hazırım.",
               note: "estar + listo = hazırım. Dikkat: ser ile \"Soy listo\" = zekiyim demek!"),
            es("(Yo)", "Ben", "soy", "-ım (kalıcı)", "alto", "uzun boylu",
               tr: "Uzun boyluyum.",
               note: "Boy kalıcı bir özellik, o yüzden ser: soy. Bir kadın \"Soy alta\" der."),
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
            es("(Tú)", "Sen", "eres", "-sın (kalıcı)", "amable", "nazik",
               tr: "Naziksin.",
               note: "Nazik olmak karakterin bir parçası: ser → eres."),
            es("(Tú)", "Sen", "estás", "-sın (şu an)", "cansado", "yorgun",
               tr: "Yorgunsun.",
               note: "Yorgunluk geçer: estar → estás. Soru olarak: ¿Estás cansado? = Yorgun musun?"),
            es("(Tú)", "Sen", "eres", "-sın (kalıcı)", "guapo", "yakışıklı",
               tr: "Yakışıklısın.",
               note: "Görünüş kalıcı bir özellik: eres. Bir kadına: \"Eres guapa\"."),
            es("¿Tú", "Sen", "estás", "-sın (şu an)", "listo?", "hazır",
               tr: "Hazır mısın?",
               note: "Soru için başa ¿, sona ? gelir; kelime sırası değişmez. Filmlerde çok duyarsın."),
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
            es("Ella", "O (kadın)", "es", "-dır (kalıcı)", "fuerte", "güçlü",
               tr: "O güçlü.",
               note: "Güçlü olmak bir özellik: es. -e ile biten sıfat kadın ve erkek için aynıdır."),
            es("Él", "O (erkek)", "está", "-dır (şu an)", "enfermo", "hasta",
               tr: "O hasta.",
               note: "Hastalık geçici bir durum: está. Bir kadın için \"Ella está enferma\"."),
            es("Él", "O (erkek)", "es", "-dır (kalıcı)", "alto", "uzun boylu",
               tr: "O uzun boylu.",
               note: "Boy kalıcı: es. \"Es\" nesneler için de kullanılır: Es grande = Büyük."),
            es("Ella", "O (kadın)", "está", "-dır (şu an)", "contenta", "memnun",
               tr: "O memnun.",
               note: "Kadın için sıfat -a ile biter: contenta. Erkek için contento."),
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

    // MARK: Spanish verb patterns --------------------------------------
    //
    // Each pairs the yo form with the tú form learners hear asked
    // ("¿Quieres…?", "¿Puedes…?"). The subject Spanish drops is shown in
    // parentheses: "(Yo) quiero comer" is said "Quiero comer".

    /// A Spanish example card. The okunuş under each chunk is read by the
    /// same rules as the subtitles' (`SpanishPhonetics`).
    private static func es(_ subject: String, _ subjectTr: String,
                           _ verb: String, _ verbTr: String,
                           _ rest: String, _ restTr: String,
                           tr: String, note: String) -> PatternExample {
        PatternExample(subject: subject, subjectTr: subjectTr,
                       verb: verb, verbTr: verbTr,
                       rest: rest, restTr: restTr,
                       tr: tr,
                       subjectPhonetic: SpanishPhonetics.reading(ofPhrase: subject),
                       verbPhonetic: SpanishPhonetics.reading(ofPhrase: verb),
                       restPhonetic: SpanishPhonetics.reading(ofPhrase: rest),
                       noteTr: note)
    }

    static let esQuiero = Pattern(
        id: "es-quiero",
        familyTr: "querer + fiil",
        familyTrCaps: "QUERER + FİİL",
        titleTr: "Quiero / ¿Quieres? + fiil",
        titleEn: "Quiero / ¿Quieres? + infinitivo",
        summaryTr: "Ne istediğini söyle: \"Quiero comer\" = Yemek istiyorum.",
        introTr:
            "\"Quiero\" = istiyorum. Arkasına fiilin yalın hâli gelir (sonu -ar, " +
            "-er, -ir): \"Quiero ir\" = Gitmek istiyorum. Karşındakine sormak " +
            "için \"¿Quieres…?\": \"¿Quieres jugar?\" = Oynamak ister misin?",
        formula: [
            PatternToken(text: "yo / tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "quiero / quieres", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "quiero", "istiyorum", "comer", "yemek", tr: "Yemek istiyorum.",
               note: "\"comer\" fiilin yalın hâli (-er ile biter). \"Quiero\" zaten \"ben istiyorum\" demek, \"yo\" gerekmez."),
            es("(Yo)", "Ben", "quiero", "istiyorum", "ir a casa", "eve gitmek", tr: "Eve gitmek istiyorum.",
               note: "ir = gitmek, a casa = eve. İstediğin şey fiil olarak gelir: ir."),
            es("(Yo)", "Ben", "no quiero", "istemiyorum", "dormir", "uyumak", tr: "Uyumak istemiyorum.",
               note: "Olumsuz için fiilin önüne \"no\" gelir: no quiero."),
            es("¿Tú", "Sen", "quieres", "istiyor musun", "jugar?", "oynamak", tr: "Oynamak ister misin?",
               note: "Karşındakine sorarken quiero → quieres olur. Birini davet etmenin en kolay yolu."),
        ],
        tipTr:
            "\"Te quiero\" başka bir şeydir: \"Seni seviyorum\". \"Quiero\"dan " +
            "sonra fiil gelirse \"istiyorum\" olur.",
        icon: "star.fill",
        videoStructureId: "es-quiero"
    )

    static let esTengo = Pattern(
        id: "es-tengo",
        familyTr: "tener + isim",
        familyTrCaps: "TENER + İSİM",
        titleTr: "Tengo / ¿Tienes? + isim",
        titleEn: "Tengo / ¿Tienes? + sustantivo",
        summaryTr: "Sahip olduğun şey: \"Tengo un plan\" = Bir planım var.",
        introTr:
            "\"Tengo\" = benim … var. Arkasına isim gelir: \"Tengo una idea\" = " +
            "Bir fikrim var. Olumsuzu \"No tengo\": \"No tengo tiempo\" = " +
            "Zamanım yok. Sormak için \"¿Tienes…?\"",
        formula: [
            PatternToken(text: "yo / tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "tengo / tienes", kind: .verb, isPlaceholder: false),
            PatternToken(text: "isim", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "tengo", "-im var", "una idea", "bir fikir", tr: "Bir fikrim var.",
               note: "una = bir (dişil isimler, la idea). Eril isimlerde un: un plan."),
            es("(Yo)", "Ben", "tengo", "-im var", "hambre", "açlık", tr: "Acıktım.",
               note: "Türkçe \"acıktım\" der, İspanyolca \"açlığım var\": tengo hambre. Aynı şekilde tengo frío = üşüyorum."),
            es("(Yo)", "Ben", "no tengo", "-im yok", "tiempo", "zaman", tr: "Zamanım yok.",
               note: "\"No tengo\" = benim … yok. Filmlerde çok duyarsın: ¡No tengo tiempo!"),
            es("¿Tú", "Sen", "tienes", "-in var mı", "un plan?", "bir plan", tr: "Bir planın var mı?",
               note: "Ben için tengo, sen için tienes: fiilin sonu kişiye göre değişir."),
        ],
        tipTr:
            "Türkçede \"acıktım\", \"korkuyorum\" dediğin yerde İspanyolca " +
            "\"tener\" kullanır: \"Tengo hambre\" (açlığım var), \"Tengo miedo\" " +
            "(korkum var).",
        icon: "bag.fill",
        videoStructureId: "es-tengo"
    )

    static let esTengoQue = Pattern(
        id: "es-tengo-que",
        familyTr: "tener que + fiil",
        familyTrCaps: "TENER QUE + FİİL",
        titleTr: "Tengo que / Tienes que + fiil",
        titleEn: "Tengo que / Tienes que + infinitivo",
        summaryTr: "Yapman gereken: \"Tengo que irme\" = Gitmem lazım.",
        introTr:
            "\"Tengo que\" + fiil = -mam lazım, -malıyım: \"Tengo que trabajar\" " +
            "= Çalışmam lazım. Karşındakine \"Tienes que…\": \"Tienes que verlo\" " +
            "= Onu görmen lazım.",
        formula: [
            PatternToken(text: "yo / tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "tengo que / tienes que", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "tengo que", "-malıyım", "irme", "gitmek", tr: "Gitmem lazım.",
               note: "irme = gitmek; sondaki -me \"kendim\" demek. Vedalaşırken çok kullanılır."),
            es("(Yo)", "Ben", "tengo que", "-malıyım", "trabajar", "çalışmak", tr: "Çalışmam lazım.",
               note: "tengo que + fiilin yalın hâli = yapmam gerek. \"que\" burada ayrıca çevrilmez."),
            es("(Tú)", "Sen", "tienes que", "-malısın", "escuchar", "dinlemek", tr: "Dinlemen lazım.",
               note: "Karşındakine öğüt verirken: tienes que = -malısın."),
            es("(Tú)", "Sen", "no tienes que", "zorunda değilsin", "hacerlo", "onu yapmak",
               tr: "Onu yapmak zorunda değilsin.",
               note: "Dikkat: no tienes que = zorunda değilsin (yasak değil). hacerlo = onu yapmak."),
        ],
        tipTr:
            "\"Tengo\" tek başına \"var\" demek; arkasına \"que\" gelince " +
            "\"zorundayım\" olur. \"Tengo un perro\" (köpeğim var) ama " +
            "\"Tengo que correr\" (koşmam lazım).",
        icon: "exclamationmark.circle.fill",
        videoStructureId: "es-tengo-que"
    )

    static let esPuedo = Pattern(
        id: "es-puedo",
        familyTr: "poder + fiil",
        familyTrCaps: "PODER + FİİL",
        titleTr: "Puedo / ¿Puedes? + fiil",
        titleEn: "Puedo / ¿Puedes? + infinitivo",
        summaryTr: "Yapabildiğin şey: \"Puedo volar\" = Uçabilirim.",
        introTr:
            "\"Puedo\" + fiil = -ebilirim: \"Puedo ayudar\" = Yardım edebilirim. " +
            "\"No puedo\" = -emem. Rica etmek için \"¿Puedes…?\": " +
            "\"¿Puedes ayudarme?\" = Bana yardım edebilir misin?",
        formula: [
            PatternToken(text: "yo / tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "puedo / puedes", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "puedo", "-ebilirim", "volar", "uçmak", tr: "Uçabilirim.",
               note: "puedo + fiilin yalın hâli = -ebilirim."),
            es("(Yo)", "Ben", "puedo", "-ebilirim", "hacerlo", "onu yapmak", tr: "Onu yapabilirim.",
               note: "hacer + lo = hacerlo (onu yapmak): \"lo\" fiilin sonuna yapışır."),
            es("(Yo)", "Ben", "no puedo", "-emem", "creerlo", "ona inanmak", tr: "Buna inanamıyorum.",
               note: "Çok şaşırınca söylenir: \"İnanamıyorum!\" Olumsuzu \"no\" ile: no puedo."),
            es("¿Tú", "Sen", "puedes", "-ebilir misin", "ayudarme?", "bana yardım etmek",
               tr: "Bana yardım edebilir misin?",
               note: "ayudar + me = ayudarme (bana yardım etmek). Rica ederken kullanılır."),
        ],
        tipTr:
            "Fiilin sonuna eklenen -lo, -me, -te nesnedir: \"hacerlo\" = onu " +
            "yapmak, \"ayudarme\" = bana yardım etmek.",
        icon: "bolt.fill",
        videoStructureId: "es-puedo"
    )

    static let esVoyA = Pattern(
        id: "es-voy-a",
        familyTr: "ir a + fiil",
        familyTrCaps: "IR A + FİİL",
        titleTr: "Voy a / Vamos a + fiil",
        titleEn: "Voy a / Vamos a + infinitivo",
        summaryTr: "Yakın gelecek: \"Voy a ganar\" = Kazanacağım.",
        introTr:
            "\"Voy a\" + fiil = -eceğim: \"Voy a comer\" = Yemek yiyeceğim. " +
            "\"Vamos a\" + fiil hem \"-eceğiz\" hem \"hadi, -elim\" demek: " +
            "\"¡Vamos a jugar!\" = Hadi oynayalım!",
        formula: [
            PatternToken(text: "yo / nosotros", kind: .subject, isPlaceholder: false),
            PatternToken(text: "voy a / vamos a", kind: .verb, isPlaceholder: false),
            PatternToken(text: "fiil", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "voy a", "-eceğim", "ganar", "kazanmak", tr: "Kazanacağım.",
               note: "voy a + fiil = yakında yapacağın şey: kazanacağım."),
            es("(Yo)", "Ben", "voy a", "-eceğim", "comer", "yemek", tr: "Yemek yiyeceğim.",
               note: "Planını söylersin. \"a\" ayrıca çevrilmez: voy a = -eceğim."),
            es("(Nosotros)", "Biz", "vamos a", "hadi, -elim", "jugar", "oynamak", tr: "Hadi oynayalım!",
               note: "Vamos a + fiil bir öneri de olur: \"Hadi oynayalım!\""),
            es("(Nosotros)", "Biz", "vamos a", "-eceğiz", "ver", "görmek", tr: "Bakalım (göreceğiz).",
               note: "\"Vamos a ver\" kalıplaşmış bir sözdür: \"Bakalım\"."),
        ],
        tipTr:
            "Arkasında yer varsa \"gidiyorum\" demek: \"Voy a la escuela\" = " +
            "Okula gidiyorum. Arkasında fiil varsa gelecek zaman olur.",
        icon: "arrow.right.circle.fill",
        videoStructureId: "es-voy-a"
    )

    static let esSe = Pattern(
        id: "es-se",
        familyTr: "saber",
        familyTrCaps: "SABER",
        titleTr: "(No) sé / ¿Sabes?",
        titleEn: "(No) sé / ¿Sabes?",
        summaryTr: "Bilmek: \"No sé\" = Bilmiyorum.",
        introTr:
            "\"Sé\" = biliyorum, \"No sé\" = bilmiyorum. Arkasına \"qué\" (ne), " +
            "\"dónde\" (nerede) gibi soru kelimeleri gelebilir: \"No sé qué " +
            "hacer\" = Ne yapacağımı bilmiyorum. Sormak için: \"¿Sabes…?\"",
        formula: [
            PatternToken(text: "yo / tú", kind: .subject, isPlaceholder: false),
            PatternToken(text: "sé / sabes", kind: .verb, isPlaceholder: false),
            PatternToken(text: "qué / dónde…", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("(Yo)", "Ben", "no sé", "bilmiyorum", "qué hacer", "ne yapacağımı",
               tr: "Ne yapacağımı bilmiyorum.",
               note: "qué hacer = ne yapacağımı. Soru kelimeleri aksanlıdır: qué, dónde, cómo."),
            es("(Yo)", "Ben", "sé", "biliyorum", "la respuesta", "cevabı", tr: "Cevabı biliyorum.",
               note: "sé = biliyorum. Aksansız \"se\" başka bir kelimedir."),
            es("¿Tú", "Sen", "sabes", "biliyor musun", "dónde está?", "nerede olduğunu",
               tr: "Nerede olduğunu biliyor musun?",
               note: "dónde está = nerede (olduğu). Bir yeri sormanın en sık yolu."),
            es("(Yo)", "Ben", "no sé", "bilmiyorum", "nadar", "yüzmek", tr: "Yüzme bilmiyorum.",
               note: "saber + fiil = bir şeyi yapmayı bilmek: yüzme bilmiyorum."),
        ],
        tipTr:
            "\"Saber\" + fiil bir şeyi yapmayı bilmek demek: \"Sé nadar\" = " +
            "Yüzme bilirim. \"Bilmek\" olan \"sé\" aksanlıdır; aksansız \"se\" " +
            "başka bir kelimedir.",
        icon: "lightbulb.fill",
        videoStructureId: "es-se"
    )

    static let esHay = Pattern(
        id: "es-hay",
        familyTr: "hay + isim",
        familyTrCaps: "HAY + İSİM",
        titleTr: "Hay + isim",
        titleEn: "Hay + sustantivo",
        summaryTr: "Bir şey var demek: \"Hay un problema\" = Bir sorun var.",
        introTr:
            "\"Hay\" = var. Tekil, çoğul fark etmez: \"Hay un gato\" = Bir kedi " +
            "var, \"Hay dos gatos\" = İki kedi var. Olumsuzu \"No hay\": " +
            "\"No hay tiempo\" = Zaman yok.",
        formula: [
            PatternToken(text: "(aquí)", kind: .subject, isPlaceholder: false),
            PatternToken(text: "hay", kind: .verb, isPlaceholder: false),
            PatternToken(text: "isim", kind: .rest, isPlaceholder: true),
        ],
        examples: [
            es("Aquí", "Burada", "hay", "var", "un gato", "bir kedi", tr: "Burada bir kedi var.",
               note: "hay = var. Tekil ya da çoğul fark etmez: hay dos gatos."),
            es("Aquí", "Burada", "no hay", "yok", "nadie", "kimse", tr: "Burada kimse yok.",
               note: "no hay = yok. nadie = kimse; İspanyolcada \"no\" ile \"nadie\" birlikte gelir."),
            es("Ahora", "Şimdi", "no hay", "yok", "tiempo", "zaman", tr: "Şimdi vakit yok.",
               note: "\"No hay tiempo\" filmlerde çok geçer: vakit yok, acele et!"),
            es("¿Aquí", "Burada", "hay", "var mı", "comida?", "yemek", tr: "Burada yemek var mı?",
               note: "Soru için sadece ¿ ? eklenir: ¿Hay comida? = Yemek var mı?"),
        ],
        tipTr:
            "\"Hay que\" + fiil başka bir kalıptır, \"-mek lazım\" demek: " +
            "\"Hay que correr\" = Koşmak lazım.",
        icon: "eye.fill",
        videoStructureId: "es-hay"
    )
}
