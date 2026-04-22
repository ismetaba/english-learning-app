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
        VStack(alignment: .leading, spacing: 4) {
            Text("Vocabulary")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Your word bank · spaced repetition")
                .font(.system(size: 14))
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
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.Color.accentSoft)
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.Color.accent)
                }
                .frame(width: 52, height: 52)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Daily review")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text("\(stats.dueToday) words due today")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.Color.border, lineWidth: 1)
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
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
