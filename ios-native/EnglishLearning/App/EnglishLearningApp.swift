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

    /// Debug entry point — launching with `-StartInClipPlayer YES` boots straight
    /// into ClipPlayerView with live data. Used for design iteration on simulator.
    private var startsInClipPlayer: Bool {
        ProcessInfo.processInfo.arguments.contains("-StartInClipPlayer") ||
            ProcessInfo.processInfo.environment["START_IN_CLIP_PLAYER"] == "1"
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            if startsInClipPlayer {
                DebugClipPlayerLauncher()
            } else if !appState.isLoaded {
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

/// Fetches the first lesson's clips and jumps straight into ClipPlayerView.
/// Only reachable via launch argument; not wired into normal navigation.
private struct DebugClipPlayerLauncher: View {
    @State private var clips: [LessonClip] = []
    @State private var failure: String? = nil

    var body: some View {
        Group {
            if let failure = failure {
                Text(failure).foregroundStyle(.red).padding()
            } else if clips.isEmpty {
                ProgressView().tint(Theme.Color.primary)
            } else {
                ClipPlayerView(clips: clips)
            }
        }
        .task {
            do {
                clips = try await APIClient.shared.fetchLessonClips(lessonId: "lesson-01-greetings")
            } catch {
                failure = "Failed to load clips: \(error.localizedDescription)"
            }
        }
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
