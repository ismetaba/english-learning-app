import SwiftUI

// MARK: - View model

@MainActor
final class PatternReelsViewModel: ObservableObject {
    @Published var items: [VocabContext] = []
    @Published var label: String = ""
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(patternId: String, limit: Int = 100, forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            let response = try await CurriculumRepository.shared.patternScenes(
                patternId: patternId,
                limit: limit,
            )
            self.items = response.items
            self.label = response.label
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// First load only. The server reshuffles on every request, so a
    /// reload while the learner is in the feed would swap the reels out
    /// from under them.
    func loadIfEmpty(patternId: String) async {
        guard items.isEmpty else { return }
        await load(patternId: patternId)
    }
}

// MARK: - Feed (vertical paging) ------------------------------------------

/// Pattern Reels — vertical akış of movie scenes that all open with
/// the same pattern (e.g. "I am ..."). Mirrors Word Reels: auto-play,
/// karaoke flow, color-coded structure, Turkish gloss. The cards aren't
/// tied to a single starter word so the chrome is leaner — no Add
/// button, no mastery dots, just pattern label + full sentence Turkish
/// + the karaoke sentence.
struct PatternReelsView: View {
    let patternId: String
    let title: String

    @EnvironmentObject var appState: AppState
    @StateObject private var vm = PatternReelsViewModel()
    @State private var visibleId: Int? = nil
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
                    Task { await vm.load(patternId: patternId, forceRefresh: true) }
                }
            } else if vm.items.isEmpty {
                emptyState
            } else {
                GeometryReader { geo in
                    let visibleIndex = vm.items.firstIndex(where: { $0.id == visibleId }) ?? 0
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(vm.items.enumerated()), id: \.element.id) { index, item in
                                PatternReelCard(
                                    context: item,
                                    isActive: isOnScreen && visibleId == item.id,
                                    isNear: abs(index - visibleIndex) <= 1,
                                    isMuted: $isMuted,
                                    onOpenScene: { openedScene = item },
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

            // Header chrome — title pill above the cards
            VStack {
                topBar
                    .padding(.horizontal, 16)
                    .padding(.top, 56)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
        .navigationBarHidden(true)
        .navigationDestination(item: $openedScene) { ctx in
            VocabContextPlayerView(context: ctx)
                .environmentObject(appState)
        }
        .hidesTabBarWhileVisible()
        .onAppear { isOnScreen = true }
        .onDisappear { isOnScreen = false }
        .task {
            // Runs again when the learner comes back from a scene; only
            // the first appearance loads.
            await vm.loadIfEmpty(patternId: patternId)
        }
        .onChange(of: vm.items) { _, items in
            // First load (or the card we were on is gone): snap to the
            // first item so its player starts.
            if !items.contains(where: { $0.id == visibleId }), let first = items.first {
                visibleId = first.id
            }
        }
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

    // MARK: - Top bar

    @Environment(\.dismiss) private var dismiss

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                Haptics.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.12), in: Circle())
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.2), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            VStack(alignment: .leading, spacing: 1) {
                Text("AKIŞ · KALIP")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.6))
                Text(title)
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }

            Spacer()

            if !vm.items.isEmpty {
                Text("\(vm.items.count) sahne")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.25), lineWidth: 1))
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "film.stack")
                .font(.system(size: 36, weight: .heavy))
                .foregroundStyle(Theme.Color.accent)
            Text("Bu kalıp için sahne yok")
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
            Text("Yakında film sahneleri eklenecek.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 40)
        }
    }
}

// MARK: - Reel card -------------------------------------------------------

/// One full-screen scene in the pattern akış. Loops the sentence in its
/// YouTube clip (the player page wraps the window itself), overlays the
/// pattern badge + full Turkish translation + karaoke sentence (English
/// on top of Turkish gloss, color-coded by 3-color structure).
/// TikTok-style right-side stack: replay, mute, open full scene.
struct PatternReelCard: View {
    let context: VocabContext
    /// The card on screen while the feed is visible: the one that plays.
    let isActive: Bool
    /// The visible card or one of its neighbours. Only these hold a live
    /// player; the others show the video's thumbnail.
    let isNear: Bool
    /// Feed-wide sound preference.
    @Binding var isMuted: Bool
    let onOpenScene: () -> Void
    /// Scrolls the feed to the next card; nil on the last one.
    let onSkip: (() -> Void)?

    @EnvironmentObject var appState: AppState
    @StateObject private var player = YouTubePlayerController()
    @StateObject private var sync = KaraokeSync()
    @State private var manuallyPaused = false

    /// The sentence plus a beat of air on each side.
    private var window: PlaybackWindow { context.loopWindow() }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            videoBlock

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

            // Top overlay sits below the parent's top bar — needs ~160pt
            // clearance so the movie-title chip lands under the back
            // button + "AKIŞ · KALIP" header instead of overprinting it.
            VStack {
                topMeta
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 160)

