import XCTest
@testable import EnglishLearning

final class CoreSmokeTests: XCTestCase {
    func test_coreModuleBuilds() {
        XCTAssertFalse(YouTubeEmbedHTML.make(videoId: "x", start: 0, end: nil, autoplay: true).isEmpty)
    }
}
