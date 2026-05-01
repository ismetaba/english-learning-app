import SwiftUI

// MARK: - View model

@MainActor
final class VocabFeedViewModel: ObservableObject {
    @Published var items: [VocabFeedItem] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(poolIds: [String], forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            let response = try await CurriculumRepository.shared.vocabFeed(
                poolIds: poolIds,
                includeDiscovery: true,
                limit: 80,
            )
            self.items = response.items
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Feed (vertical paging)

/// "Word Reels" — anti-flashcard, anti-fatigue vocab learning. The
/// user just swipes vertically through self-playing scenes; each
/// card is one starter word in one sentence in one movie clip.
/// Repeated, varied exposure is the path; the screen never tests or
/// scores. Smart shuffle on the server keeps the same word from
/// landing two cards in a row.
struct VocabFeedView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = VocabFeedViewModel()
    @State private var visibleId: String? = nil
    @State private var openedScene: VocabContext? = nil

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if vm.isLoading && vm.items.isEmpty {
                LoadingState(label: "Akış hazırlanıyor")
                    .preferredColorScheme(.dark)
            } else if let err = vm.errorMessage, vm.items.isEmpty {
                ErrorState(message: err) {
                    Task { await vm.load(poolIds: appState.progress.learnedWords, forceRefresh: true) }
                }
            } else if vm.items.isEmpty {
                emptyState
            } else {
                GeometryReader { geo in
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.items) { item in
                                VocabReelCard(
                                    item: item,
                                    isActive: visibleId == item.id,
                                    onTapAdd: { handleAdd(item) },
                                    onOpenScene: { openedScene = item.context },
                                )
                                .frame(width: geo.size.width, height: geo.size.height)
                                .id(item.id)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollTargetBehavior(.paging)
                    .scrollPosition(id: $visibleId)
                }
                .ignoresSafeArea()
            }
        }
        .preferredColorScheme(.dark)
        .navigationDestination(item: $openedScene) { ctx in
            VocabContextPlayerView(context: ctx)
                .environmentObject(appState)
        }
        .task(id: appState.progress.learnedWords) {
            // Re-pull whenever the user's pool composition changes
            // (an "Ekle" tap from inside the feed updates this) so the
            // priority weights stay current.
            await vm.load(poolIds: appState.progress.learnedWords)
        }
        .onChange(of: vm.items) { _, items in
            // First load: snap to first item so the player auto-plays.
            if visibleId == nil, let first = items.first {
                visibleId = first.id
            }
        }
    }

    private func handleAdd(_ item: VocabFeedItem) {
        Haptics.success()
        appState.markVocabLearned(item.wordId)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 36, weight: .heavy))
                .foregroundStyle(Theme.Color.accent)
            Text("Bir set izleyince akış dolacak")
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
            Text("Kelime tıklayıp Ekle'ye basınca buradaki sahnelerde tekrar karşına gelir.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 40)
        }
    }
}

// MARK: - Reel card

/// One full-screen card in the Word Reels feed. Auto-plays the source
/// clip on a tight loop around the line, overlays the word + TR +
/// structure-colored sentence, and offers a TikTok-style right-side
/// action stack (add, replay, sound, open full).
struct VocabReelCard: View {
    let item: VocabFeedItem
    let isActive: Bool
    let onTapAdd: () -> Void
    let onOpenScene: () -> Void

    @EnvironmentObject var appState: AppState
    @State private var isPlaying = false
    @State private var isMuted = false
    @State private var manuallyPaused = false
    @State private var currentTime: Double = 0
    @State private var command: YouTubePlayerView.PlayerCommand? = nil

    /// Padding around the line so the user catches a beat of context
    /// before the line fires. Keeps the card from feeling too clipped.
    private let leadIn: Double = 0.4
    private let leadOut: Double = 0.6

