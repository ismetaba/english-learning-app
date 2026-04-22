import SwiftUI

@main
struct EnglishLearningApp: App {
    @StateObject private var appState = AppState()

    init() {
        Theme.configureGlobalAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            if !appState.isLoaded {
                SplashView()
                    .transition(.opacity)
            } else if !appState.progress.onboardingCompleted {
                OnboardingView()
                    .transition(.opacity)
            } else {
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: appState.isLoaded)
        .animation(.easeInOut(duration: 0.4), value: appState.progress.onboardingCompleted)
    }
}

struct SplashView: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.Color.background, Theme.Color.backgroundElevated],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ).ignoresSafeArea()

            VStack(spacing: 24) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.primary.opacity(0.15))
                        .frame(width: 140, height: 140)
                        .scaleEffect(animate ? 1.1 : 0.9)
                    Circle()
                        .fill(Theme.Color.primary.opacity(0.25))
                        .frame(width: 100, height: 100)
                    Image(systemName: "graduationcap.fill")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(Theme.Color.primary)
                }
                Text("English Learning")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.5)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    animate = true
                }
            }
        }
    }
}
