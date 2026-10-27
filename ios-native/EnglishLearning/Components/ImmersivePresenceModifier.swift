import SwiftUI

extension View {
    /// Hides the floating tab bar while this view is on screen.
    ///
    /// Each use registers its own token with `AppState`, so when one video
    /// screen is pushed over another the bar stays hidden until the last one
    /// disappears, whatever order SwiftUI delivers the old screen's
    /// `onDisappear` and the new screen's `onAppear` in.
    func hidesTabBarWhileVisible() -> some View {
        modifier(HidesTabBarWhileVisible())
    }
}

private struct HidesTabBarWhileVisible: ViewModifier {
    @EnvironmentObject private var appState: AppState
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { appState.enterImmersive(token) }
            .onDisappear { appState.exitImmersive(token) }
    }
}
