import EnglishLearning
import Foundation

// Prints the exact player HTML the app loads into its WKWebView, so the
// JS bridge can be exercised in a real browser by Tools/PlayerHarness.
// Usage: embed-html <videoId> <start> <end|none> <autoplay 0|1> [--loop] [--rate <r>] [--muted]
let usage = "usage: embed-html <videoId> <start> <end|none> <autoplay 0|1> [--loop] [--rate <r>] [--muted]\n"

func fail() -> Never {
    FileHandle.standardError.write(Data(usage.utf8))
    exit(2)
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 4, let start = Double(args[1]) else { fail() }
let end: Double?
if args[2] == "none" {
    end = nil
} else if let value = Double(args[2]) {
    end = value
} else {
    fail()
}

var loop = false
var rate = 1.0
var muted = false
var options = args.dropFirst(4).makeIterator()
while let option = options.next() {
    switch option {
    case "--loop": loop = true
    case "--muted": muted = true
    case "--rate":
        guard let value = options.next().flatMap(Double.init) else { fail() }
        rate = value
    default: fail()
    }
}

print(YouTubeEmbedHTML.make(videoId: args[0], start: start, end: end, autoplay: args[3] == "1",
                            loop: loop, rate: rate, muted: muted))
