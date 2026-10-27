import XCTest
@testable import EnglishLearning

/// Every subtitle line in the database carries the default speaker
/// "Speaker", which the player printed in purple capitals above every
/// karaoke line ("SPEAKER") — it read like debug output.
final class CurriculumDecodingTests: XCTestCase {
    private func decodeLine(speaker: String) throws -> ClipLine {
        let json = #"{"id":1,"speaker":"\#(speaker)","text":"Hi","startTime":0,"endTime":1,"words":[]}"#
        return try JSONDecoder().decode(ClipLine.self, from: Data(json.utf8))
    }

    func test_placeholderSpeakerDecodesAsBlank() throws {
        XCTAssertEqual(try decodeLine(speaker: "Speaker").speaker, "")
        XCTAssertEqual(try decodeLine(speaker: "SPEAKER").speaker, "")
        XCTAssertEqual(try decodeLine(speaker: "  ").speaker, "")
    }

    func test_realSpeakerNamesSurvive() throws {
        XCTAssertEqual(try decodeLine(speaker: "  Olaf ").speaker, "Olaf")
        XCTAssertEqual(try decodeLine(speaker: "Speaker 2").speaker, "Speaker 2")
    }

    func test_reproduces_fixturesAreFullOfPlaceholderSpeakers() throws {
        let raw = try JSONSerialization.jsonObject(with: Fixture.data("clip-storks-wolves-love-babies.json")) as? [[String: Any]]
        let speakers = (raw?.first?["lines"] as? [[String: Any]] ?? []).compactMap { $0["speaker"] as? String }
        XCTAssertTrue(speakers.contains("Speaker"))
        let decoded = try Fixture.clip("storks")
        XCTAssertFalse(decoded.lines.contains { $0.speaker.caseInsensitiveCompare("speaker") == .orderedSame })
    }
}
