import Foundation

/// What a Spanish learner has opened along the pattern path: they learn a
/// pattern on Kalıplar, then watch the scenes that use it (its set), and
/// its words join theirs. `path` is the pattern ids in path order.
struct PatternUnlocks {
    let path: [String]
    let completed: Set<String>

    /// Video and Kelimeler open once a pattern of the path is done.
    var isOpen: Bool { path.contains(where: completed.contains) }

    /// The first pattern of the path not done yet.
    var next: String? { path.first { !completed.contains($0) } }

    /// The speed-ordered sets ("Serbest izleme") open when the path is done.
    var freeWatchOpen: Bool { path.allSatisfy(completed.contains) }

    /// The sets of the patterns done, in path order.
    func openSets(_ sets: [VideoSet]) -> [VideoSet] {
        path.filter(completed.contains).compactMap { id in sets.first { $0.patternId == id } }
    }

    /// The words the patterns done bring, in path order, each once.
    func words(of sets: [VideoSet]) -> [String] {
        var seen = Set<String>()
        return openSets(sets).flatMap { $0.words ?? [] }.filter { seen.insert($0).inserted }
    }
}
