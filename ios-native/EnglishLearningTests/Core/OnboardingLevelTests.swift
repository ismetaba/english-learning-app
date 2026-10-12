import XCTest
@testable import EnglishLearning

/// Review round 2: onboarding's only question ("Nereden başlayalım?")
/// was stored and never read, so "Orta" and "Başlangıç" got the same app.
/// The answer now sets the starting speed.
final class OnboardingLevelTests: XCTestCase {

    func test_intermediateLearnersStartAtNativeSpeed() {
        XCTAssertEqual(OnboardingLevel.intermediate.suggestedPlaybackRate, 1.0)
    }

    func test_beginnersStartSlower() {
        XCTAssertEqual(OnboardingLevel.beginner.suggestedPlaybackRate, 0.75)
        XCTAssertEqual(OnboardingLevel.elementary.suggestedPlaybackRate, 0.75)
        XCTAssertEqual(OnboardingLevel.none.suggestedPlaybackRate, 0.75)
    }

    /// AppState only restores a speed the Hız menu offers.
    func test_everySuggestedSpeedIsOnTheSpeedMenu() {
        for level in OnboardingLevel.allCases {
            XCTAssertTrue([0.5, 0.75, 1.0].contains(level.suggestedPlaybackRate), "\(level)")
        }
    }
}
