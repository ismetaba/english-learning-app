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
                Theme.Color.background.ignoresSafeArea()
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
            VStack(alignment: .leading, spacing: 20) {
                header
                reviewHero
                statsRow
                setsSection
                Spacer().frame(height: 120)
            }
            .padding(.top, 12)
        }
        .refreshable { await vm.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(appState.t.t("vocabulary"))
                .font(Theme.Font.display(30))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Build your word bank with spaced repetition")
                .font(Theme.Font.body(14))
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 48)
    }

    private var reviewHero: some View {
        let stats = SpacedRepetition.stats(Array(appState.vocabPool.values))
        return Button {
            Haptics.medium()
            showReview = true
        } label: {
            HStack(alignment: .center, spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                        .fill(Theme.Gradient.heroCool)
                    Image(systemName: "sparkles")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 62, height: 62)
                VStack(alignment: .leading, spacing: 4) {
                    Text(appState.t.t("startReview"))
                        .font(Theme.Font.headline(17, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text("\(stats.dueToday) words due today")
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .fill(Theme.Color.backgroundElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(Theme.Color.border, lineWidth: 1)
            )
            .premiumShadow(.small)
        }
        .buttonStyle(.pressable)
        .padding(.horizontal, 20)
    }

    private var statsRow: some View {
        let stats = SpacedRepetition.stats(Array(appState.vocabPool.values))
        return HStack(spacing: 10) {
            StatPill(value: "\(stats.byLevel[.mastered] ?? 0)",
                     label: appState.t.t("knownWords"),
                     color: Theme.Color.success)
            StatPill(value: "\(stats.byLevel[.learning] ?? 0)",
                     label: appState.t.t("learningWords"),
                     color: Theme.Color.warning)
            StatPill(value: "\(stats.dueToday)",
                     label: appState.t.t("toReview"),
                     color: Theme.Color.primary)
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var setsSection: some View {
        SectionHeader(
            title: "Vocab sets",
            subtitle: "Themed word lists",
            icon: "square.grid.2x2.fill",
            iconColor: Theme.Color.accent
        )
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
                GridItem(.flexible(), spacing: 10),
                GridItem(.flexible(), spacing: 10)
            ], spacing: 10) {
                ForEach(vm.sets) { set in
                    Button {
                        Haptics.selection()
                        selectedSet = set
                    } label: {
                        VocabSetCard(set: set)
                    }
                    .buttonStyle(.pressable)
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

struct StatPill: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(Theme.Font.display(26, weight: .heavy))
                .foregroundStyle(Theme.Color.textPrimary)
            Text(label)
                .font(Theme.Font.caption(11, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(color.opacity(0.25), lineWidth: 1.5)
        )
    }
}

struct VocabSetCard: View {
    let set: VocabSet

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(Theme.Color.accentSoft)
                Image(systemName: "character.book.closed.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.Color.accent)
            }
            .frame(width: 44, height: 44)
            Text(set.displayTitle)
                .font(Theme.Font.headline(15, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.system(size: 10, weight: .bold))
                Text("\(set.wordCount) words")
                    .font(Theme.Font.caption(11, weight: .bold))
            }
            .foregroundStyle(Theme.Color.textMuted)
        }
        .padding(14)
        .frame(height: 150, alignment: .topLeading)
        .frame(maxWidth: .infinity, alignment: .leading)
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
