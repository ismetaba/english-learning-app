import XCTest
@testable import EnglishLearning

final class LearningLanguageTests: XCTestCase {

    /// The raw values are both the `?lang=` the backend reads and the
    /// stored setting, so they must never change.
    func test_rawValuesMatchTheBackend() {
        XCTAssertEqual(LearningLanguage.en.rawValue, "en")
        XCTAssertEqual(LearningLanguage.es.rawValue, "es")
        XCTAssertEqual(LearningLanguage.es.queryItem, URLQueryItem(name: "lang", value: "es"))
    }

    /// Starter ids are namespaced by the backend ("a2-<word>" English,
    /// "a2-es-<word>" Spanish), so one stored word list serves both tracks.
    func test_wordIdsBelongToOneLanguage() {
        XCTAssertTrue(LearningLanguage.en.owns(wordId: "a2-happy"))
        XCTAssertFalse(LearningLanguage.es.owns(wordId: "a2-happy"))
        XCTAssertTrue(LearningLanguage.es.owns(wordId: "a2-es-feliz"))
        XCTAssertFalse(LearningLanguage.en.owns(wordId: "a2-es-feliz"))
        // An English word that merely starts with "es" stays English.
        XCTAssertTrue(LearningLanguage.en.owns(wordId: "a2-escape"))
    }

    func test_videoIdsBelongToOneLanguage() {
        XCTAssertTrue(LearningLanguage.en.owns(videoId: "storks-wolves-love-babies"))
        XCTAssertTrue(LearningLanguage.en.owns(videoId: "escape-room-clip"))
        XCTAssertTrue(LearningLanguage.es.owns(videoId: "es-peppa-calor-y-frio"))
        XCTAssertFalse(LearningLanguage.en.owns(videoId: "es-peppa-calor-y-frio"))
    }

    func test_filtersAMixedList() {
        let learned = ["a2-make", "a2-es-feliz", "a2-life", "a2-es-casa"]
        XCTAssertEqual(LearningLanguage.en.filter(wordIds: learned), ["a2-make", "a2-life"])
        XCTAssertEqual(LearningLanguage.es.filter(wordIds: learned), ["a2-es-feliz", "a2-es-casa"])
    }
}