            VStack {
                Spacer()
                bottomBlock
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 140)
            .padding(.trailing, 76)

            HStack {
                Spacer()
                actionStack
            }
            .padding(.trailing, 14)
            .padding(.bottom, 150)

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

    // MARK: Playback

    private func source(autoplay: Bool) -> PlayerSource {
        PlayerSource(videoId: context.youtubeVideoId, start: window.start, end: window.end,
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
        sync.setLines([context.syncLine])
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

    // MARK: Video block

    /// The live player has nothing to show yet (loading, or cued and never
    /// played), so its thumbnail covers YouTube's own cue screen.
    private var showsPoster: Bool {
        !player.isReady || player.state == .unstarted || player.state == .cued
    }

    private var videoBlock: some View {
        GeometryReader { geo in
            let videoHeight = geo.size.width * 9.0 / 16.0
            ZStack {
                if isNear {
                    YouTubePlayerView(controller: player)
                        .overlay {
                            if showsPoster {
                                ReelThumbnail(youtubeVideoId: context.youtubeVideoId)
                                    .transition(.opacity)
                            }
                        }
                        .animation(.easeOut(duration: 0.2), value: showsPoster)
                        .frame(height: videoHeight)
                        .clipped()
                        .allowsHitTesting(false)
                } else {
                    // Far from the visible card: no web view (memory),
                    // just the still.
                    ReelThumbnail(youtubeVideoId: context.youtubeVideoId)
                        .frame(width: geo.size.width, height: videoHeight)
                        .clipped()
                        .allowsHitTesting(false)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    // MARK: Top meta

    /// Just the movie title — the parent screen's top bar already
    /// shows the pattern label, so a per-card kalıp badge would be
    /// redundant and was visually fighting the header.
    private var topMeta: some View {
        HStack(spacing: 12) {
            Text(context.movieTitle.uppercased())
                .font(.system(size: 11, weight: .heavy))
                .tracking(1.6)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)

            Spacer(minLength: 0)
        }
    }

    // MARK: Bottom block

    private var bottomBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let tr = context.translationTr, !tr.isEmpty {
                Text(tr)
                    .font(.system(size: 19, weight: .semibold))
                    .italic()
                    .foregroundStyle(Color(hex: 0xE0B07A))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }

            sentenceFlow
        }
    }

    // MARK: Right side action stack

    private var actionStack: some View {
        VStack(spacing: 22) {
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

    // MARK: Sentence rendering

    /// Per-word stacked layout — English on top, okunuş and Turkish gloss
    /// underneath, karaoke-highlighted by `sync`. Mirrors
    /// VocabReelCard.sentenceFlow but without target-word styling
    /// (pattern reels don't have a "target" word).
    private var sentenceFlow: some View {
        // Sanitized like the karaoke's line, so cell indices are the
        // positions `SyncPosition` reports.
        let words = context.syncLine.words
        let cells = SentenceCells.build(words: words, phrases: context.phrases)
        let position = sync.position

        return FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                switch cell {
                case .word(let i):
                    if let split = Self.contractionSplits[Self.cleaned(words[i].word)] {
                        // Two render units, one spoken word: both halves
                        // share its karaoke phase.
                        contractionHalfCell(en: split.subjEn, tr: split.subjTr,
                                            phase: position.phase(ofWord: i, inLine: 0),
                                            kind: .subject)
                        contractionHalfCell(en: split.auxEn, tr: split.auxTr,
                                            phase: position.phase(ofWord: i, inLine: 0),
                                            kind: .aux)
                    } else {
                        wordCell(words[i],
                                 structureColor: structureColor(of: words[i], at: i),
                                 phase: position.phase(ofWord: i, inLine: 0))
                    }
                case .phrase(let range, let translationTr):
                    phraseCell(Array(words[range]),
                               translation: translationTr,
                               structureColor: structureColor(of: words[range.lowerBound], at: range.lowerBound),
                               phase: position.phase(ofWords: range, inLine: 0))
                }
            }
        }
        .animation(.easeInOut(duration: 0.15), value: position)
    }

    /// Subject blue / verb green / rest lavender. Structure tags use the
    /// server's word index; the array position stands in when a word
    /// has none.
    private func structureColor(of word: ClipWord, at position: Int) -> Color {
        let index = word.wordIndex ?? position
        if context.structure?.subject.contains(index) == true { return Color(hex: 0x5BA3DD) }
        if context.structure?.auxVerb.contains(index) == true { return Color(hex: 0x6BC084) }
        return Color(hex: 0xB093D2)
    }

    /// Subject+aux contractions get visually split so the user sees
    /// the pronoun in subject blue and the BE form in aux green —
    /// matching the layout of full forms ("you are happy" alongside
    /// "you're happy"). Mapping covers the contractions our tagger
    /// recognizes; Turkish glosses use the same parenthetical-suffix
    /// convention as the static PatternExamples.
    private static let contractionSplits: [String: (subjEn: String, subjTr: String,
                                                    auxEn: String, auxTr: String)] = [
        "i'm":     (subjEn: "I",    subjTr: "ben",     auxEn: "am",  auxTr: "(-im)"),
        "you're":  (subjEn: "You",  subjTr: "sen",     auxEn: "are", auxTr: "(-sın)"),
        "he's":    (subjEn: "He",   subjTr: "o",       auxEn: "is",  auxTr: "(-dır)"),
        "she's":   (subjEn: "She",  subjTr: "o",       auxEn: "is",  auxTr: "(-dır)"),
        "it's":    (subjEn: "It",   subjTr: "o",       auxEn: "is",  auxTr: "(-dır)"),
        "we're":   (subjEn: "We",   subjTr: "biz",     auxEn: "are", auxTr: "(-ız)"),
        "they're": (subjEn: "They", subjTr: "onlar",   auxEn: "are", auxTr: "(-lar)"),
        "that's":  (subjEn: "That", subjTr: "şu / bu", auxEn: "is",  auxTr: "(-dır)"),
        "there's": (subjEn: "There",subjTr: "(orada)", auxEn: "is",  auxTr: "var"),
    ]

    private static func cleaned(_ s: String) -> String {
        let trim = CharacterSet(charactersIn: ".,!?;:\"")
        return s.trimmingCharacters(in: trim).lowercased()
    }

    private func wordCell(_ w: ClipWord, structureColor: Color, phase: WordPhase) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(w.word)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(phase == .active ? Theme.Color.accent : structureColor)
                // Capture the natural width BEFORE applying the visual
                // scale — otherwise the active cell's 1.14x reports a
                // wider frame, the FlowLayout snaps to that, and the
                // unscaled cell next to it can end up "tired..." style
                // truncated.
                .fixedSize(horizontal: true, vertical: false)
                .scaleEffect(phase == .active ? 1.14 : 1.0)

            if let okunus = TurkishPhonetics.reading(for: w.word) {
                Text(okunus)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .italic()
                    .foregroundStyle(.white.opacity(phase == .upcoming ? 0.55 : 0.75))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }

            if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 12, weight: .medium))
                    .italic()
                    .foregroundStyle(Color(hex: 0x9CABCC).opacity(phase == .upcoming ? 0.55 : 0.85))
                    .multilineTextAlignment(.center)
                    // Force one line at natural width — same shape as
                    // the English/okunuş rows so the VStack reports a
                    // consistent unscaled cell width to FlowLayout.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
        .opacity(phase == .upcoming ? 0.55 : 1.0)
    }

