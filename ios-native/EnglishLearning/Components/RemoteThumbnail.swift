import SwiftUI

/// YouTube's still for a video, filling whatever frame it's given (callers
/// size and clip it). Card-coloured until it loads, or if it can't.
///
/// The still is `hqdefault.jpg` (480×360) because YouTube always generates
/// it, unlike `maxresdefault`. That frame is 4:3, so a 16:9 video comes with
/// black bars baked into its top and bottom eighth. `cropLetterbox` fills the
/// frame with the picture between them instead of the whole image: in a 16:9
/// frame that looks as before, in the narrow mosaic tiles the bars are gone.
struct RemoteThumbnail: View {
    let youtubeVideoId: String
    var cropLetterbox: Bool = true

    /// The picture inside a letterboxed still, and the still itself.
    private static let pictureAspect: CGFloat = 16.0 / 9.0
    private static let stillAspect: CGFloat = 4.0 / 3.0

    private var url: URL? {
        URL(string: "https://img.youtube.com/vi/\(youtubeVideoId)/hqdefault.jpg")
    }

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                if cropLetterbox {
                    picture(of: image)
                } else {
                    image
                        .resizable()
                        .scaledToFill()
                }
            } else {
                Theme.Color.backgroundCard
            }
        }
    }

    /// Aspect-fills the 16:9 picture (not the whole 4:3 still) into the
    /// frame; the still is sized around it, so the bars land outside the
    /// frame and are clipped.
    private func picture(of image: Image) -> some View {
        GeometryReader { geo in
            let pictureWidth = max(geo.size.width, geo.size.height * Self.pictureAspect)
            image
                .resizable()
                .frame(width: pictureWidth, height: pictureWidth / Self.stillAspect)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .clipped()
        .contentShape(Rectangle())
    }
}
