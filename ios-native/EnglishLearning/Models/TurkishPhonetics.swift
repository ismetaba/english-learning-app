import Foundation

/// Turkish-letter okunuş for common English words — the same readings
/// used on the static `PatternFlowCard` examples, extended to cover
/// words that come up in the BE + adjective pattern reels and a thin
/// layer of high-frequency A1/A2 vocabulary surrounding them.
///
/// Lookups are case-insensitive and strip surrounding punctuation so
/// "Sorry?" and "sorry," both resolve to "sori". Words not in the
/// table return nil — the UI hides the okunuş row in that case.
///
/// Conventions (American flavor):
///   /æ/   → e   ("happy" → hepi)
///   /ʌ/   → a   ("funny" → fani, "love" → lav)
///   /ɑːr/ → ar  ("are" → ar — rhotic)
///   /ɜːr/ → ör  ("girl" → görl)
///   /ɔː/  → o   ("tall" → tal in American, "talk" → tok)
///   /oʊ/  → o   ("cold" → kold)
///   /eɪ/  → ey  ("late" → leyt)
///   /aɪ/  → ay  ("I" → ay)
///   /aʊ/  → av  ("now" → nav)
///   /θ/   → t   ("think" → tink)
///   /ð/   → d   ("that" → det, "the" → dı)
///   /w/   → v   (Turkish alphabet has no w — "we" → vi)
///   /ʃ/   → ş   ("she" → şi)
///   /tʃ/  → ç   ("chair" → çer)
enum TurkishPhonetics {

    /// Returns the okunuş for the given English token, after lowercasing
    /// and stripping leading/trailing non-letter characters. Returns nil
    /// when the word isn't in the table.
    static func reading(for raw: String) -> String? {
        let cleaned = clean(raw)
        if cleaned.isEmpty { return nil }
        return table[cleaned]
    }

    /// Lowercase and strip surrounding punctuation/whitespace.
    /// Keeps internal apostrophes so "won't" / "I'm" survive intact.
    static func clean(_ s: String) -> String {
        let lowered = s.lowercased().replacingOccurrences(of: "’", with: "'")
        let trimSet = CharacterSet.punctuationCharacters
            .union(.whitespaces)
            .subtracting(CharacterSet(charactersIn: "'"))
        let trimmed = lowered.unicodeScalars
            .drop(while: { trimSet.contains($0) })
            .reversed()
            .drop(while: { trimSet.contains($0) })
            .reversed()
        return String(String.UnicodeScalarView(trimmed))
    }

