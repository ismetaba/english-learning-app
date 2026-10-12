import SwiftUI
import AVFoundation

@main
struct EnglishLearningApp: App {
    @StateObject private var appState = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        Theme.configureGlobalAppearance()
        // The YouTube players are web views, which play through the app's
        // audio session: as `.playback` they stay audible with the silent
        // switch on. Not activated here — the session goes active when a
        // video starts, so opening the app doesn't stop the learner's music.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
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

    #if DEBUG
    /// Debug entry point — launching with `-StartInClipPlayer YES` boots straight
    /// into ClipPlayerView with live data. Used for design iteration on simulator.
    private var startsInClipPlayer: Bool {
        ProcessInfo.processInfo.arguments.contains("-StartInClipPlayer") ||
            ProcessInfo.processInfo.environment["START_IN_CLIP_PLAYER"] == "1"
    }

    private var debugClipPlayer: some View { DebugClipPlayerLauncher() }
    #else
    private var startsInClipPlayer: Bool { false }

    private var debugClipPlayer: some View { EmptyView() }
    #endif

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            if startsInClipPlayer {
                debugClipPlayer
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
        // The UI is Turkish only now; a device that picked another flag in
        // the old onboarding or profile picker is switched back.
        .onAppear {
            if appState.nativeLanguage != .tr { appState.nativeLanguage = .tr }
        }
    }
}

#if DEBUG
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
                let all = try await APIClient.shared.fetchLessonClips(lessonId: "lesson-01-greetings")
                // Prefer a clip with plenty of lines AND a late target, so the
                // full-height transcript scroll is visible for design review
                // before the target pause fires.
                let good = all.first { clip in
                    guard clip.lines.count >= 10,
                          let tgt = clip.lines.first(where: { $0.isTarget == true })
                    else { return false }
                    return (tgt.endTime - clip.startTime) >= 15
                }
                clips = good.map { [$0] } ?? all
            } catch {
                failure = "Failed to load clips: \(error.localizedDescription)"
            }
        }
    }
}
#endif

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
