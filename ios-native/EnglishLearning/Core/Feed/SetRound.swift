import Foundation

/// Where the learner is in a set. A pattern set is watched in rounds: a
/// scene watched to its end, in this set or another, isn't played again
/// until every scene of the set is watched; then starting the set starts it
/// over and its scenes count as unwatched in it. A speed set plays its
/// videos straight through and counts every video watched anywhere.
struct SetRound {
    let set: VideoSet
    /// The set's videos watched in this round.
    let watched: Set<String>

    init(set: VideoSet, progress: UserProgress) {
        self.set = set
        let ids = set.videos.map(\.id)
        if let start = progress.setRoundStarts[set.id] {
            watched = Set(ids.filter { (progress.videoWatchNumbers[$0] ?? 0) > start })
        } else {
            watched = Set(ids).intersection(progress.watchedVideos)
        }
    }

    private var inRounds: Bool { self.set.patternId != nil }

    var watchedCount: Int { watched.count }

    func isWatched(_ videoId: String) -> Bool { watched.contains(videoId) }

    var isComplete: Bool { !self.set.videos.isEmpty && watched.count == self.set.videos.count }

    /// Starting the set now starts it over.
    var startsOver: Bool { inRounds && isComplete }

    /// The first video not watched yet: where the set picks up.
    var nextUnwatched: Int? { self.set.videos.firstIndex { !watched.contains($0.id) } }

    /// The video played after the one at `index`: the next one, or in a
    /// pattern set the next one not watched in this round.
    func next(after index: Int) -> Int? {
        let rest = self.set.videos.indices.filter { $0 > index }
        return inRounds ? rest.first { !watched.contains(self.set.videos[$0].id) } : rest.first
    }
}

extension UserProgress {
    /// Records that the learner watched a `PocVideo` to its end.
    mutating func recordVideoWatched(_ videoId: String) {
        if !watchedVideos.contains(videoId) { watchedVideos.append(videoId) }
        videoWatchCount += 1
        videoWatchNumbers[videoId] = videoWatchCount
    }

    /// Starts a set over: what was watched until now no longer counts in it.
    mutating func startNewRound(of setId: String) {
        setRoundStarts[setId] = videoWatchCount
    }
}
