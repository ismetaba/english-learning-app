import XCTest
@testable import EnglishLearning

/// The floating tab bar hides while a video screen is on top. Seven screens
/// flipped one shared Bool from onAppear/onDisappear; SwiftUI does not order
/// the old screen's onDisappear after the new screen's onAppear, so pushing
/// player-over-player left the flag false and the tab bar drew over the
/// video (PatternReelsView carried a watchdog hack for exactly this).
final class ImmersivePresenceTests: XCTestCase {
    func test_pushOrderDoesNotMatter() {
        var p = ImmersivePresence()
        let flow = UUID(), reels = UUID()
        p.enter(flow)
        p.enter(reels)       // reels pushed on top of the flow
        p.exit(flow)         // flow's onDisappear fires AFTER reels' onAppear
        XCTAssertTrue(p.isActive, "tab bar must stay hidden while reels are visible")
        p.exit(reels)
        XCTAssertFalse(p.isActive)
    }

    func test_idempotentAndUnknownTokensAreHarmless() {
        var p = ImmersivePresence()
        let a = UUID()
        p.enter(a); p.enter(a)
        p.exit(UUID())
        XCTAssertTrue(p.isActive)
        p.exit(a)
        XCTAssertFalse(p.isActive)
        p.exit(a)
        XCTAssertFalse(p.isActive)
    }
}