    private var loopStart: Double {
        max(0, item.context.startTime - leadIn)
    }
    private var loopEnd: Double {
        item.context.endTime + leadOut
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Video — letterboxed by the black background. We size
            // it 16:9 against the screen width for a cinematic frame
            // that leaves room for overlays at top/bottom.
            videoBlock

            // Pull a soft gradient over the very top and bottom so
            // the white text stays legible against busy frames.
            VStack {
                LinearGradient(
                    colors: [.black.opacity(0.55), .clear],
                    startPoint: .top, endPoint: .bottom,
                )
                .frame(height: 180)
                Spacer()
                LinearGradient(
                    colors: [.clear, .black.opacity(0.85)],
                    startPoint: .top, endPoint: .bottom,
                )
                .frame(height: 360)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)

            // Top overlay: progress / context-of-many badge
            VStack {
                topMeta
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 56)

            // Bottom overlay: word + sentence + meta
            VStack {
                Spacer()
                bottomBlock
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 100)
            .padding(.trailing, 76) // keep clear of right action stack

            // Right-side TikTok-style stack
            HStack {
                Spacer()
                actionStack
            }
            .padding(.trailing, 14)
            .padding(.bottom, 110)

            // Pause indicator overlay (center)
            if manuallyPaused {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 76, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 14)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            Haptics.light()
            withAnimation(.easeOut(duration: 0.15)) {
                manuallyPaused.toggle()
            }
            command = manuallyPaused ? .pause : .play
        }
        .onChange(of: isActive) { _, nowActive in
            if nowActive {
                manuallyPaused = false
                // The lazy mount might have started invisibly — kick
                // it into the right state when the card becomes
                // visible.
                command = .seek(loopStart)
                command = .play
            } else {
                command = .pause
            }
        }
    }

    // MARK: - Video block

    private var videoBlock: some View {
        GeometryReader { geo in
            let videoHeight = geo.size.width * 9.0 / 16.0
            // Center the video vertically; the gradients at top/bottom
            // let it bleed into the letterbox area.
            ZStack {
                YouTubePlayerView(
                    videoId: item.context.youtubeVideoId,
                    startTime: loopStart,
                    endTime: nil,
                    autoplay: isActive,
                    isPlaying: $isPlaying,
                    currentTime: { t in
                        self.currentTime = t
                        // Manual loop — the JS layer doesn't trim to
                        // a sub-clip when `endTime: nil`, so we send
                        // a seek back to start every time we cross
                        // the chosen tail.
                        if t >= loopEnd, !manuallyPaused {
                            command = .seek(loopStart)
                        }
                    },
                    onReady: {
                        isPlaying = isActive
                        // Mute baseline — default OFF (sound on) per
                        // user preference, but apply current mute
                        // state on every fresh mount to honor the
                        // toggle across cards.
                        if isMuted {
                            command = .setMuted(true)
                        }
                    },
                    command: $command,
                )
                .frame(height: videoHeight)
                .clipped()
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    // MARK: - Top meta

    private var topMeta: some View {
        HStack(spacing: 12) {
            Text(item.context.movieTitle.uppercased())
                .font(.system(size: 11, weight: .heavy))
                .tracking(1.6)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
            if item.isInPool {
                HStack(spacing: 4) {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 9, weight: .heavy))
                    Text("KELİMEM")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.4)
                }
                .foregroundStyle(.black)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Theme.Color.accent))
            } else {
                Text("KEŞFET")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.2), lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Bottom block

    private var bottomBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(item.word)
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .tracking(-0.8)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let pos = item.partOfSpeech {
                    Text(pos.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(.white.opacity(0.6))
                }
                Spacer(minLength: 0)
            }

            if let tr = item.translationTr, !tr.isEmpty {
                Text(tr)
                    .font(.system(size: 18, weight: .semibold))
                    .italic()
                    .foregroundStyle(Color(hex: 0xE0B07A))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            // Sentence — colored by structure, target word emphasized.
            Text(structureAttributed())
                .font(.system(size: 15, weight: .semibold))
                .lineSpacing(3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)

            HStack(spacing: 8) {
                MasteryDots(
                    filled: item.wordContextCount,
                    total: StarterWordSummary.masteryThreshold,
                )
                Text("\(min(item.wordContextCount, StarterWordSummary.masteryThreshold)) / \(StarterWordSummary.masteryThreshold) bağlam")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1)
                    .foregroundStyle(.white.opacity(0.6))
            }
            .padding(.top, 2)
        }
    }

    // MARK: - Right side action stack

    private var actionStack: some View {
        VStack(spacing: 22) {
            actionButton(
                icon: alreadyAdded ? "heart.fill" : "heart",
                label: alreadyAdded ? "Eklendi" : "Ekle",
                tint: alreadyAdded ? Color(hex: 0xFF6B8A) : .white,
                action: {
                    guard !alreadyAdded else { return }
                    onTapAdd()
                },
            )
            actionButton(
                icon: "arrow.counterclockwise",
                label: "Tekrar",
                tint: .white,
                action: {
                    Haptics.light()
                    command = .seek(loopStart)
                    command = .play
                    if manuallyPaused {
                        manuallyPaused = false
                    }
                },
            )
            actionButton(
                icon: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                label: isMuted ? "Sessiz" : "Ses",
                tint: .white,
                action: {
                    Haptics.selection()
                    isMuted.toggle()
                    command = .setMuted(isMuted)
                },
            )
            actionButton(
                icon: "rectangle.expand.vertical",
                label: "Sahne",
                tint: .white,
                action: {
                    Haptics.medium()
                    onOpenScene()
                },
            )
        }
    }

    private func actionButton(
        icon: String,
        label: String,
        tint: Color,
        action: @escaping () -> Void,
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(tint)
                    .shadow(color: .black.opacity(0.6), radius: 8)
                Text(label)
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.7), radius: 6)
            }
            .frame(width: 54)
        }
        .buttonStyle(.pressable(scale: 0.92))
    }

    private var alreadyAdded: Bool {
        appState.progress.learnedWords.contains(item.wordId)
    }

    // MARK: - Sentence rendering

    /// Builds the colored AttributedString — same triadic palette as
    /// the rest of the app (subject sky / verb sage / rest lavender),
    /// with the target starter word painted in white + heavy weight +
    /// underlined so the eye lands on it first.
    private func structureAttributed() -> AttributedString {
        let subjectIdx = Set(item.context.structure?.subject ?? [])
        let auxIdx     = Set(item.context.structure?.auxVerb  ?? [])

        var out = AttributedString()
        for (i, w) in item.context.words.enumerated() {
            let idx = w.wordIndex ?? i
            let baseColor: Color
            if subjectIdx.contains(idx) {
                baseColor = Color(hex: 0x5BA3DD)
            } else if auxIdx.contains(idx) {
                baseColor = Color(hex: 0x6BC084)
            } else {
                baseColor = Color(hex: 0xB093D2)
            }

            var chunk = AttributedString(w.word)
            if w.starterId == item.wordId {
                chunk.font = .system(size: 16, weight: .heavy)
                chunk.foregroundColor = .white
                chunk.underlineStyle = .single
            } else {
                chunk.foregroundColor = baseColor
            }
            out.append(chunk)
            if i < item.context.words.count - 1 {
                out.append(AttributedString(" "))
            }
        }
        return out
    }
}