    /// One half of a split subject+aux contraction. Both halves take
    /// the original word's karaoke phase, so they highlight in
    /// lock-step — they're spoken as a single audible unit.
    private enum ContractionHalfKind { case subject, aux }

    @ViewBuilder
    private func contractionHalfCell(
        en: String, tr: String,
        phase: WordPhase,
        kind: ContractionHalfKind
    ) -> some View {
        let baseColor: Color = (kind == .subject)
            ? Color(hex: 0x5BA3DD)   // subject blue
            : Color(hex: 0x6BC084)   // aux green

        VStack(alignment: .center, spacing: 2) {
            Text(en)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(phase == .active ? Theme.Color.accent : baseColor)
                .fixedSize(horizontal: true, vertical: false)
                .scaleEffect(phase == .active ? 1.14 : 1.0)

            if let okunus = TurkishPhonetics.reading(for: en) {
                Text(okunus)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .italic()
                    .foregroundStyle(.white.opacity(phase == .upcoming ? 0.55 : 0.75))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }

            Text(tr)
                .font(.system(size: 12, weight: .medium))
                .italic()
                .foregroundStyle(Color(hex: 0x9CABCC).opacity(phase == .upcoming ? 0.55 : 0.85))
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .opacity(phase == .upcoming ? 0.55 : 1.0)
    }

    /// A phrasal verb as one cell: joined English words, one shared
    /// Turkish gloss. Active while any of its words is being spoken.
    private func phraseCell(
        _ ws: [ClipWord],
        translation tr: String,
        structureColor: Color,
        phase: WordPhase
    ) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(ws.map(\.word).joined(separator: " "))
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(phase == .active ? Theme.Color.accent : structureColor)
                .fixedSize(horizontal: true, vertical: false)
                .scaleEffect(phase == .active ? 1.14 : 1.0)

            Text(tr)
                .font(.system(size: 12, weight: .medium))
                .italic()
                .foregroundStyle(Color(hex: 0x9CABCC).opacity(phase == .upcoming ? 0.55 : 0.85))
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .opacity(phase == .upcoming ? 0.55 : 1.0)
    }
}
