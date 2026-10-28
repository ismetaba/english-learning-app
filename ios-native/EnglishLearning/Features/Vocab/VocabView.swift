import SwiftUI

// MARK: - View model

@MainActor
final class VocabViewModel: ObservableObject {
    @Published var summaries: [StarterWordSummary] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    /// Refetches summaries for the user's current `learnedWords`. New
    /// words appear at the top because the API preserves request order
    /// and we hand it `learnedWords` reversed (most-recent first).
    func load(learnedWords: [String], forceRefresh: Bool = false) async {
        // Nothing added yet: nothing to ask the server about.
        guard !learnedWords.isEmpty else {
            summaries = []
            errorMessage = nil
            isLoading = false
            return
        }
        if !forceRefresh || summaries.isEmpty { isLoading = true }
        errorMessage = nil
        do {
            let recentFirst = Array(learnedWords.reversed())
            self.summaries = try await CurriculumRepository.shared.starterWordSummaries(
                ids: recentFirst,
                forceRefresh: forceRefresh,
            )
        } catch {
            // Cut short by a tab switch or a newer load (the pool changed):
            // nothing failed, and the load that follows owns the screen.
            if Self.isCancellation(error) { return }
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// A load cancelled, as Swift or URLSession says it (APIClient hands
    /// URLSession's back wrapped in `.transport`).
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if case APIError.transport(let underlying) = error { return isCancellation(underlying) }
        return APIError.urlErrorCode(error) == .cancelled
    }
}

// MARK: - Mode

/// Stored by raw value (`vocab.mode`), so the cases keep their names.
private enum VocabMode: String, Hashable, CaseIterable {
    case feed, list

    var label: String {
        switch self {
        case .feed: return "Akış"
        case .list: return "Liste"
        }
    }

    var icon: String {
        switch self {
        case .feed: return "play.rectangle.on.rectangle.fill"
        case .list: return "rectangle.grid.2x2.fill"
        }
    }
}

// MARK: - Main view

struct VocabView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = VocabViewModel()
    /// Akış or Liste, as the learner last left it.
    @AppStorage("vocab.mode") private var mode: VocabMode = .feed
    @State private var selectedWord: StarterWordSummary? = nil
    /// The feed's state lives here, not in VocabFeedView: Liste removes the
    /// feed (and its players), and Akış again must find the same card,
    /// already loaded, with the sound as the learner left it.
    @StateObject private var feed = VocabFeedViewModel()
    @State private var feedVisibleId: String? = nil
    @State private var feedIsMuted = false
    /// "Kelimelerimi gör" asked for the newest word; the feed lands on it
    /// once it holds the current pool.
    @State private var feedLandsOnNewestWord = false

    var body: some View {
        NavigationStack {
            ZStack {
                if isGated {
                    PatternGateView(kind: .words)
                } else if mode == .feed {
                    VocabFeedView(vm: feed, visibleId: $feedVisibleId, isMuted: $feedIsMuted,
                                  landsOnNewestWord: $feedLandsOnNewestWord)
                        .environmentObject(appState)
                        .ignoresSafeArea()
                } else {
                    BackgroundAmbience()
                    listContent
                }

                // Floating mode switch — sits above whichever layer
                // is showing so the user can flip without leaving.
                if !isGated { VStack {
                    HStack {
                        Spacer(minLength: 0)
                        modeSwitch
                            .padding(.trailing, 16)
                    }
                    .padding(.top, 16)
                    Spacer()
                } }
            }
            .navigationDestination(item: $selectedWord) { word in
                VocabWordDetailView(summary: word)
                    .environmentObject(appState)
            }
        }
        .task(id: appState.learnedWordsInLearning) {
            await vm.load(learnedWords: appState.learnedWordsInLearning)
        }
        // The words of the patterns done join the learner's words.
        .task(id: appState.completedPatterns) { await appState.syncPatternWords() }
        // "Kelimelerimi gör" from another tab: back to the root (an old word
        // may still be pushed) and, in Akış, onto the word caught last.
        // Liste needs no more: it's newest first.
        // A word of the other language left open when the learner switches.
        .onChange(of: appState.learningLanguage) { _, _ in selectedWord = nil }
        .onChange(of: appState.wordsRoute) { _, _ in
            selectedWord = nil
            if mode == .feed { feedLandsOnNewestWord = true }
        }
    }

    /// Spanish waits for the first pattern (`PatternGateView`).
    private var isGated: Bool {
        appState.followsPatternPath && !appState.patternUnlocks.isOpen
    }

