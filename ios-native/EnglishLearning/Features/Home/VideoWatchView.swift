import SwiftUI

/// Bridges the home video feed to ClipPlayerView. Fetches the video's
/// clips (with structure + per-word starter mapping) and renders the
/// player once they land. Loading and error states match the rest of
/// the app's repo-backed views (HomeView, LessonDetailView).
struct VideoWatchView: View {
    let video: PocVideo

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = VideoWatchViewModel()

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            if vm.isLoading && vm.clips.isEmpty {
                LoadingState(label: appState.t.t("loading"))
            } else if let err = vm.errorMessage, vm.clips.isEmpty {
                ErrorState(message: err) {
                    Task { await vm.load(videoId: video.id, forceRefresh: true) }
                }
            } else {
                ClipPlayerView(
                    clips: vm.clips,
                    onFinish: { dismiss() },
                    onExit: { dismiss() }
                )
                .environmentObject(appState)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await vm.load(videoId: video.id) }
        .onAppear { appState.isVideoPlayerActive = true }
        .onDisappear { appState.isVideoPlayerActive = false }
    }
}

@MainActor
final class VideoWatchViewModel: ObservableObject {
    @Published var clips: [LessonClip] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(videoId: String, forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            self.clips = try await CurriculumRepository.shared.pocVideoClips(
                videoId: videoId,
                forceRefresh: forceRefresh,
            )
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
