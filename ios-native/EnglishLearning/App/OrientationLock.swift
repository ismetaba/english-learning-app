import UIKit
import SwiftUI

/// App-wide orientation gate. SwiftUI doesn't expose per-screen
/// orientation control, so we route everything through one global
/// mask: views that need landscape (Cinema mode) push the mask, and
/// the AppDelegate's `supportedInterfaceOrientationsFor` reads it.
///
/// Calling `set(_:)` updates the mask AND nudges the live scene to
/// honor the new constraints immediately, so a cinema view can
/// rotate the device without the user manually turning the phone.
final class OrientationLock {
    static let shared = OrientationLock()

    private(set) var mask: UIInterfaceOrientationMask = .portrait

    func set(_ mask: UIInterfaceOrientationMask) {
        self.mask = mask
        // Tell the system we'd like to honor this immediately. Requires
        // the requested orientation to be in Info.plist's allowed set.
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
        }
        // Push the topmost VC so it re-asks supportedInterfaceOrientations.
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .forEach { $0.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations() }
    }
}

/// Bridges the AppDelegate's orientation question into our
/// OrientationLock. SwiftUI plumbs to it via @UIApplicationDelegateAdaptor.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?,
    ) -> UIInterfaceOrientationMask {
        OrientationLock.shared.mask
    }
}

/// Tiny SwiftUI helper: applies a landscape lock for the lifetime
/// of the view, restores portrait on disappear. Used by Cinema mode.
struct LandscapeLock: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onAppear {
                OrientationLock.shared.set(.landscape)
            }
            .onDisappear {
                OrientationLock.shared.set(.portrait)
            }
    }
}

extension View {
    /// Hold the device in landscape while this view is on screen.
    /// Restored to portrait when the view is removed.
    func lockToLandscape() -> some View {
        modifier(LandscapeLock())
    }
}