    private var modeSwitch: some View {
        HStack(spacing: 4) {
            ForEach(VocabMode.allCases, id: \.self) { m in
                Button {
                    Haptics.selection()
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                        mode = m
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: m.icon)
                            .font(.system(size: 11, weight: .heavy))
                        Text(m.label)
                            .font(.system(size: 11, weight: .heavy))
                            .tracking(0.4)
                    }
                    .foregroundStyle(mode == m ? .black : .white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .frame(minHeight: 36)
                    .background(
                        Capsule().fill(mode == m ? Theme.Color.accent : .clear),
                    )
                    // The whole segment takes the tap, not just its glyphs;
                    // with the pill's padding the control is 44pt tall.
                    .contentShape(Capsule())
                }
                .buttonStyle(.pressable(scale: 0.94))
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(.black.opacity(0.55)),
        )
        .overlay(
            Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1),
        )
        .shadow(color: .black.opacity(0.4), radius: 12, y: 4)
    }

    private var listContent: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 24) {
                hero
                    .padding(.horizontal, 20)
                    .padding(.top, 56)

                if appState.learnedWordsInLearning.isEmpty {
                    emptyState
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                } else if vm.isLoading && vm.summaries.isEmpty {
                    LoadingState(label: "Kelimeler yükleniyor")
                        .padding(.top, 64)
                } else if let err = vm.errorMessage, vm.summaries.isEmpty {
                    ErrorState(message: err) {
                        Task { await vm.load(learnedWords: appState.learnedWordsInLearning, forceRefresh: true) }
                    }
                    .padding(.top, 64)
                } else {
                    grid
                        .padding(.horizontal, 20)
                }

                Spacer().frame(height: 140)
            }
        }
        .refreshable {
            await vm.load(learnedWords: appState.learnedWordsInLearning, forceRefresh: true)
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("KELİME HAZNEM")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(2)
                .foregroundStyle(Theme.Color.accent)

            Text("Eklediğin kelimeler")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)

            // Only what the learner did: the words they added. Corpus counts
            // say nothing about their progress, so none are shown as such.
            statColumn(value: "\(appState.learnedWordsInLearning.count)", label: "KELİME")
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// `label` is written in capitals already (Turkish casing: "KELİME").
    private func statColumn(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
            Text(label)
                .font(.system(size: 9, weight: .heavy))
                .tracking(1.4)
                .foregroundStyle(Theme.Color.textMuted)
        }
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Theme.Color.backgroundSurface)
                    .frame(width: 96, height: 96)
                Circle()
                    .strokeBorder(Theme.Color.border, lineWidth: 1)
                    .frame(width: 96, height: 96)
                Image(systemName: "character.book.closed")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(.top, 24)

            Text("Henüz kelime eklemedin")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)

            Text("Bir set izle, altı çizili turuncu kelimelere dokun, Ekle'ye bas. Eklediklerin burada birikecek.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 24)

            PrimaryButton(title: "Bir set aç", icon: "film", fullWidth: false) {
                openSets()
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.5)),
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Theme.Color.border.opacity(0.6), lineWidth: 1),
        )
    }

    /// The sets live on the Video tab.
    private func openSets() {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) {
            appState.selectedTab = .home
        }
    }

    // MARK: Grid

    /// Most recently added first (the order `load` asked for).
    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12,
        ) {
            ForEach(vm.summaries) { s in
                VocabTile(summary: s, learning: appState.learningLanguage) {
                    Haptics.medium()
                    selectedWord = s
                }
            }
        }
    }
}

// MARK: - Tile

private struct VocabTile: View {
    let summary: StarterWordSummary
    let learning: LearningLanguage
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(summary.word)
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.4)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    // How to say it, in Turkish letters, when we know.
                    if let reading = Okunus.reading(for: summary.word, learning: learning) {
                        Text(reading)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.Color.textMuted)
                            .lineLimit(1)
                            .accessibilityLabel("Okunuşu: \(reading)")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let tr = summary.translationTr, !tr.isEmpty {
                    Text(tr)
                        .font(.system(size: 13, weight: .medium))
                        .italic()
                        .foregroundStyle(Color(hex: 0xE0B07A))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Spacer(minLength: 6)

                // How common the word is in the films: information about the
                // word, not progress (nothing here counts what was watched).
                if summary.pocContextCount > 0 {
                    Text("\(summary.pocContextCount) sahnede geçiyor")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                        .lineLimit(1)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Theme.Color.backgroundCard),
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.5), lineWidth: 1),
            )
        }
        .buttonStyle(.pressable(scale: 0.97))
    }
}
