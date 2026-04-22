import SwiftUI

@MainActor
final class VocabViewModel: ObservableObject {
    @Published var sets: [VocabSet] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let data = try await APIClient.shared.fetchVocabSets()
            self.sets = data
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct VocabView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = VocabViewModel()
    @State private var selectedSet: VocabSet? = nil
    @State private var showReview = false

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundAmbience()
                content
            }
            .navigationDestination(item: $selectedSet) { set in
                VocabSetView(setId: set.id, title: set.displayTitle)
                    .environmentObject(appState)
            }
            .navigationDestination(isPresented: $showReview) {
                VocabReviewView().environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                header
                reviewHero
                statsStrip
                setsSection
                Spacer().frame(height: 120)
            }
            .padding(.top, 58)
        }
        .refreshable { await vm.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "character.book.closed.fill")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
                Text("WORD BANK")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(1.5)
                    .foregroundStyle(Theme.Color.accent)
            }
            Text("Expand your\nvocabulary")
                .font(.system(size: 32, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
                .lineSpacing(-4)
            Text("Smart spaced repetition remembers for you")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 20)
    }

    private var reviewHero: some View {
        let stats = SpacedRepetition.stats(Array(appState.vocabPool.values))
        return Button {
            Haptics.medium()
            showReview = true
        } label: {
            ZStack(alignment: .bottomLeading) {
                // Gradient background
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Theme.Color.accent.opacity(0.9), Theme.Color.levelElementary.opacity(0.7)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )

                // Decorative blobs
                Circle()
                    .fill(.white.opacity(0.15))
                    .blur(radius: 30)
                    .frame(width: 180, height: 180)
                    .offset(x: 150, y: -50)

                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        ZStack {
                            Circle().fill(.white.opacity(0.25))
                            Image(systemName: "sparkles")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .frame(width: 36, height: 36)
                        Text("DAILY REVIEW")
                            .font(.system(size: 11, weight: .heavy, design: .rounded))
                            .tracking(1.5)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    Text("\(stats.dueToday) words due today")
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(-0.3)
                    Text("Tap to start flashcards")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.85))
                    HStack {
                        Spacer()
                        HStack(spacing: 6) {
                            Text("Start review")
                                .font(.system(size: 13, weight: .heavy, design: .rounded))
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .heavy))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(
                            Capsule().fill(.white.opacity(0.25))
                                .overlay(Capsule().stroke(.white.opacity(0.35), lineWidth: 1))
                        )
                    }
                }
                .padding(20)
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .strokeBorder(.white.opacity(0.12), lineWidth: 1)
            )
            .shadow(color: Theme.Color.accent.opacity(0.35), radius: 22, y: 10)
        }
        .buttonStyle(.pressable(scale: 0.97))
        .padding(.horizontal, 20)
    }

    private var statsStrip: some View {
        let stats = SpacedRepetition.stats(Array(appState.vocabPool.values))
        return HStack(spacing: 10) {
            MasteryPill(
                icon: "checkmark.seal.fill",
                value: stats.byLevel[.mastered] ?? 0,
                label: "MASTERED",
                color: Theme.Color.success
            )
            MasteryPill(
                icon: "star.fill",
                value: stats.byLevel[.familiar] ?? 0,
                label: "FAMILIAR",
                color: Theme.Color.accent
            )
            MasteryPill(
                icon: "sparkles",
                value: stats.byLevel[.learning] ?? 0,
                label: "LEARNING",
                color: Theme.Color.warning
            )
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var setsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Theme.Color.primary)
                    .frame(width: 4, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text("VOCAB SETS")
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.primary)
                    Text("Themed collections")
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.3)
                }
                Spacer()
                if !vm.sets.isEmpty {
                    Text("\(vm.sets.count)")
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textMuted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Theme.Color.backgroundCard))
                }
            }
            .padding(.horizontal, 20)

            if vm.isLoading && vm.sets.isEmpty {
                LoadingState().frame(height: 220)
            } else if vm.sets.isEmpty {
                EmptyState(
                    icon: "tray",
                    title: "No vocab sets yet",
                    subtitle: "Complete a lesson to build your word bank"
                )
                .padding(.top, 40)
            } else {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    ForEach(Array(vm.sets.enumerated()), id: \.element.id) { idx, set in
                        Button {
                            Haptics.selection()
                            selectedSet = set
                        } label: {
                            ModernVocabSetCard(set: set, tint: tintFor(idx))
                        }
                        .buttonStyle(.pressable(scale: 0.95))
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func tintFor(_ idx: Int) -> Color {
        let palette = [Theme.Color.primary, Theme.Color.accent, Theme.Color.warning,
                       Theme.Color.levelElementary, Theme.Color.levelUpper]
        return palette[idx % palette.count]
    }
}

struct MasteryPill: View {
    let icon: String
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(color)
                Text(label)
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.8)
                    .foregroundStyle(color)
            }
            Text("\(value)")
                .font(.system(size: 24, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(color.opacity(0.3), lineWidth: 1)
        )
    }
}

struct ModernVocabSetCard: View {
    let set: VocabSet
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [tint.opacity(0.4), tint.opacity(0.12)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "character.book.closed.fill")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white.opacity(0.95))
            }
            .frame(height: 90)

            VStack(alignment: .leading, spacing: 6) {
                Text(set.displayTitle)
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 4) {
                    Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 9, weight: .bold))
                    Text("\(set.wordCount) words")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                }
                .foregroundStyle(tint)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }
}
