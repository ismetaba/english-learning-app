import EnglishLearning
import Foundation

// Prints the exact player HTML the app loads into its WKWebView, so the
// JS bridge can be exercised in a real browser by Tools/PlayerHarness.
// Usage: embed-html <videoId> <start> <end|none> <autoplay 0|1>
let args = CommandLine.arguments
guard args.count == 5, let start = Double(args[2]) else {
    FileHandle.standardError.write("usage: embed-html <videoId> <start> <end|none> <autoplay 0|1>\n".data(using: .utf8)!)
    exit(2)
}
let end = args[3] == "none" ? nil : Double(args[3])
print(YouTubeEmbedHTML.make(videoId: args[1], start: start, end: end, autoplay: args[4] == "1"))
