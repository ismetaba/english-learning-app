import XCTest
@testable import EnglishLearning

/// The sentence a pattern card reads aloud: its chunks as a learner would
/// say them. A subject in parentheses is the one Spanish drops, so it is
/// not said ("(Yo) quiero comer" is said "Quiero comer").
final class SpokenSentenceTests: XCTestCase {

    func test_droppedSubjectIsNotSaid() {
        XCTAssertEqual(SpokenSentence.text(["(Yo)", "quiero", "comer"]), "Quiero comer.")
        XCTAssertEqual(SpokenSentence.text(["(Nosotros)", "vamos a", "jugar"]), "Vamos a jugar.")
        XCTAssertEqual(SpokenSentence.text(["(Yo)", "no sé", "qué hacer"]), "No sé qué hacer.")
    }

    func test_questionsKeepTheirMarks() {
        XCTAssertEqual(SpokenSentence.text(["¿Tú", "quieres", "jugar?"]), "¿Tú quieres jugar?")
        XCTAssertEqual(SpokenSentence.text(["¿Aquí", "hay", "comida?"]), "¿Aquí hay comida?")
    }

    func test_englishReadsAsWritten() {
        XCTAssertEqual(SpokenSentence.text(["I", "am", "happy"]), "I am happy.")
        XCTAssertEqual(SpokenSentence.text(["There", "is", "a cat in the room"]), "There is a cat in the room.")
    }

    /// Latin American Spanish, so a Mexican voice rather than Spain's.
    func test_voicePerLanguage() {
        XCTAssertEqual(LearningLanguage.es.speechLanguage, "es-MX")
        XCTAssertEqual(LearningLanguage.en.speechLanguage, "en-US")
    }
}
