import SwiftUI

// MARK: - View model

@MainActor
final class VocabFeedViewModel: ObservableObject {
    @Published var items: [VocabFeedItem] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil
    /// The pool `items` were fetched for; nil until a load succeeds.
    private(set) var loadedPool: [String]? = nil

    /// The feed was never loaded, or the learner's pool changed since.
    func isStale(for poolIds: [String]) -> Bool {
        loadedPool != poolIds
    }

    /// Loads only when the feed is stale for `poolIds`, keeping the cards
    /// through `keepId` in place (see `load`).
    func loadIfStale(poolIds: [String], keepingThrough keepId: String?) async {
        guard isStale(for: poolIds) else { return }
        await load(poolIds: poolIds, keepingThrough: keepId)
    }

    /// Fetches a fresh shuffle for `poolIds`. With `keepingThrough`, the
    /// cards up to and including that one stay where they are (the
    /// learner is on it) and only the cards after it are replaced.
    func load(poolIds: [String], keepingThrough keepId: String? = nil, forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            let response = try await CurriculumRepository.shared.vocabFeed(
                poolIds: poolIds,
                includeDiscovery: false,
                limit: 80,
            )
            self.items = Self.splice(current: items, keepingThrough: keepId, fresh: response.items)
            self.loadedPool = poolIds
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// `current` up to and including the card `keepId`, then the `fresh`
    /// cards it doesn't already hold; just `fresh` when there's nothing
    /// to keep.
    static func splice(current: [VocabFeedItem], keepingThrough keepId: String?,
                       fresh: [VocabFeedItem]) -> [VocabFeedItem] {
        guard let keepId, let lastKept = current.firstIndex(where: { $0.id == keepId }) else { return fresh }
        let kept = Array(current[...lastKept])
        let keptIds = Set(kept.map(\.id))
        var upcoming = fresh.filter { !keptIds.contains($0.id) }
        // The server never deals the same word twice in a row; keep that
        // true across the seam.
        let currentWord = current[lastKept].wordId
        if upcoming.first?.wordId == currentWord,
           let other = upcoming.firstIndex(where: { $0.wordId != currentWord }) {
            let moved = upcoming.remove(at: other)
            upcoming.insert(moved, at: 0)
        }
        return kept + upcoming
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
    /// Sound is a feed-wide choice: muting one reel keeps the next ones
    /// muted too.
    @State private var isMuted = false
    /// False while a scene is pushed over the feed, so no reel plays
    /// underneath it.
    @State private var isOnScreen = false

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
                    let visibleIndex = vm.items.firstIndex(where: { $0.id == visibleId }) ?? 0
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(vm.items.enumerated()), id: \.element.id) { index, item in
                                VocabReelCard(
                                    item: item,
                                    isActive: isOnScreen && visibleId == item.id,
                                    isNear: abs(index - visibleIndex) <= 1,
                                    isMuted: $isMuted,
                                    onTapAdd: { handleAdd(item) },
                                    onOpenScene: { openedScene = item.context },
                                    onSkip: skipAction(after: index)
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
        .onAppear { isOnScreen = true }
        .onDisappear { isOnScreen = false }
        .task {
            // Runs on every appearance: the first one, and coming back
            // from a scene. An "Ekle" tap inside the feed changes the pool
            // while the learner is still here; reloading right then would
            // reshuffle the feed under them, so a changed pool is picked
            // up the next time the screen appears, keeping the card they
            // were on.
            await vm.loadIfStale(poolIds: appState.progress.learnedWords, keepingThrough: visibleId)
        }
        .onChange(of: vm.items) { _, items in
            // First load (or the card we were on is gone): snap to the
            // first item so its player starts.
            if !items.contains(where: { $0.id == visibleId }), let first = items.first {
                visibleId = first.id
            }
        }
    }

    private func handleAdd(_ item: VocabFeedItem) {
        Haptics.success()
        appState.markVocabLearned(item.wordId)
    }

    /// Scrolls to the card after `index`; nil on the last card.
    private func skipAction(after index: Int) -> (() -> Void)? {
        guard vm.items.indices.contains(index + 1) else { return nil }
        let nextId = vm.items[index + 1].id
        return {
            withAnimation(.easeInOut(duration: 0.35)) {
                visibleId = nextId
            }
        }
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

/// One full-screen card in the Word Reels feed. Loops the sentence in
/// its source clip (the player page wraps the window itself), overlays
/// the word + TR + structure-colored karaoke sentence, and offers a
/// TikTok-style right-side action stack (add, replay, sound, open full).
struct VocabReelCard: View {
    let item: VocabFeedItem
    /// The card on screen while the feed is visible: the one that plays.
    let isActive: Bool
    /// The visible card or one of its neighbours. Only these hold a live
    /// player; the others show the video's thumbnail.
    let isNear: Bool
    /// Feed-wide sound preference.
    @Binding var isMuted: Bool
    let onTapAdd: () -> Void
    let onOpenScene: () -> Void
    /// Scrolls the feed to the next card; nil on the last one.
    let onSkip: (() -> Void)?

    @EnvironmentObject var appState: AppState
    @StateObject private var player = YouTubePlayerController()
    @StateObject private var sync = KaraokeSync()
    @State private var manuallyPaused = false

    /// The sentence plus a beat of air on each side, so the line never
    /// feels clipped.
    private var window: PlaybackWindow { item.context.loopWindow() }

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
            // The MainTabView's FloatingTabBar covers roughly the
            // bottom 122pt (78pt bar + 10pt padding + ~34pt safe-area).
            // Lift content above it so the sentence + meta stay
            // readable instead of getting clipped behind the bar.
            .padding(.bottom, 140)
            .padding(.trailing, 76) // keep clear of right action stack

            // Right-side TikTok-style stack
            HStack {
                Spacer()
                actionStack
            }
            .padding(.trailing, 14)
            .padding(.bottom, 150)

            // Pause indicator overlay (center)
            if manuallyPaused && player.errorCode == nil {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 76, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 14)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }

            if let code = player.errorCode {
                errorOverlay(code: code)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { togglePause() }
        .onAppear { start() }
        .onChange(of: isActive) { _, nowActive in
            if nowActive {
                activate()
            } else {
                player.pause()
            }
        }
        .onChange(of: isNear) { _, nowNear in
            if !nowNear { park() }
        }
    }

    // MARK: - Playback

    private func source(autoplay: Bool) -> PlayerSource {
        PlayerSource(videoId: item.context.youtubeVideoId, start: window.start, end: window.end,
                     autoplay: autoplay, loop: true)
    }

    /// First appearance: wire the karaoke to the player and load the
    /// loop, playing only if this is the card on screen. The controller
    /// queues it until the player view's page can take it.
    private func start() {
        guard player.source == nil else { return }
        let sync = self.sync
        player.onEvent = { [weak sync] event, hostTime in
            sync?.handle(event, hostTime: hostTime)
        }
        sync.setLines([item.context.syncLine])
        player.setMuted(isMuted)
        player.load(source(autoplay: isActive))
    }

    /// The card became the one on screen: play the sentence from the top
    /// with the feed's current sound setting.
    private func activate() {
        start()
        manuallyPaused = false
        player.setMuted(isMuted)
        player.seek(to: window.start)
        player.play()
        sync.jump(to: window.start)
    }

    /// The card moved out of the visible card's neighbourhood and its
    /// player view is gone. Whatever page it gets when it comes back must
    /// start paused rather than autoplay off screen.
    private func park() {
        guard player.source != nil else { return }
        player.load(source(autoplay: false))
    }

    private func togglePause() {
        guard player.errorCode == nil else { return }
        Haptics.light()
        let pause = !manuallyPaused
        withAnimation(.easeOut(duration: 0.15)) {
            manuallyPaused = pause
        }
        if pause {
            player.pause()
        } else {
            player.play()
        }
    }

    private func replay() {
        Haptics.light()
        if manuallyPaused {
            withAnimation(.easeOut(duration: 0.15)) {
                manuallyPaused = false
            }
        }
        player.seek(to: window.start)
        player.play()
        sync.jump(to: window.start)
    }

    private func toggleMute() {
        Haptics.selection()
        let muted = !isMuted
        isMuted = muted
        player.setMuted(muted)
    }

    /// Reloads the clip after an error. The page reloads it the way it
    /// was first loaded (paused, for a card that started as a
    /// neighbour), so the card on screen asks for playback again.
    private func retry() {
        player.retry()
        if isActive {
            manuallyPaused = false
            player.play()
        }
    }

    private func errorOverlay(code: Int) -> some View {
        PlayerErrorOverlay(
            message: YouTubeError.message(forCode: code),
            onRetry: { retry() },
            onSkip: onSkip,
            skipLabel: "Sonraki sahne",
            autoSkipAfter: isActive ? 4 : nil
        )
        .ignoresSafeArea()
        // The overlay starts its countdown when it appears: rebuild it
        // when the card becomes, or stops being, the one on screen.
        .id(isActive)
    }

    // MARK: - Video block

    /// The live player has nothing to show yet (loading, or cued and never
    /// played), so its thumbnail covers YouTube's own cue screen.
    private var showsPoster: Bool {
        !player.isReady || player.state == .unstarted || player.state == .cued
    }

    private var videoBlock: some View {
        GeometryReader { geo in
            let videoHeight = geo.size.width * 9.0 / 16.0
            // Center the video vertically; the gradients at top/bottom
            // let it bleed into the letterbox area.
            ZStack {
                if isNear {
                    YouTubePlayerView(controller: player)
                        .overlay {
                            if showsPoster {
                                ReelThumbnail(youtubeVideoId: item.context.youtubeVideoId)
                                    .transition(.opacity)
                            }
                        }
                        .animation(.easeOut(duration: 0.2), value: showsPoster)
                        .frame(height: videoHeight)
                        .clipped()
                        // The WKWebView under YouTubePlayerView captures all
                        // touches inside its bounds, which previously ate the
                        // tap-to-pause gesture on the video frame. Disabling
                        // hit-testing routes those taps back to SwiftUI so the
                        // outer .onTapGesture can fire over the video too.
                        .allowsHitTesting(false)
                } else {
                    // Far from the visible card: no web view (memory),
                    // just the still.
                    ReelThumbnail(youtubeVideoId: item.context.youtubeVideoId)
                        .frame(width: geo.size.width, height: videoHeight)
                        .clipped()
                        .allowsHitTesting(false)
                }
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
                if let pos = partOfSpeechTr(item.partOfSpeech) {
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

            // Sentence — each word stacks its English form over its
            // Turkish gloss, matching the cinema player's layout. The
            // target starter word is white + heavy + underlined so the
            // eye lands on it first; the rest follow the structure
            // colors (subject sky / verb sage / rest lavender).
            sentenceFlow
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
                action: { replay() }
            )
            actionButton(
                icon: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                label: isMuted ? "Sessiz" : "Ses",
                tint: .white,
                action: { toggleMute() }
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

    /// Per-word stacked layout — English form on top, Turkish gloss
    /// underneath, with karaoke highlighting driven by `sync`: the word
    /// being spoken lights up in accent + scales up subtly, upcoming
    /// words dim. Mirrors CinemaKaraokeLine so the reels card feels like
    /// the same player just framed differently. Phrasal verbs from
    /// `context.phrases` collapse into a single merged cell with one
    /// shared Turkish translation instead of translating each word in
    /// isolation.
    private var sentenceFlow: some View {
        // Sanitized like the karaoke's line, so cell indices are the
        // positions `SyncPosition` reports.
        let words = item.context.syncLine.words
        let cells = SentenceCells.build(words: words, phrases: item.context.phrases)
        let position = sync.position

        return FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                switch cell {
                case .word(let i):
                    wordCell(
                        words[i],
                        structureColor: structureColor(of: words[i], at: i),
                        phase: position.phase(ofWord: i, inLine: 0)
                    )
                case .phrase(let range, let translationTr):
                    phraseCell(
                        Array(words[range]),
                        translation: translationTr,
                        structureColor: structureColor(of: words[range.lowerBound], at: range.lowerBound),
                        phase: position.phase(ofWords: range, inLine: 0)
                    )
                }
            }
        }
        .animation(.easeInOut(duration: 0.15), value: position)
    }

    /// Subject sky / verb sage / rest lavender. Structure tags use the
    /// server's word index; the array position stands in when a word
    /// has none.
    private func structureColor(of word: ClipWord, at position: Int) -> Color {
        let index = word.wordIndex ?? position
        if item.context.structure?.subject.contains(index) == true { return Color(hex: 0x5BA3DD) }
        if item.context.structure?.auxVerb.contains(index) == true { return Color(hex: 0x6BC084) }
        return Color(hex: 0xB093D2)
    }

    @ViewBuilder
    private func wordCell(_ w: ClipWord, structureColor: Color, phase: WordPhase) -> some View {
        let isTarget = (w.starterId == item.wordId)
        let baseColor: Color = isTarget ? .white : structureColor

        VStack(alignment: .center, spacing: 2) {
            Text(w.word)
                .font(.system(size: isTarget ? 19 : 17, weight: isTarget ? .heavy : .semibold))
                .foregroundStyle(phase == .active ? Theme.Color.accent : baseColor)
                .underline(isTarget)
                .scaleEffect(phase == .active ? 1.14 : 1.0)

            if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 12, weight: .medium))
                    .italic()
                    .foregroundStyle(Color(hex: 0x9CABCC).opacity(phase == .upcoming ? 0.55 : 0.85))
                    .lineLimit(1)
            }
        }
        .opacity(phase == .upcoming ? 0.55 : 1.0)
    }

    /// Render a phrasal verb as one cell — joined English words on top
    /// (so they read as a unit, not two adjacent towers), single shared
    /// Turkish gloss underneath. It is active while any of its words is
    /// being spoken and upcoming until the first one starts.
    @ViewBuilder
    private func phraseCell(
        _ ws: [ClipWord],
        translation tr: String,
        structureColor: Color,
        phase: WordPhase
    ) -> some View {
        let containsTarget = ws.contains(where: { $0.starterId == item.wordId })
        let baseColor: Color = containsTarget ? .white : structureColor
        let joined = ws.map(\.word).joined(separator: " ")

        VStack(alignment: .center, spacing: 2) {
            Text(joined)
                .font(.system(size: containsTarget ? 19 : 17, weight: containsTarget ? .heavy : .semibold))
                .foregroundStyle(phase == .active ? Theme.Color.accent : baseColor)
                .underline(containsTarget)
                .scaleEffect(phase == .active ? 1.14 : 1.0)

            Text(tr)
                .font(.system(size: 12, weight: .medium))
                .italic()
                .foregroundStyle(Color(hex: 0x9CABCC).opacity(phase == .upcoming ? 0.55 : 0.85))
                .lineLimit(1)
        }
        .opacity(phase == .upcoming ? 0.55 : 1.0)
    }
}

// MARK: - Thumbnail

/// A reel's still: YouTube's thumbnail for the video, filling the frame
/// it's given (callers crop it to the player's 16:9), black until it
/// loads or if it can't. Stands in for the live player on cards away
/// from the visible one, and covers the player until it has a frame.
struct ReelThumbnail: View {
    let youtubeVideoId: String

    var body: some View {
        AsyncImage(url: URL(string: "https://img.youtube.com/vi/\(youtubeVideoId)/hqdefault.jpg")) { phase in
            if let image = phase.image {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                Color.black
            }
        }
    }
}
