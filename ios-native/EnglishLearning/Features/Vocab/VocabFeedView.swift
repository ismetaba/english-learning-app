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
    /// through the one `keepId` names when the response lands (see `load`).
    func loadIfStale(poolIds: [String], keepingThrough keepId: () -> String?) async {
        guard isStale(for: poolIds) else { return }
        await load(poolIds: poolIds, keepingThrough: keepId)
    }

    /// Fetches a fresh shuffle for `poolIds`. `keepingThrough` is asked once
    /// the response is in, for the card the learner is on *then* (they may
    /// have swiped during the fetch): the cards up to and including it stay
    /// where they are and only the ones after it are replaced. With nothing
    /// to keep, the feed starts with the word added last.
    func load(poolIds: [String], keepingThrough keepId: () -> String? = { nil },
              forceRefresh: Bool = false) async {
        // The feed is pool-only: an empty pool has no cards, and the server
        // would scan the whole corpus just to say so.
        guard !poolIds.isEmpty else {
            items = []
            loadedPool = poolIds
            errorMessage = nil
            isLoading = false
            return
        }
        // A refresh over cards on screen stays quiet; with nothing on screen
        // (a retry from the error state) the spinner shows, not the empty
        // feed's message.
        if !forceRefresh || items.isEmpty { isLoading = true }
        errorMessage = nil
        let previousPool = loadedPool
        do {
            let response = try await CurriculumRepository.shared.vocabFeed(
                poolIds: poolIds,
                includeDiscovery: false,
                limit: 80,
            )
            let keep = keepId()
            if let keep, items.contains(where: { $0.id == keep }) {
                // A word added since the last load (in a scene opened from
                // here, or on another tab) is the next card.
                let added = poolIds.last.flatMap { previousPool?.contains($0) == false ? $0 : nil }
                self.items = FeedOrder.splice(current: items, keepingThrough: keep, fresh: response.items,
                                              leadingWord: added)
            } else {
                self.items = FeedOrder.leadingWithNewest(response.items, newestWordId: poolIds.last)
            }
            self.loadedPool = poolIds
        } catch {
            // Cut short (Liste, another tab): this model outlives the feed,
            // so the load that follows must find it untouched.
            if VocabViewModel.isCancellation(error) { return }
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
    /// Held by VocabView with `visibleId` and `isMuted`, so the feed comes
    /// back from Liste as it was left.
    @ObservedObject var vm: VocabFeedViewModel
    @Binding var visibleId: String?
    /// Sound is a feed-wide choice: muting one reel keeps the next ones
    /// muted too.
    @Binding var isMuted: Bool
    /// Set by "Kelimelerimi gör"; cleared once the feed has landed on the
    /// newest word.
    @Binding var landsOnNewestWord: Bool
    @State private var openedScene: VocabContext? = nil
    /// False while a scene is pushed over the feed, so no reel plays
    /// underneath it.
    @State private var isOnScreen = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if vm.items.isEmpty && appState.progress.learnedWords.isEmpty {
                // Nothing added yet: nothing to fetch, say how to fill it.
                emptyState
            } else if vm.isLoading && vm.items.isEmpty {
                LoadingState(label: "Akış hazırlanıyor")
                    .preferredColorScheme(.dark)
            } else if let err = vm.errorMessage, vm.items.isEmpty {
                ErrorState(message: err) {
                    Task {
                        await vm.load(poolIds: appState.progress.learnedWords, forceRefresh: true)
                        landOnNewestWordIfAsked()
                    }
                }
            } else if vm.items.isEmpty {
                emptyState
            } else {
                GeometryReader { geo in
                    let visibleIndex = vm.items.firstIndex(where: { $0.id == visibleId }) ?? 0
                    ScrollViewReader { proxy in
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
                        // Back from Liste the scroll view is new: put it on the
                        // card the feed kept, not the top (the position alone
                        // may not move a scroll view that isn't laid out yet).
                        .onAppear {
                            if let visibleId { proxy.scrollTo(visibleId, anchor: .top) }
                        }
                    }
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
            // are on when the response lands (the binding reads live
            // storage, so a swipe during the fetch counts).
            await vm.loadIfStale(poolIds: appState.progress.learnedWords, keepingThrough: { visibleId })
            landOnNewestWordIfAsked()
        }
        // "Kelimelerimi gör": off any scene opened from here, back to the feed.
        .onChange(of: appState.wordsRoute) { _, _ in
            openedScene = nil
        }
        // Asked while the feed is on screen, no appearance will run the task
        // above: land now if the feed is up to date (else its reload will).
        .onChange(of: landsOnNewestWord) { _, asked in
            if asked && isOnScreen { landOnNewestWordIfAsked() }
        }
        .onChange(of: vm.items) { _, items in
            // First load (or the card we were on is gone): snap to the
            // first item so its player starts.
            if !items.contains(where: { $0.id == visibleId }), let first = items.first {
                visibleId = first.id
            }
        }
    }

    /// "Kelimelerimi gör" lands on the word just caught, not the reel the
    /// learner left. Only once the feed holds the current pool: before the
    /// reload is in, the new word has no card yet.
    private func landOnNewestWordIfAsked() {
        let pool = appState.progress.learnedWords
        guard landsOnNewestWord, !vm.isStale(for: pool) else { return }
        landsOnNewestWord = false
        guard let landing = FeedOrder.landingId(in: vm.items, from: visibleId, newestWordId: pool.last),
              landing != visibleId else { return }
        withAnimation(.easeInOut(duration: 0.35)) {
            visibleId = landing
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
            Text("Kelime ekledikçe akış dolacak")
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Text("Videoda altı çizili kelimeye dokunup Ekle'ye bastığında, o kelime burada yeni sahnelerde karşına çıkar.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 40)
            PrimaryButton(title: "Bir set aç", icon: "film", fullWidth: false) {
                openSets()
            }
            .padding(.top, 8)
        }
    }

    /// The sets live on the Video tab.
    private func openSets() {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) {
            appState.selectedTab = .home
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
    /// The learner paused this card (their intent; what the player is
    /// doing is `player.state`).
    @State private var manuallyPaused = false
    /// The centred ▶, debounced so a seek, a loop wrap or the start of
    /// playback doesn't flash it (`updatePausedCue`).
    @State private var showsPausedCue = false
    /// The centred spinner, debounced so a card that starts at once never
    /// shows one (`updateLoadingCue`).
    @State private var showsLoadingCue = false

    /// The sentence plus a beat of air on each side, so the line never
    /// feels clipped.
    private var window: PlaybackWindow { item.context.loopWindow() }

    /// Playing, or about to (buffering): a tap pauses.
    private var isPlaybackActive: Bool {
        player.state == .playing || player.state == .buffering
    }

    /// The card on screen is up but not playing, whoever stopped it (the
    /// learner, an interruption, a page rebuilt paused): a tap plays.
    private var wantsPausedCue: Bool {
        isActive && player.isReady && !isPlaybackActive && player.errorCode == nil
    }

    /// The card on screen has nothing to show yet; a tap has nothing to
    /// pause or play.
    private var isLoadingOnScreen: Bool {
        isActive && showsPoster && player.errorCode == nil && !manuallyPaused && !showsPausedCue
    }

    /// The word the learner added last (`learnedWords` is append-only).
    private var isNewestWord: Bool {
        appState.progress.learnedWords.last == item.wordId
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

            // Centre cue: ▶ while stopped, a spinner while loading, or —
            // when a ready player is slow to start — a chip saying so.
            if showsPausedCue && player.errorCode == nil {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 76, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 14)
                    .allowsHitTesting(false)
                    .accessibilityLabel("Oynat")
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            } else if isActive && player.isSlowStart && player.errorCode == nil {
                slowStartChip
                    .transition(.opacity)
            } else if showsLoadingCue && player.errorCode == nil {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .padding(14)
                    .background(Circle().fill(Color.black.opacity(0.55)))
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }

            if let code = player.errorCode {
                errorOverlay(code: code)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { togglePause() }
        .animation(.easeOut(duration: 0.15), value: showsPausedCue)
        .animation(.easeOut(duration: 0.2), value: showsLoadingCue)
        .animation(.easeOut(duration: 0.2), value: player.isSlowStart)
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
        // A page rebuilt under the card (iOS reclaimed its web process
        // while the app was away) comes back paused where it was: the card
        // on screen asks for playback again unless the learner paused it.
        // On a first load this repeats a play already asked for.
        .onChange(of: player.isReady) { _, ready in
            if ready && isActive && !manuallyPaused && player.errorCode == nil {
                player.play()
            }
        }
        // One speed for every player.
        .onChange(of: appState.playbackRate) { _, rate in
            player.setRate(rate)
            sync.setRate(rate)
        }
        .task(id: wantsPausedCue) { await updatePausedCue() }
        .task(id: isLoadingOnScreen) { await updateLoadingCue() }
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
        // The learner's speed, as in every other player.
        player.setRate(appState.playbackRate)
        sync.setRate(appState.playbackRate)
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

    /// Pauses or plays by what the player is actually doing, so the first
    /// tap always does what the screen shows. Ignored while loading.
    private func togglePause() {
        guard player.errorCode == nil, !isLoadingOnScreen else { return }
        Haptics.light()
        if isPlaybackActive {
            manuallyPaused = true
            player.pause()
        } else {
            manuallyPaused = false
            player.play()
        }
    }

    /// Shows ▶ once the card has stayed stopped for a moment; at once when
    /// the learner paused it themselves.
    private func updatePausedCue() async {
        guard wantsPausedCue else {
            if showsPausedCue { showsPausedCue = false }
            return
        }
        if !manuallyPaused {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
        }
        showsPausedCue = true
    }

    /// Shows the spinner once loading has lasted a moment.
    private func updateLoadingCue() async {
        guard isLoadingOnScreen else {
            if showsLoadingCue { showsLoadingCue = false }
            return
        }
        try? await Task.sleep(nanoseconds: 250_000_000)
        guard !Task.isCancelled else { return }
        showsLoadingCue = true
    }

    private func replay() {
        Haptics.light()
        manuallyPaused = false
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

    /// The player is up but the video hasn't started (slow network): not an
    /// error, it usually starts; the learner may move on meanwhile.
    private var slowStartChip: some View {
        HStack(spacing: 10) {
            ProgressView()
                .progressViewStyle(.circular)
                .controlSize(.small)
                .tint(.white)
            Text("Video başlıyor…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
            if let onSkip {
                Button {
                    Haptics.light()
                    onSkip()
                } label: {
                    Text("Sonraki sahne")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .background(Capsule().fill(Color.black.opacity(0.8)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
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
                    Image(systemName: isNewestWord ? "sparkles" : "bookmark.fill")
                        .font(.system(size: 9, weight: .heavy))
                    Text(isNewestWord ? "SON EKLEDİĞİN" : "KELİMEM")
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
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(item.word)
                        .font(.system(size: 38, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(-0.8)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    if let pos = partOfSpeechBadge(item.partOfSpeech) {
                        Text(pos)
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(1.4)
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    Spacer(minLength: 0)
                }
                // How to say it, in Turkish letters, when we know.
                if let reading = TurkishPhonetics.reading(for: item.word) {
                    Text(reading)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                        .accessibilityLabel("Okunuşu: \(reading)")
                }
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

    /// The Turkish gloss under each word: one fixed colour, so an upcoming
    /// word is dimmed once (by its cell), not twice.
    private static let glossColor = Color(hex: 0x9CABCC)
    /// Upcoming words stay readable before they're spoken.
    private static let upcomingOpacity = 0.72

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
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(Self.glossColor)
                    .lineLimit(1)
            }
        }
        .opacity(phase == .upcoming ? Self.upcomingOpacity : 1.0)
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
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(Self.glossColor)
                .lineLimit(1)
        }
        .opacity(phase == .upcoming ? Self.upcomingOpacity : 1.0)
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
