import XCTest
@testable import EnglishLearning

/// One playback speed per learning language: a learner who follows English
/// at native speed (onboarding "Orta" sets 1.0×) is a beginner in Spanish,
/// whose scenes start slowed down.
final class PlaybackRatesTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        defaults = UserDefaults(suiteName: "PlaybackRatesTests")
        defaults.removePersistentDomain(forName: "PlaybackRatesTests")
    }

    func test_spanishStartsSlowedDownWhateverEnglishIs() {
        PlaybackRates.save(1.0, for: .en, to: defaults)
        XCTAssertEqual(PlaybackRates.load(for: .es, from: defaults), 0.75)
        XCTAssertEqual(PlaybackRates.load(for: .en, from: defaults), 1.0)
    }

    func test_eachLanguageKeepsItsOwnSpeed() {
        PlaybackRates.save(0.5, for: .es, to: defaults)
        PlaybackRates.save(1.0, for: .en, to: defaults)
        XCTAssertEqual(PlaybackRates.load(for: .es, from: defaults), 0.5)
        XCTAssertEqual(PlaybackRates.load(for: .en, from: defaults), 1.0)
    }

    /// English keeps the key it was stored under before, so no learner's
    /// chosen speed is lost.
    func test_englishReadsTheExistingSetting() {
        defaults.set(1.0, forKey: "playback_rate_v1")
        XCTAssertEqual(PlaybackRates.load(for: .en, from: defaults), 1.0)
    }

    func test_anUnknownSpeedFallsBackToThreeQuarters() {
        defaults.set(1.7, forKey: "playback_rate_v1")
        XCTAssertEqual(PlaybackRates.load(for: .en, from: defaults), 0.75)
        XCTAssertEqual(PlaybackRates.load(for: .es, from: defaults), 0.75)
    }
}