    /// Starter dictionary. Conservative — only entries we've verified
    /// against the BE + adjective flow + common conversational glue.
    /// Easy to extend as gaps surface in testing.
    private static let table: [String: String] = [
        // ---- pronouns ----
        "i": "ay",
        "you": "yu",
        "he": "hi",
        "she": "şi",
        "it": "it",
        "we": "vi",
        "they": "dey",
        "me": "mi",
        "him": "him",
        "her": "hör",
        "them": "dem",
        "us": "as",
        "my": "may",
        "your": "yor",
        "his": "hiz",
        "their": "deyr",
        "our": "avır",
        "mine": "mayn",
        "yours": "yorz",

        // ---- BE forms ----
        "am": "em",
        "is": "iz",
        "are": "ar",
        "was": "vaz",
        "were": "vör",
        "be": "bi",
        "been": "bin",
        "being": "biying",

        // ---- common contractions ----
        "i'm": "aym",
        "you're": "yor",
        "he's": "hiz",
        "she's": "şiz",
        "it's": "its",
        "we're": "vir",
        "they're": "deyr",
        "i've": "ayv",
        "you've": "yuv",
        "we've": "viv",
        "they've": "deyv",
        "i'd": "ayd",
        "i'll": "ayl",
        "you'll": "yul",
        "he'll": "hil",
        "she'll": "şil",
        "we'll": "vil",
        "they'll": "deyl",
        "that's": "dets",
        "there's": "derz",
        "here's": "hirz",
        "what's": "vats",
        "let's": "lets",
        "won't": "vont",
        "can't": "kent",
        "don't": "dont",
        "doesn't": "dazınt",
        "didn't": "didınt",
        "isn't": "izınt",
        "aren't": "arnt",
        "wasn't": "vazınt",
        "weren't": "vörnt",
        "haven't": "hevınt",
        "hasn't": "hezınt",
        "hadn't": "hedınt",
        "wouldn't": "vudınt",
        "couldn't": "kudınt",
        "shouldn't": "şudınt",

        // ---- auxiliaries / modals ----
        "have": "hev",
        "has": "hez",
        "had": "hed",
        "do": "du",
        "does": "daz",
        "did": "did",
        "can": "ken",
        "could": "kud",
        "should": "şud",
        "would": "vud",
        "will": "vil",
        "may": "mey",
        "might": "mayt",
        "must": "mast",

        // ---- core verbs ----
        "go": "go",
        "goes": "goz",
        "going": "going",
        "come": "kam",
        "comes": "kamz",
        "coming": "kaming",
        "see": "si",
        "saw": "so",
        "seen": "sin",
        "know": "no",
        "knew": "nu",
        "known": "non",
        "think": "tink",
        "thought": "tot",
        "want": "vant",
        "wants": "vants",
        "wanted": "vantıd",
        "need": "nid",
        "needs": "nidz",
        "like": "layk",
        "likes": "layks",
        "liked": "laykt",
        "love": "lav",
        "loves": "lavz",
        "loved": "lavd",
        "hate": "heyt",
        "make": "meyk",
        "made": "meyd",
        "take": "teyk",
        "took": "tuk",
        "taken": "teykın",
        "get": "get",
        "got": "gat",
        "gotten": "gatın",
        "give": "giv",
        "gave": "geyv",
        "given": "givın",
        "tell": "tel",
        "told": "told",
        "say": "sey",
        "said": "sed",
        "says": "sez",
        "speak": "spik",
        "talk": "tok",
        "look": "luk",
        "find": "faynd",
        "found": "favnd",
        "feel": "fil",
        "felt": "felt",
        "leave": "liv",
        "left": "left",
        "let": "let",
        "live": "liv",
        "lives": "livz",
        "stay": "stey",
        "play": "pley",
        "work": "vörk",
        "works": "vörks",
        "help": "help",
        "stop": "stap",
        "start": "start",
        "try": "tray",
        "use": "yuz",
        "read": "rid",
        "write": "rayt",
        "eat": "it",
        "ate": "eyt",
        "drink": "drink",
        "sleep": "slip",
        "run": "ran",
        "walk": "vok",
        "sing": "sing",
        "buy": "bay",
        "bought": "bot",
        "sell": "sel",
        "pay": "pey",
        "wait": "veyt",
        "watch": "vaç",
        "listen": "lisın",
        "hear": "hir",
        "heard": "hörd",
        "ask": "esk",
        "answer": "ensır",
        "call": "kol",
        "meet": "mit",
        "met": "met",
        "remember": "rimembır",
        "forget": "fırget",
        "learn": "lörn",
        "teach": "tiç",
        "understand": "andırstend",
        "believe": "biliv",

        // ---- common adjectives (BE + adj catalog covered + neighbors) ----
        "happy": "hepi",
        "sad": "sed",
        "tired": "tayırd",
        "hungry": "hangri",
        "thirsty": "törsti",
        "ready": "redi",
        "busy": "bizi",
        "cold": "kold",
        "hot": "hat",
        "warm": "vorm",
        "cool": "kul",
        "tall": "tal",
        "short": "şort",
        "good": "gud",
        "bad": "bed",
        "nice": "nays",
        "kind": "kaynd",
        "late": "leyt",
        "early": "örli",
        "right": "rayt",
        "wrong": "rong",
        "funny": "fani",
        "sorry": "sori",
        "beautiful": "biyutıful",
        "pretty": "priti",
        "ugly": "agli",
        "ok": "okey",
        "okay": "okey",
        "fine": "fayn",
        "great": "greyt",
        "awful": "oful",
        "amazing": "ımeyzing",
        "wonderful": "vandırful",
        "terrible": "teribıl",
        "perfect": "pörfekt",
        "important": "importınt",
        "different": "difırınt",
        "easy": "izi",
        "hard": "hard",
        "big": "big",
        "small": "smol",
        "new": "nu",
        "old": "old",
        "young": "yang",
        "rich": "riç",
        "poor": "pur",
        "strong": "strong",
        "weak": "vik",
        "fast": "fest",
        "slow": "slov",
        "smart": "smart",
        "stupid": "stupid",
        "crazy": "kreyzi",
        "lucky": "laki",
        "alone": "ılon",
        "afraid": "ıfreyd",
        "scared": "skerd",
        "excited": "eksaytıd",
        "bored": "bord",
        "glad": "gled",
        "mad": "med",
        "proud": "pravd",
        "lost": "lost",
        "safe": "seyf",
        "sure": "şur",
        "free": "fri",
        "true": "tru",
        "real": "ril",
        "open": "opın",
        "close": "kloz",
        "married": "merid",
        "single": "singıl",

        // ---- common nouns ----
        "girl": "görl",
        "boy": "boy",
        "man": "men",
        "woman": "vumın",
        "men": "men",
        "women": "vimın",
        "people": "pipıl",
        "person": "pörsın",
        "friend": "frend",
        "friends": "frendz",
        "family": "femili",
        "kid": "kid",
        "kids": "kidz",
        "child": "çayld",
        "baby": "beybi",
        "home": "hom",
        "house": "havs",
        "school": "skul",
        "day": "dey",
        "night": "nayt",
        "morning": "morning",
        "time": "taym",
        "year": "yir",
        "years": "yirz",
        "way": "vey",
        "name": "neym",
        "thing": "ting",
        "things": "tingz",
        "place": "pleys",
        "world": "vörld",
        "life": "layf",
        "money": "mani",
        "food": "fud",
        "water": "vatır",
        "coffee": "kofi",
        "car": "kar",
        "book": "buk",
        "phone": "fon",
        "movie": "muvi",
        "music": "myuzik",
        "song": "song",
        "game": "geym",
        "job": "cab",
        "city": "siti",
        "country": "kantri",
        "room": "rum",
        "door": "dor",
        "table": "teybıl",
        "dog": "dog",
        "cat": "ket",
        "problem": "prablım",
        "question": "kuesçın",
        "questions": "kuesçınz",
        "idea": "aydiya",
        "story": "stori",
        "reason": "rizın",

        // ---- adverbs / quantifiers / connectors ----
        "very": "veri",
        "really": "rili",
        "so": "so",
        "too": "tu",
        "just": "cast",
        "maybe": "meybi",
        "always": "olveyz",
        "never": "nevır",
        "sometimes": "samtaymz",
        "now": "nav",
        "then": "den",
        "today": "tudey",
        "tomorrow": "tumorov",
        "yesterday": "yestırdey",
        "again": "ıgen",
        "still": "stil",
        "already": "olredi",
        "almost": "olmost",
        "much": "maç",
        "many": "meni",
        "more": "mor",
        "less": "les",
        "most": "most",
        "few": "fyu",
        "only": "onli",
        "ever": "evır",
        "soon": "sun",
        "well": "vel",
        "even": "ivın",
        "also": "olso",

        // ---- determiners / demonstratives / articles ----
        "the": "dı",
        "a": "ı",
        "an": "ın",
        "this": "dis",
        "that": "det",
        "these": "diz",
        "those": "doz",
        "some": "sam",
        "any": "eni",
        "every": "evri",
        "all": "ol",
        "each": "iç",
        "another": "ınadır",
        "other": "adır",
        "same": "seym",

        // ---- prepositions / interrogatives / common glue ----
        "in": "in",
        "on": "an",
        "at": "et",
        "of": "av",
        "to": "tu",
        "for": "for",
        "from": "fram",
        "with": "vid",
        "without": "vidavt",
        "by": "bay",
        "about": "ıbavt",
        "into": "intu",
        "out": "avt",
        "up": "ap",
        "down": "davn",
        "over": "ovır",
        "under": "andır",
        "before": "bifor",
        "after": "eftır",
        "between": "bitvin",
        "near": "nir",
        "off": "of",

        "what": "vat",
        "when": "ven",
        "where": "ver",
        "why": "vay",
        "how": "hav",
        "who": "hu",
        "which": "viç",
        "whose": "huz",

        "and": "end",
        "but": "bat",
        "or": "or",
        "if": "if",
        "because": "bikoz",
        "though": "do",
        "while": "vayl",

        "yes": "yes",
        "yeah": "ye",
        "no": "no",
        "not": "nat",

        "here": "hir",
        "there": "der",

        // ==== Reels audit additions ====
        // Words observed in the live be-adj-* pattern scenes that
        // weren't covered by the base catalog. Mixed parts of speech;
        // grouped only loosely. Proper nouns (movie character names)
        // are deliberately left out — they keep their English form.

        // verb forms — gerunds & past tenses
        "having": "heving",
        "getting": "geting",
        "doing": "duing",
        "keeping": "kiping",
        "looking": "luking",
        "leaving": "living",
        "feeling": "filing",
        "hearing": "hiring",
        "saying": "seying",
        "seeing": "siing",
        "knowing": "noing",
        "lying": "laying",
        "trying": "traying",
        "running": "raning",
        "standing": "stending",
        "passing": "pesing",
        "grabbing": "grebing",
        "sticking": "stiking",
        "processing": "prasesing",
        "treating": "triting",
        "trusting": "trasting",
        "starting": "starting",
        "satisfying": "setisfaying",
        "fronting": "franting",
        "joking": "coking",
        "kidding": "kiding",
        "starving": "starving",
        "balling": "boling",

        "came": "keym",
        "went": "vent",
        "woke": "vok",
        "looked": "lukt",
        "asked": "eskt",
        "earned": "örnd",
        "started": "startıd",
        "ended": "endıd",
        "happened": "hepınd",
        "tried": "trayd",
        "turned": "törnd",
        "botched": "baçt",
        "coerced": "koörst",
        "flattered": "fletırd",
        "prepared": "priperd",
        "relaxed": "rilekst",
        "satisfied": "setisfayd",
        "snapped": "snept",
        "surprised": "sıprayzd",
        "thrilled": "trild",
        "distracted": "distrektıd",
        "supposed": "sıpozd",
        "honored": "anırd",
        "confused": "kınfyuzd",

        // verbs — base / third person
        "agree": "ıgri",
        "admit": "ıdmit",
        "allow": "ılav",
        "apologize": "ıpalıcayz",
        "assure": "ışur",
        "break": "breyk",
        "care": "ker",
        "contribute": "kıntribyut",
        "decide": "disayd",
        "decides": "disaydz",
        "discuss": "diskas",
        "drag": "dreg",
        "expect": "ikspekt",
        "fight": "fayt",
        "fix": "fiks",
        "happen": "hepın",
        "hit": "hit",
        "hurt": "hört",
        "interrupt": "intırapt",
        "keep": "kip",
        "kill": "kil",
        "kills": "kilz",
        "lose": "luz",
        "mean": "min",
        "miss": "mis",
        "obeys": "obeyz",
        "order": "ordır",
        "orders": "ordırz",
        "prove": "pruv",
        "realize": "rilayz",
        "rest": "rest",
        "steal": "stil",
        "swear": "sver",
        "thank": "tenk",
        "turn": "törn",
        "serves": "sörvz",
        "set": "set",
        "starts": "starts",
        "chomp": "çamp",
        "laugh": "lef",
        "grill": "gril",

        // adjectives & participial adjectives
        "able": "eybıl",
        "angry": "engri",
        "asleep": "ıslip",
        "better": "betır",
        "broken": "brokın",
        "calm": "kam",
        "cute": "kyut",
        "cynical": "sinikıl",
        "clever": "klevır",
        "comfortable": "kamfırtıbıl",
        "completely": "kımplitli",
        "corrupt": "kırapt",
        "dark": "dark",
        "deep": "dip",
        "done": "dan",
        "drunk": "drank",
        "dumb": "dam",
        "eccentric": "iksentrik",
        "evil": "ivıl",
        "faithful": "feytful",
        "fair": "fer",
        "fancy": "fensi",
        "far": "far",
        "fat": "fet",
        "first": "först",
        "foolish": "fuliş",
        "forgetful": "fırgetful",
        "grateful": "greytful",
        "grievous": "grivıs",
        "guilty": "gilti",
        "handsome": "hensım",
        "higher": "hayır",
        "holy": "holi",
        "impulsive": "impalsiv",
        "infinite": "infinit",
        "innocent": "inısınt",
        "interesting": "intırısting",
        "jealous": "celıs",
        "last": "lest",
        "little": "litıl",
        "long": "long",
        "longer": "longır",
        "modern": "madırn",
        "modest": "madıst",
        "monstrous": "manstrıs",
        "nervous": "nörvıs",
        "next": "nekst",
        "older": "oldır",
        "pathetic": "pıtetik",
        "positive": "pazitiv",
        "pregnant": "pregnınt",
        "private": "prayvıt",
        "quiet": "kvayıt",
        "quite": "kvayt",
        "responsible": "rispansıbıl",
        "restless": "restlıs",
        "richer": "riçır",
        "serious": "sirius",
        "sick": "sik",
        "soft": "soft",
        "stuck": "stak",
        "sweet": "svit",
        "top": "tap",
        "totally": "totıli",
        "thoroughly": "törıli",
        "weird": "vird",
        "worse": "vörs",

        // nouns
        "ambassador": "embesıdır",
        "animation": "enimeyşın",
        "art": "art",
        "assembly": "ısembli",
        "assumption": "ısampşın",
        "asshole": "eshol",
        "aunt": "ent",
        "band": "bend",
        "barrier": "berier",
        "beauty": "byuti",
        "best": "best",
        "bitch": "biç",
        "bowline": "bovlayn",
        "boys": "boyz",
        "bra": "bra",
        "brother": "bradır",
        "buddy": "badi",
        "building": "bilding",
        "carrot": "kerıt",
        "case": "keys",
        "casualty": "kejuılti",
        "chance": "çens",
        "chef": "şef",
        "children": "çildrın",
        "chip": "çip",
        "challenges": "çelıncız",
        "character": "kerıktır",
        "code": "kod",
        "confessions": "kınfeşınz",
        "courtroom": "kortrum",
        "crime": "kraym",
        "curse": "körs",
        "dad": "ded",
        "danger": "deyncır",
        "decoration": "dekıreyşın",
        "desk": "desk",
        "dinner": "dinır",
        "doc": "dak",
        "dress": "dres",
        "dwarf": "duvorf",
        "end": "end",
        "european": "yurıpiyın",
        "face": "feys",
        "father": "fadır",
        "filter": "filtır",
        "fire": "fayr",
        "flame": "fleym",
        "freak": "frik",
        "friendship": "frendşip",
        "fucking": "faking",
        "fury": "fyuri",
        "god": "gad",
        "ground": "gravnd",
        "guys": "gayz",
        "hair": "her",
        "hand": "hend",
        "handicap": "hendikep",
        "head": "hed",
        "hell": "hel",
        "honey": "hani",
        "honor": "anır",
        "information": "infırmeyşın",
        "innocence": "inısıns",
        "intentions": "intenşınz",
        "interest": "intırest",
        "interior": "intiriır",
        "iron": "ayırn",
        "kindness": "kayndnıs",
        "key": "ki",
        "law": "lo",
        "legend": "lecınd",
        "line": "layn",
        "loaf": "lof",
        "london": "landın",
        "lot": "lat",
        "mama": "mama",
        "maniac": "meyniyek",
        "masterpiece": "mestırpis",
        "meat": "mit",
        "middle": "midıl",
        "mistrial": "mistrayıl",
        "mom": "mam",
        "mommy": "mami",
        "monkeys": "mankiz",
        "mother": "madır",
        "muffin": "mafin",
        "mr": "mistır",
        "ms": "miz",
        "mutilation": "myutıleyşın",
        "neck": "nek",
        "news": "nuz",
        "ordeal": "ordil",
        "party": "parti",
        "piece": "pis",
        "plan": "plen",
        "power": "pavır",
        "pumpkin": "pampkin",
        "relationship": "rileyşınşip",
        "relic": "relik",
        "restaurant": "restırınt",
        "rooster": "rustır",
        "russian": "raşın",
        "saber": "seybır",
        "secret": "sikrıt",
        "sentiment": "sentımınt",
        "shit": "şit",
        "sir": "sör",
        "sister": "sistır",
        "skirt": "skört",
        "soldier": "solcır",
        "son": "san",
        "sound": "savnd",
        "soup": "sup",
        "space": "speys",
        "stranger": "streyncır",
        "strength": "strengt",
        "students": "studınts",
        "system": "sistım",
        "truth": "trut",
        "upstage": "apsteyc",
        "upset": "apset",
        "violence": "vayılıns",
        "weapon": "vepın",
        "weapons": "vepınz",
        "wedding": "veding",
        "winners": "vinırz",
        "wood": "vud",

        // adverbs / connectors / glue / contractions
        "actually": "ekçuıli",
        "ain't": "eynt",
        "anybody": "enibadi",
        "anymore": "enimor",
        "anything": "eniting",
        "around": "ıravnd",
        "as": "ez",
        "back": "bek",
        "banquet's": "benkvets",
        "certain": "sörtın",
        "certainly": "sörtınli",
        "due": "du",
        "east": "ist",
        "else": "els",
        "enough": "ınaf",
        "everyone": "evrivan",
        "everything": "evriting",
        "gone": "gan",
        "gonna": "gana",
        "gotta": "gata",
        "himself": "himself",
        "huh": "ha",
        "its": "its",
        "myself": "mayself",
        "nothing": "nating",
        "once": "vans",
        "one": "van",
        "since": "sins",
        "someone's": "samvanz",
        "something": "samting",
        "sooner": "sunır",
        "than": "den",
        "thus": "das",
        "together": "tugedır",
        "uh": "a",
        "whatever": "vatevır",
        "who's": "huz",
        "willing": "viling",
        "yet": "yet",
        "yourself": "yorself",

        // ==== Catchable starter words ====
        // A2 starter words tagged in the videos that had no reading (and
        // no IPA), so their okunuş row was blank on the reel, the word
        // page and the list tile.
        "become": "bikam",
        "build": "bild",
        "change": "çeync",
        "clean": "klin",
        "drive": "drayv",
        "hope": "hop",
        "send": "send",
        "show": "şo",
        "visit": "vizit",
        "week": "vik",
    ]
}

