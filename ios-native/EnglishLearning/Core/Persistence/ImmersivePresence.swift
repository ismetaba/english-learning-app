import Foundation

/// Which full-screen video surfaces are on screen; the tab bar hides while
/// any is.
///
/// Each surface registers its own token instead of flipping one shared Bool:
/// SwiftUI does not order the old screen's `onDisappear` after the new
/// screen's `onAppear`, so with a Bool pushing player-over-player could
/// leave the flag false while a video was still showing.
struct ImmersivePresence: Equatable {
    private var tokens: Set<UUID> = []

    var isActive: Bool { !tokens.isEmpty }

    init() {}

    mutating func enter(_ token: UUID) { tokens.insert(token) }

    mutating func exit(_ token: UUID) { tokens.remove(token) }
}
