// swift-tools-version:5.9
//
// Linux/macOS test harness for the app's platform-independent core.
//
// The iOS app itself is built from `project.yml` (XcodeGen) — this package
// is NOT how the app ships. It compiles only the Foundation-only parts of
// `EnglishLearning/` (models, sync engine, player protocol, networking
// helpers) as a library named `EnglishLearning`, so the exact same test
// files under `EnglishLearningTests/Core` run both here (`swift test`, no
// Xcode needed) and inside the Xcode test target (`@testable import
// EnglishLearning` resolves to the app module there).
//
// Rule of thumb: anything under `EnglishLearning/Core` must import only
// Foundation. UI code lives in Features/Components/DesignSystem.
import PackageDescription

let package = Package(
    name: "EnglishLearningCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    targets: [
        .target(
            name: "EnglishLearning",
            path: "EnglishLearning",
            exclude: [
                "App", "Components", "DesignSystem", "Features", "Resources", "State",
                "Models/Pattern.swift", "Services/Localization.swift",
            ],
            sources: [
                "Core",
                "Models/Curriculum.swift",
                "Models/PocVideo.swift",
                "Models/Progress.swift",
                "Models/TurkishPhonetics.swift",
                "Models/VideoSet.swift",
                "Models/Vocab.swift",
                "Models/VocabContext.swift",
                "Services/APIClient.swift",
                "Services/CacheService.swift",
                "Services/SpacedRepetition.swift",
            ]
        ),
        .executableTarget(
            name: "embed-html",
            dependencies: ["EnglishLearning"],
            path: "Tools/EmbedHTML"
        ),
        .testTarget(
            name: "EnglishLearningCoreTests",
            dependencies: ["EnglishLearning"],
            path: "EnglishLearningTests/Core",
            exclude: ["Fixtures"]
        ),
    ]
)
