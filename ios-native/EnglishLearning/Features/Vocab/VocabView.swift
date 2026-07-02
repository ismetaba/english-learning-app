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
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            let recentFirst = Array(learnedWords.reversed())
            self.summaries = try await CurriculumRepository.shared.starterWordSummaries(
                ids: recentFirst,
                forceRefresh: forceRefresh,
            )
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Filter

private enum VocabFilter: Hashable, CaseIterable {
    case all, learning, nearMastery, mastered

    var label: String {
        switch self {
        case .all:         return "Tümü"
        case .learning:    return "Yeni"
        case .nearMastery: return "Yakın"
        case .mastered:    return "Mastered"
        }
    }

    func filter(_ s: StarterWordSummary) -> Bool {
        switch self {
        case .all:         return true
        case .learning:    return s.pocContextCount <= 3
        case .nearMastery: return (4...6).contains(s.pocContextCount)
        case .mastered:    return s.isMastered
        }
    }
}

// MARK: - Mode

private enum VocabMode: Hashable, CaseIterable {
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
    @State private var mode: VocabMode = .feed
    @State private var filter: VocabFilter = .all
    @State private var selectedWord: StarterWordSummary? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                if mode == .feed {
                    VocabFeedView()
                        .environmentObject(appState)
                        .ignoresSafeArea()
                } else {
                    BackgroundAmbience()
                    listContent
                }

                // Floating mode switch — sits above whichever layer
                // is showing so the user can flip without leaving.
                VStack {
                    HStack {
                        Spacer(minLength: 0)
                        modeSwitch
                            .padding(.trailing, 16)
                    }
                    .padding(.top, 16)
                    Spacer()
                }
            }
            .navigationDestination(item: $selectedWord) { word in
                VocabWordDetailView(summary: word)
                    .environmentObject(appState)
            }
        }
        .task(id: appState.progress.learnedWords) {
            await vm.load(learnedWords: appState.progress.learnedWords)
        }
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
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(mode == m ? Theme.Color.accent : .clear),
                    )
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

                if appState.progress.learnedWords.isEmpty {
                    emptyState
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                } else if vm.isLoading && vm.summaries.isEmpty {
                    LoadingState(label: "Kelimeler yükleniyor")
                        .padding(.top, 64)
                } else {
                    filterStrip
                        .padding(.horizontal, 20)
                    grid
                        .padding(.horizontal, 20)
                }

                Spacer().frame(height: 140)
            }
        }
        .refreshable {
            await vm.load(learnedWords: appState.progress.learnedWords, forceRefresh: true)
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

            HStack(spacing: 14) {
                statColumn(value: "\(appState.progress.learnedWords.count)", label: "kelime")
                divider
                statColumn(value: "\(vm.summaries.filter { $0.isMastered }.count)", label: "mastered")
                divider
                statColumn(
                    value: "\(vm.summaries.filter { (4...6).contains($0.pocContextCount) }.count)",
                    label: "yakın",
                )
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statColumn(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy))
                .tracking(1.4)
                .foregroundStyle(Theme.Color.textMuted)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Theme.Color.border.opacity(0.6))
            .frame(width: 1, height: 28)
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

            Text("Bir set izle, altı çizili amber kelimelere dokun, Ekle'ye bas. Eklediklerin burada birikecek.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 24)
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

    // MARK: Filter strip

    private var filterStrip: some View {
        HStack(spacing: 6) {
            ForEach(VocabFilter.allCases, id: \.self) { f in
                let count = vm.summaries.filter(f.filter).count
                Button(action: {
                    Haptics.selection()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        filter = f
                    }
                }) {
                    HStack(spacing: 6) {
                        Text(f.label)
                            .font(.system(size: 12, weight: .heavy))
                        if count > 0 {
                            Text("\(count)")
                                .font(.system(size: 10, weight: .heavy, design: .rounded))
                                .foregroundStyle(filter == f ? .black.opacity(0.6) : Theme.Color.textMuted)
                        }
                    }
                    .foregroundStyle(filter == f ? .black : Theme.Color.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(
                        Capsule().fill(filter == f ? Theme.Color.accent : Theme.Color.backgroundSurface.opacity(0.6)),
                    )
                    .overlay(
                        Capsule().strokeBorder(
                            filter == f ? .clear : Theme.Color.border.opacity(0.6),
                            lineWidth: 1,
                        ),
                    )
                }
                .buttonStyle(.pressable(scale: 0.95))
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Grid

    private var grid: some View {
        let visible = vm.summaries.filter(filter.filter)
        return LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12,
        ) {
            ForEach(visible) { s in
                VocabTile(summary: s) {
                    Haptics.medium()
                    selectedWord = s
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: filter)
    }
}

// MARK: - Tile

private struct VocabTile: View {
    let summary: StarterWordSummary
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(summary.word)
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.4)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    if summary.isMastered {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundStyle(Theme.Color.accent)
                    }
                }

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

                MasteryDots(filled: summary.pocContextCount, total: StarterWordSummary.masteryThreshold)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Theme.Color.backgroundCard),
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(
                        summary.isMastered
                            ? Theme.Color.accent.opacity(0.4)
                            : Theme.Color.border.opacity(0.5),
                        lineWidth: 1,
                    ),
            )
        }
        .buttonStyle(.pressable(scale: 0.97))
    }
}

// MARK: - Mastery dots

/// Row of small dots — filled count = how many distinct POC scenes
/// the user has encountered the word in. Capped at the mastery
/// threshold (7); extra dots beyond cap aren't drawn so the row
/// reads as "progress toward mastery" rather than a running total.
struct MasteryDots: View {
    let filled: Int
    let total: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<total, id: \.self) { i in
                Circle()
                    .fill(i < filled ? Theme.Color.accent : Theme.Color.backgroundSurface)
                    .frame(width: 7, height: 7)
                    .overlay(
                        Circle().strokeBorder(
                            i < filled ? .clear : Theme.Color.border.opacity(0.8),
                            lineWidth: 0.8,
                        ),
                    )
            }
        }
    }
}
