import Foundation
import XCTest
@testable import EnglishLearning

/// Real API payloads captured from production (english-learning-admin.fly.dev)
/// on 2026-10-12, plus a `UserProgress` blob written by app 1.0.1. Read
/// relative to this source file so the same tests run under SwiftPM on
/// Linux and in the Xcode test bundle on the iOS simulator.
enum Fixture {
    static let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("Fixtures", isDirectory: true)

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(name))
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: data(name))
    }

    /// `/api/v1/poc-videos/{id}/clips` responses (primary clip only).
    static func clipFileNames() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("clip-") && $0.hasSuffix(".json") }
            .sorted()
    }

    static func allClips() throws -> [LessonClip] {
        try clipFileNames().flatMap { try decode([LessonClip].self, $0) }
    }

    static func clip(_ prefix: String) throws -> LessonClip {
        let name = try XCTUnwrap(clipFileNames().first { $0.hasPrefix("clip-\(prefix)") }, "no fixture clip-\(prefix)*")
        return try XCTUnwrap(decode([LessonClip].self, name).first)
    }
}
