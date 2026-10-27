import XCTest
@testable import EnglishLearning

/// Turkish-letter okunuş for the Spanish track. Spanish spelling is
/// nearly phonetic, so readings come from rules (Latin American: no /θ/,
/// c(e/i) and z read "s"); these pin the grapheme → reading mappings.
final class SpanishPhoneticsTests: XCTestCase {

    /// ser/estar + adjective vocabulary — the Spanish pattern family.
    func test_serEstarAndAdjectives() {
        XCTAssertEqual(SpanishPhonetics.reading(for: "soy"), "soy")
        XCTAssertEqual(SpanishPhonetics.reading(for: "estoy"), "estoy")
        XCTAssertEqual(SpanishPhonetics.reading(for: "está"), "esta")
        XCTAssertEqual(SpanishPhonetics.reading(for: "feliz"), "felis")
        XCTAssertEqual(SpanishPhonetics.reading(for: "cansado"), "kansado")
        XCTAssertEqual(SpanishPhonetics.reading(for: "contenta"), "kontenta")
    }

    func test_consonantRules() {
        XCTAssertEqual(SpanishPhonetics.reading(for: "joven"), "hoben")     // j→h, v→b
        XCTAssertEqual(SpanishPhonetics.reading(for: "gente"), "hente")     // g(e)→h
        XCTAssertEqual(SpanishPhonetics.reading(for: "ellos"), "eyos")      // ll→y
        XCTAssertEqual(SpanishPhonetics.reading(for: "hola"), "ola")        // h silent
        XCTAssertEqual(SpanishPhonetics.reading(for: "niño"), "ninyo")      // ñ→ny
        XCTAssertEqual(SpanishPhonetics.reading(for: "cinco"), "sinko")     // c(i)→s, c(o)→k
        XCTAssertEqual(SpanishPhonetics.reading(for: "cerca"), "serka")     // c(e)→s
        XCTAssertEqual(SpanishPhonetics.reading(for: "chico"), "çiko")      // ch→ç
        XCTAssertEqual(SpanishPhonetics.reading(for: "perro"), "perro")     // rr kept
    }

    func test_silentUAndDiaeresis() {
        XCTAssertEqual(SpanishPhonetics.reading(for: "qué"), "ke")
        XCTAssertEqual(SpanishPhonetics.reading(for: "quiero"), "kiero")
        XCTAssertEqual(SpanishPhonetics.reading(for: "guitarra"), "gitarra")
        XCTAssertEqual(SpanishPhonetics.reading(for: "guapo"), "guapo")
        XCTAssertEqual(SpanishPhonetics.reading(for: "pingüino"), "pinguino")
    }

    /// Subtitle tokens arrive capitalised and wrapped in punctuation,
    /// including the inverted ¿ ¡ that open Spanish questions.
    func test_subtitleTokens() {
        XCTAssertEqual(SpanishPhonetics.reading(for: "¿Estás"), "estas")
        XCTAssertEqual(SpanishPhonetics.reading(for: "¡Hola!"), "ola")
        XCTAssertEqual(SpanishPhonetics.reading(for: "Él,"), "el")
    }

    func test_standaloneYAndNonLetters() {
        XCTAssertEqual(SpanishPhonetics.reading(for: "y"), "i")
        XCTAssertNil(SpanishPhonetics.reading(for: ""))
        XCTAssertNil(SpanishPhonetics.reading(for: "123"))
        XCTAssertNil(SpanishPhonetics.reading(for: "¿?"))
    }

    /// One call site per screen: the learning language picks the engine,
    /// the output is Turkish letters either way.
    func test_okunusDispatch() {
        XCTAssertEqual(Okunus.reading(for: "feliz", learning: .es), "felis")
        XCTAssertEqual(Okunus.reading(for: "happy", learning: .en), TurkishPhonetics.reading(for: "happy"))
    }

    /// The starter banner shows the bare word: English stays exactly as
    /// before (letters + apostrophes), Spanish keeps its accents and ñ.
    func test_displayWord() {
        XCTAssertEqual(Okunus.displayWord("don't,"), "don't")
        XCTAssertEqual(Okunus.displayWord("happy."), "happy")
        XCTAssertEqual(Okunus.displayWord("¿Está"), "Está")
        XCTAssertEqual(Okunus.displayWord("niño!"), "niño")
    }
}