/// Turkish-letter okunuş for SPANISH words. Unlike `TurkishPhonetics`
/// (a curated English → reading dictionary), Spanish spelling is almost
/// fully phonetic, so this is a rule-based transducer: any word in, a
/// Turkish-readable approximation out. Latin American pronunciation: no
/// /θ/, so c(e/i) and z both read "s".
///
///   j, g(e/i)  → h   ("joven" → hoben, "gente" → hente)
///   ll         → y   (yeísmo: "ellos" → eyos)
///   ñ          → ny  ("niño" → ninyo)
///   c(e/i), z  → s   ("feliz" → felis, "cinco" → sinko)
///   c, qu, k   → k   ("casa" → kasa, "qué" → ke)
///   v          → b   (Spanish merges b/v: "vivo" → bibo)
///   h          → ∅   (silent: "hola" → ola)
///   gu(e/i)    → g   (silent u: "guitarra" → gitarra)
///   gü(e/i)    → gu  (the diaeresis restores the u)
///   ch → ç, x → ks; vowels stay; acute accents are dropped.
enum SpanishPhonetics {

    static func reading(for raw: String) -> String? {
        // The English cleaner lowercases and strips wrapping punctuation,
        // ¿ and ¡ included.
        let cleaned = TurkishPhonetics.clean(raw)
        guard cleaned.contains(where: { $0.isLetter }) else { return nil }
        if cleaned == "y" { return "i" }          // the word "y" (and)

        let chars = Array(dropAcuteAccents(cleaned))
        let n = chars.count
        var out = ""
        var i = 0
        func at(_ k: Int) -> Character? { (k >= 0 && k < n) ? chars[k] : nil }
        func isFront(_ c: Character?) -> Bool { c == "e" || c == "i" }

        while i < n {
            let c = chars[i]
            let next = at(i + 1)
            switch c {
            case "c":
                if next == "h" { out += "ç"; i += 2 }              // ch → ç
                else if isFront(next) { out += "s"; i += 1 }      // ce/ci → s
                else { out += "k"; i += 1 }
            case "l":
                if next == "l" { out += "y"; i += 2 }             // ll → y
                else { out += "l"; i += 1 }
            case "q":
                // que/qui → k (the u is silent); a rare qua/quo keeps it.
                if next == "u" && isFront(at(i + 2)) { out += "k"; i += 2 }
                else { out += "k"; i += 1 }
            case "g":
                if next == "u" && isFront(at(i + 2)) { out += "g"; i += 2 }   // gue/gui
                else if next == "ü" { out += "gu"; i += 2 }                   // güe/güi
                else if isFront(next) { out += "h"; i += 1 }                  // ge/gi
                else { out += "g"; i += 1 }
            case "j": out += "h"; i += 1
            case "h": i += 1
            case "z": out += "s"; i += 1
            case "v": out += "b"; i += 1
            case "ñ": out += "ny"; i += 1
            case "ü": out += "u"; i += 1
            case "x": out += "ks"; i += 1
            case "w": out += "v"; i += 1
            default: out.append(c); i += 1                       // vowels, b d f k m n p r s t y
            }
        }
        return out.isEmpty ? nil : out
    }

    /// á é í ó ú → a e i o u; ü and ñ stay, the scan reads them.
    private static func dropAcuteAccents(_ s: String) -> String {
        var r = s
        for (accented, plain) in [("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")] {
            r = r.replacingOccurrences(of: accented, with: plain)
        }
        return r
    }
}

/// The okunuş engine for the learning language, so each screen has one
/// call site: English words read from the curated dictionary, Spanish
/// words from the rules. The output is Turkish letters either way.
enum Okunus {
    static func reading(for raw: String, learning: LearningLanguage) -> String? {
        switch learning {
        case .es: return SpanishPhonetics.reading(for: raw)
        case .en: return TurkishPhonetics.reading(for: raw)
        }
    }

    /// A subtitle token as the starter banner shows it: letters and
    /// apostrophes only ("happy." → "happy", "¿Está" → "Está"). Any
    /// script's letters count, so Spanish keeps its accents and ñ.
    static func displayWord(_ raw: String) -> String {
        raw.replacingOccurrences(of: "[^\\p{L}']", with: "", options: .regularExpression)
    }
}
