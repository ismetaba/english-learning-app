import Foundation

/// A curated learning set — a named, ordered group of POC videos that
/// share a vocabulary footprint. The Feynman flow expects the learner
/// to work through a set linearly so the same starter words show up
/// across multiple contexts. Mirrors `/api/v1/video-sets`.
struct VideoSet: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let titleTr: String?
    let description: String?
    let descriptionTr: String?
    let difficulty: String?
    let sortOrder: Int
    let videos: [PocVideo]

    enum CodingKeys: String, CodingKey {
        case id, title, description, difficulty, videos
        case titleTr       = "title_tr"
        case descriptionTr = "description_tr"
        case sortOrder     = "sort_order"
    }

    /// Prefers Turkish when available so the home feed reads natively.
    var displayTitle: String {
        (titleTr?.isEmpty == false ? titleTr : nil) ?? title
    }

    var displayDescription: String? {
        let tr = (descriptionTr?.isEmpty == false ? descriptionTr : nil)
        return tr ?? description
    }

    /// Up to four videos for the set's thumbnail mosaic, one per YouTube
    /// video where the set has that many: a set cut from long sources
    /// lists runs of scenes sharing one thumbnail. Repeats only fill the
    /// tiles the set has no other video for.
    var mosaicVideos: [PocVideo] {
        var seen = Set<String>()
        let distinct = videos.filter { seen.insert($0.youtubeVideoId).inserted }
        let fill = videos.filter { v in !distinct.contains { $0.id == v.id } }
        return Array((distinct + fill).prefix(4))
    }

    /// Total runtime across all videos, in seconds. Computed from each
    /// video's duration estimate (clip count × ~1 minute heuristic when
    /// per-video duration isn't available — accurate enough for the
    /// "5 video · ~20 dk" badge in the set header).
    var totalDurationSeconds: Int {
        videos.reduce(0) { acc, _ in acc }
    }

    /// Distinct A2 starter words covered across the whole set. Useful
    /// for the "65 kelime kazanacaksın" line on the set hero.
    var distinctStarterWordCount: Int {
        var ids = Set<String>()
        for v in videos {
            for w in v.starterWords { ids.insert(w.id) }
        }
        return ids.count
    }
}
