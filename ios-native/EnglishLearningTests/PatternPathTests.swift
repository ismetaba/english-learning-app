import XCTest
@testable import EnglishLearning

/// The Spanish pattern path: its order, its scenes, and the cards' okunuş.
final class PatternPathTests: XCTestCase {

    func test_spanishPathOrder() {
        XCTAssertEqual(PatternCatalog.catalog(for: .es).map(\.id), [
            "ser-estar-adj-yo", "ser-estar-adj-tu", "ser-estar-adj-el",
            "es-quiero", "es-tengo", "es-tengo-que", "es-puedo", "es-voy-a", "es-se", "es-hay",
        ])
    }

    /// Every step has a scene reel on the Spanish server, which its id
    /// routes to.
    func test_spanishPatternsHaveScenes() {
        for p in PatternCatalog.catalog(for: .es) {
            XCTAssertEqual(p.videoStructureId, p.id)
            XCTAssertEqual(LearningLanguage.of(patternId: p.id), .es, p.id)
            XCTAssertGreaterThanOrEqual(p.examples.count, 4, p.id)
        }
    }

    /// The okunuş under each chunk follows the same rules as the subtitles'.
    func test_spanishExamplesReadByTheRules() {
        for p in PatternCatalog.catalog(for: .es) {
            for e in p.examples {
                XCTAssertEqual(e.subjectPhonetic, SpanishPhonetics.reading(ofPhrase: e.subject), "\(p.id) \(e.subject)")
                XCTAssertEqual(e.verbPhonetic, SpanishPhonetics.reading(ofPhrase: e.verb), "\(p.id) \(e.verb)")
                XCTAssertEqual(e.restPhonetic, SpanishPhonetics.reading(ofPhrase: e.rest), "\(p.id) \(e.rest)")
            }
        }
    }

    func test_patternLookup() {
        XCTAssertEqual(PatternCatalog.pattern(id: "es-hay")?.titleTr, "Hay + isim")
        XCTAssertNil(PatternCatalog.pattern(id: "nope"))
    }

    /// A Spanish learner starts on Kalıplar until a Spanish pattern is done;
    /// English opens on the videos as before.
    func test_launchTab() {
        XCTAssertEqual(MainTab.launch(learning: .es, completedPatterns: []), .patterns)
        XCTAssertEqual(MainTab.launch(learning: .es, completedPatterns: ["be-adj-i"]), .patterns)
        XCTAssertEqual(MainTab.launch(learning: .es, completedPatterns: ["ser-estar-adj-yo"]), .home)
        XCTAssertEqual(MainTab.launch(learning: .en, completedPatterns: []), .home)
    }
}
