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
    /// Tracks "the user is on this screen right now". Used by the
    /// watchdog below so the flag re-assert only runs while we're
    /// visible — onDisappear flips this back off so we don't fight
    /// the parent screen restoring the tab bar after we leave.
    @State private var isCurrentlyVisible: Bool = false

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
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.items) { item in
                                PatternReelCard(
                                    context: item,
                                    isActive: visibleId == item.id,
                                    onOpenScene: { openedScene = item },
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
        .onAppear {
            isCurrentlyVisible = true
            appState.isVideoPlayerActive = true
        }
        // Parent PatternFlowView's own onDisappear flips the flag back to
        // false when SwiftUI fires it during the forward push — that race
        // leaves the floating tab bar visible behind us. Watch the flag
        // and re-assert true while we're on screen; once we disappear
        // the guard goes off so the parent can take responsibility.
        .onChange(of: appState.isVideoPlayerActive) { _, newValue in
            if isCurrentlyVisible, !newValue {
                appState.isVideoPlayerActive = true
            }
        }
        .onDisappear {
            isCurrentlyVisible = false
            appState.isVideoPlayerActive = false
        }
        .task {
            await vm.load(patternId: patternId)
        }
        .onChange(of: vm.items) { _, items in
            if visibleId == nil, let first = items.first {
                visibleId = first.id
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

/// One full-screen scene in the pattern akış. Auto-plays the YouTube
/// clip on a tight loop around the line, overlays the pattern badge +
/// full Turkish translation + karaoke sentence (English on top of
/// Turkish gloss, color-coded by 3-color structure). TikTok-style
/// right-side stack: replay, mute, open full scene.
struct PatternReelCard: View {
    let context: VocabContext
    let isActive: Bool
    let onOpenScene: () -> Void

    @EnvironmentObject var appState: AppState
    @State private var isPlaying = false
    @State private var isMuted = false
    @State private var manuallyPaused = false
    @State private var currentTime: Double = 0
    @State private var command: YouTubePlayerView.PlayerCommand? = nil

    private let leadIn: Double = 0.4
    private let leadOut: Double = 0.6

    private var loopStart: Double { max(0, context.startTime - leadIn) }
    private var loopEnd: Double { context.endTime + leadOut }

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
                command = .seek(loopStart)
                DispatchQueue.main.async {
                    command = .play
                }
            } else {
                command = .pause
            }
        }
    }

    // MARK: Video block

    private var videoBlock: some View {
        GeometryReader { geo in
            let videoHeight = geo.size.width * 9.0 / 16.0
            ZStack {
                YouTubePlayerView(
                    videoId: context.youtubeVideoId,
                    startTime: loopStart,
                    endTime: nil,
                    autoplay: isActive,
                    isPlaying: $isPlaying,
                    currentTime: { t in
                        self.currentTime = t
                        if t >= loopEnd, !manuallyPaused {
                            command = .seek(loopStart)
                        }
                    },
                    onReady: {
                        isPlaying = isActive
                        if isMuted {
                            command = .setMuted(true)
                        }
                    },
                    command: $command,
                )
                .frame(height: videoHeight)
                .clipped()
                .allowsHitTesting(false)
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
                action: {
                    Haptics.light()
                    command = .seek(loopStart)
                    DispatchQueue.main.async {
                        command = .play
                    }
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

    // MARK: Sentence rendering

    /// Per-word stacked layout — English on top, Turkish gloss
    /// underneath, karaoke-highlighted to follow the player. Mirrors
    /// VocabReelCard.sentenceFlow but without target-word styling
    /// (pattern reels don't have a "target" word).
    private var sentenceFlow: some View {
        let subjectIdx = Set(context.structure?.subject ?? [])
        let auxIdx     = Set(context.structure?.auxVerb  ?? [])
        let cells = makeCells()

        return FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                switch cell {
                case .word(let w, let idx):
                    wordCell(word: w, index: idx,
                             subjectIdx: subjectIdx, auxIdx: auxIdx)
                case .phrase(let words, let translation, let idx):
                    phraseCell(words: words, translation: translation,
                               firstIndex: idx,
                               subjectIdx: subjectIdx, auxIdx: auxIdx)
                case .splitContraction(let subjEn, let subjTr, let auxEn, let auxTr,
                                       let start, let end):
                    contractionHalfCell(en: subjEn, tr: subjTr,
                                        start: start, end: end,
                                        kind: .subject)
                    contractionHalfCell(en: auxEn, tr: auxTr,
                                        start: start, end: end,
                                        kind: .aux)
                }
            }
        }
        .animation(.easeInOut(duration: 0.22), value: currentTime)
    }

    private enum SentenceCell {
        case word(ClipWord, Int)
        case phrase([ClipWord], String, Int)
        /// A subject+aux contraction ("I'm", "you're", "he's", ...)
        /// expanded into two render units that share the same audio
        /// timestamp so they karaoke together but render with the
        /// classic two-color split (subject blue + aux green).
        case splitContraction(
            subjectEn: String, subjectTr: String,
            auxEn: String, auxTr: String,
            startTime: Double, endTime: Double,
        )
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

    private func makeCells() -> [SentenceCell] {
        let words = context.words
        let phraseSpans = context.phrases ?? []

        var byStart: [Int: PhraseSpan] = [:]
        var coveredIndices: Set<Int> = []
        for p in phraseSpans {
            byStart[p.startIndex] = p
            for idx in p.startIndex...p.endIndex { coveredIndices.insert(idx) }
        }

        var out: [SentenceCell] = []
        for (i, w) in words.enumerated() {
            let idx = w.wordIndex ?? i
            if let span = byStart[idx] {
                let group = words.filter {
                    ($0.wordIndex ?? -1) >= span.startIndex
                        && ($0.wordIndex ?? -1) <= span.endIndex
                }
                out.append(.phrase(group, span.translationTr, idx))
            } else if coveredIndices.contains(idx) {
                continue
            } else if let split = Self.contractionSplits[Self.cleaned(w.word)] {
                out.append(.splitContraction(
                    subjectEn: split.subjEn, subjectTr: split.subjTr,
                    auxEn: split.auxEn, auxTr: split.auxTr,
                    startTime: w.startTime, endTime: w.endTime,
                ))
            } else {
                out.append(.word(w, idx))
            }
        }
        return out
    }

    @ViewBuilder
    private func wordCell(
        word w: ClipWord,
        index idx: Int,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        let isActive = currentTime >= w.startTime && currentTime < w.endTime
        let isUpcoming = currentTime < w.startTime

        let baseColor: Color = {
            if subjectIdx.contains(idx) { return Color(hex: 0x5BA3DD) }
            if auxIdx.contains(idx)     { return Color(hex: 0x6BC084) }
            return Color(hex: 0xB093D2)
        }()
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let scale: CGFloat   = isActive ? 1.14 : 1.0
        let opacity: Double  = isUpcoming ? 0.55 : 1.0

        VStack(alignment: .center, spacing: 2) {
            Text(w.word)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(textColor)
                // Capture the natural width BEFORE applying the visual
                // scale — otherwise the active cell's 1.14x reports a
                // wider frame, the FlowLayout snaps to that, and the
                // unscaled cell next to it can end up "tired..." style
                // truncated.
                .fixedSize(horizontal: true, vertical: false)
                .scaleEffect(scale)

            if let okunus = TurkishPhonetics.reading(for: w.word) {
                Text(okunus)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .italic()
                    .foregroundStyle(.white.opacity(isUpcoming ? 0.55 : 0.75))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }

            if let tr = w.translationTr, !tr.isEmpty, tr != "-" {
                Text(tr)
                    .font(.system(size: 12, weight: .medium))
                    .italic()
                    .foregroundStyle(Color(hex: 0x9CABCC).opacity(isUpcoming ? 0.55 : 0.85))
                    .multilineTextAlignment(.center)
                    // Force one line at natural width — same shape as
                    // the English/okunuş rows so the VStack reports a
                    // consistent unscaled cell width to FlowLayout.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
        .opacity(opacity)
    }

    /// One half of a split subject+aux contraction. Both halves share
    /// the original word's start/end time, so karaoke highlights them
    /// in lock-step — they're spoken as a single audible unit.
    private enum ContractionHalfKind { case subject, aux }

    @ViewBuilder
    private func contractionHalfCell(
        en: String, tr: String,
        start: Double, end: Double,
        kind: ContractionHalfKind,
    ) -> some View {
        let isActive = currentTime >= start && currentTime < end
        let isUpcoming = currentTime < start

        let baseColor: Color = (kind == .subject)
            ? Color(hex: 0x5BA3DD)   // subject blue
            : Color(hex: 0x6BC084)   // aux green
        let textColor: Color = isActive ? Theme.Color.accent : baseColor
        let scale: CGFloat   = isActive ? 1.14 : 1.0
        let opacity: Double  = isUpcoming ? 0.55 : 1.0

        VStack(alignment: .center, spacing: 2) {
            Text(en)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(textColor)
                .fixedSize(horizontal: true, vertical: false)
                .scaleEffect(scale)

            if let okunus = TurkishPhonetics.reading(for: en) {
                Text(okunus)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .italic()
                    .foregroundStyle(.white.opacity(isUpcoming ? 0.55 : 0.75))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }

            Text(tr)
                .font(.system(size: 12, weight: .medium))
                .italic()
                .foregroundStyle(Color(hex: 0x9CABCC).opacity(isUpcoming ? 0.55 : 0.85))
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .opacity(opacity)
    }

    @ViewBuilder
    private func phraseCell(
        words ws: [ClipWord],
        translation tr: String,
        firstIndex idx: Int,
        subjectIdx: Set<Int>,
        auxIdx: Set<Int>,
    ) -> some View {
        if let first = ws.first, let last = ws.last {
            let isActive   = currentTime >= first.startTime && currentTime < last.endTime
            let isUpcoming = currentTime < first.startTime

            let baseColor: Color = {
                if subjectIdx.contains(idx) { return Color(hex: 0x5BA3DD) }
                if auxIdx.contains(idx)     { return Color(hex: 0x6BC084) }
                return Color(hex: 0xB093D2)
            }()
            let textColor: Color = isActive ? Theme.Color.accent : baseColor
            let scale: CGFloat   = isActive ? 1.14 : 1.0
            let opacity: Double  = isUpcoming ? 0.55 : 1.0

            let joined = ws.map(\.word).joined(separator: " ")

            VStack(alignment: .center, spacing: 2) {
                Text(joined)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(textColor)
                    .fixedSize(horizontal: true, vertical: false)
                    .scaleEffect(scale)

                Text(tr)
                    .font(.system(size: 12, weight: .medium))
                    .italic()
                    .foregroundStyle(Color(hex: 0x9CABCC).opacity(isUpcoming ? 0.55 : 0.85))
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .opacity(opacity)
        }
    }
}
