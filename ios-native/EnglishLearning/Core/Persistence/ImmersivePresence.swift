import Foundation

// STUB — API contract only. Implementation pending (see ImmersivePresenceTests).

/// Which full-screen video surfaces are on screen; the tab bar hides while
/// any is.
struct ImmersivePresence: Equatable {
    private(set) var isActive = false

    init() {}

    mutating func enter(_ token: UUID) { isActive = true }

    mutating func exit(_ token: UUID) { isActive = false }
}
