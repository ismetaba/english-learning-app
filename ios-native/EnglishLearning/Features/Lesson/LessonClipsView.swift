import SwiftUI

@MainActor
final class LessonClipsViewModel: ObservableObject {
    @Published var clips: [LessonClip] = []
    @Published var page: Int = 1
    @Published var totalPages: Int = 1
    @Published var isLoading = true
    @Published var isLoadingMore = false
    @Published var errorMessage: String? = nil

    func loadInitial(lessonId: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let res = try await APIClient.shared.fetchLessonClipsPaginated(
                lessonId: lessonId, page: 1, perPage: 10
            )
            self.clips = res.clips
            self.page = res.page
            self.totalPages = res.totalPages
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func loadMore(lessonId: String) async {
        guard page < totalPages, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let nextPage = page + 1
            let res = try await APIClient.shared.fetchLessonClipsPaginated(
                lessonId: lessonId, page: nextPage, perPage: 10,
                exclude: clips.map { String($0.id) }
            )
            self.clips.append(contentsOf: res.clips)
            self.page = res.page
            self.totalPages = res.totalPages
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoadingMore = false
    }
}

struct LessonClipsView: View {
    @EnvironmentObject var appState: AppState
    let lesson: CurriculumLesson

    @StateObject private var vm = LessonClipsViewModel()
    @State private var playerStartIndex: Int? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if vm.isLoading && vm.clips.isEmpty {
                LoadingState(label: appState.t.t("loading"))
            } else if let err = vm.errorMessage, vm.clips.isEmpty {
                ErrorState(message: err) { Task { await vm.loadInitial(lessonId: lesson.id) } }
            } else if vm.clips.isEmpty {
                EmptyState(icon: "film.stack", title: "No clips yet",
                           subtitle: "Clips will appear here as they're added.")
            } else {
                content
            }
        }
        .navigationTitle(lesson.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .task { await vm.loadInitial(lessonId: lesson.id) }
        .fullScreenCover(item: Binding(
            get: { playerStartIndex.map { StartIndex(value: $0) } },
            set: { playerStartIndex = $0?.value }
        )) { startIndex in
            ClipPlayerView(
                clips: Array(vm.clips[startIndex.value...]),
                onClipComplete: { clip in
                    appState.markClipWatched("\(lesson.id):\(clip.id)")
                    appState.addXP(XPReward.perScene)
                    appState.updateMastery(lessonId: lesson.id) { m in
                        m.watchClipsCompleted += 1
                        if m.watchClipsCompleted >= 5 {
                            m.subProgress.watchCompleted = true
                        }
                    }
                },
                onFinish: {
                    playerStartIndex = nil
                }
            )
            .environmentObject(appState)
        }
    }

    private struct StartIndex: Identifiable {
        let value: Int
        var id: Int { value }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                headline
                VStack(spacing: 10) {
                    ForEach(Array(vm.clips.enumerated()), id: \.element.id) { idx, clip in
                        Button {
                            Haptics.medium()
                            playerStartIndex = idx
                        } label: {
                            ClipListRow(clip: clip, index: idx)
                        }
                        .buttonStyle(.pressable(scale: 0.98))
                    }
                    if vm.page < vm.totalPages {
                        Button {
                            Task { await vm.loadMore(lessonId: lesson.id) }
                        } label: {
                            HStack {
                                if vm.isLoadingMore { ProgressView().tint(Theme.Color.primary) }
                                Text(vm.isLoadingMore ? "Loading…" : "Load more clips")
                                    .font(Theme.Font.headline(14, weight: .bold))
                                    .foregroundStyle(Theme.Color.primary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                                    .strokeBorder(Theme.Color.borderAccent, lineWidth: 1.5)
                            )
                        }
                        .disabled(vm.isLoadingMore)
                        .buttonStyle(.pressable)
                        .padding(.top, 4)
                    }
                }
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(vm.clips.count) clips available")
                .font(Theme.Font.caption(12, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.6)
            Text("Pick a clip")
                .font(Theme.Font.display(28))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Tap any clip to start watching and learning.")
                .font(Theme.Font.body(13))
                .foregroundStyle(Theme.Color.textSecondary)
        }
    }
}

struct ClipListRow: View {
    let clip: LessonClip
    let index: Int

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(LinearGradient(
                        colors: [Theme.Color.primary.opacity(0.3), Theme.Color.accent.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                Image(systemName: "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(String(format: "%d:%02d", Int(clip.duration) / 60, Int(clip.duration) % 60))
                            .font(Theme.Font.mono(10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.black.opacity(0.6), in: Capsule())
                    }
                    .padding(5)
                }
            }
            .frame(width: 72, height: 54)
            VStack(alignment: .leading, spacing: 4) {
                Text(clip.movieTitle)
                    .font(Theme.Font.caption(11, weight: .bold))
                    .foregroundStyle(Theme.Color.textMuted)
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .lineLimit(1)
                if let target = clip.lines.first(where: { $0.isTarget == true }) ?? clip.lines.first {
                    Text("\"\(target.text)\"")
                        .font(Theme.Font.body(14, weight: .medium))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Text("#\(index + 1)")
                .font(Theme.Font.mono(12, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}

// MARK: - LessonWatchView — launches the clip player for a given lesson

struct LessonWatchView: View {
    @EnvironmentObject var appState: AppState
    let lesson: LessonDetail

    @State private var clips: [LessonClip] = []
    @State private var isLoading = true
    @State private var errorMessage: String? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if isLoading {
                LoadingState(label: "Fetching clips…")
            } else if let err = errorMessage {
                ErrorState(message: err) { Task { await load() } }
            } else if clips.isEmpty {
                EmptyState(icon: "film.stack", title: "No clips yet")
            } else {
                ClipPlayerView(
                    clips: clips,
                    onClipComplete: { clip in
                        appState.markClipWatched("\(lesson.id):\(clip.id)")
                        appState.addXP(XPReward.perScene)
                    },
                    onFinish: {
                        appState.updateSubProgress(lessonId: lesson.id) { $0.watchCompleted = true }
                        appState.addXP(XPReward.perLesson / 3)
                    }
                )
                .environmentObject(appState)
            }
        }
        .navigationBarBackButtonHidden(true)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            self.clips = try await CurriculumRepository.shared.clips(lessonId: lesson.id)
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
