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

/// Each learning language has its own server: English the original admin,
/// Spanish the separate Spanish-only deployment.
final class LanguageServerTests: XCTestCase {

    func test_idsNameTheirLanguage() {
        XCTAssertEqual(LearningLanguage.of(videoId: "es-peppa-calor-y-frio-2"), .es)
        XCTAssertEqual(LearningLanguage.of(videoId: "storks-wolves-love-babies"), .en)
        XCTAssertEqual(LearningLanguage.of(wordId: "a2-es-gustar"), .es)
        XCTAssertEqual(LearningLanguage.of(wordId: "a2-make"), .en)
        XCTAssertEqual(LearningLanguage.of(patternId: "ser-estar-adj-el"), .es)
        XCTAssertEqual(LearningLanguage.of(patternId: "be-adj-i"), .en)
    }

    func test_defaultServers() {
        let none: (String) -> String? = { _ in nil }
        XCTAssertEqual(APIClient.baseURL(for: .en, environment: [:], plist: none).absoluteString,
                       "https://english-learning-admin.fly.dev")
        XCTAssertEqual(APIClient.baseURL(for: .es, environment: [:], plist: none).absoluteString,
                       "https://english-learning-es.fly.dev")
    }

    /// The environment wins over Info.plist, each language has its own key,
    /// and an empty value (an unset $(VAR) in the plist) is ignored rather
    /// than crashing the app.
    func test_overrides() {
        let env = ["ADMIN_API_BASE_URL_ES": "http://localhost:3939"]
        let plist: (String) -> String? = { $0 == "ADMIN_API_BASE_URL" ? "" : "http://plist.example" }
        XCTAssertEqual(APIClient.baseURL(for: .es, environment: env, plist: plist).absoluteString,
                       "http://localhost:3939")
        XCTAssertEqual(APIClient.baseURL(for: .en, environment: env, plist: plist).absoluteString,
                       "https://english-learning-admin.fly.dev")
    }
}
