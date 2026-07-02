import SwiftUI

@MainActor
final class VocabSetViewModel: ObservableObject {
    @Published var set: VocabSetWithWords? = nil
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(id: String) async {
        isLoading = true
        errorMessage = nil
        do {
            self.set = try await APIClient.shared.fetchVocabSet(id: id)
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct VocabSetView: View {
    @EnvironmentObject var appState: AppState
    let setId: String
    let title: String

    @StateObject private var vm = VocabSetViewModel()
    @State private var expandedWord: String? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if vm.isLoading {
                LoadingState(label: appState.t.t("loading"))
            } else if let err = vm.errorMessage {
                ErrorState(message: err) {
                    Task { await vm.load(id: setId) }
                }
            } else if let set = vm.set {
                content(set)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .task { await vm.load(id: setId) }
    }

    private func content(_ set: VocabSetWithWords) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(set.title)
                        .font(Theme.Font.display(24))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .tracking(-0.4)
                    Text("\(set.words.count) words to master")
                        .font(Theme.Font.body(14))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                .padding(.horizontal, 20)

                LazyVStack(spacing: 8) {
                    ForEach(set.words) { word in
                        VocabWordRow(
                            word: word,
                            pool: appState.poolEntry(for: word.id),
                            expanded: expandedWord == word.id,
                            onTap: {
                                Haptics.selection()
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    expandedWord = expandedWord == word.id ? nil : word.id
                                }
                            },
                            onKnown: { appState.processReview(wordId: word.id, correct: true) },
                            onStruggle: { appState.processReview(wordId: word.id, correct: false) }
                        )
                    }
                }
                .padding(.horizontal, 20)

                Spacer().frame(height: 60)
            }
            .padding(.top, 12)
        }
    }
}

struct VocabWordRow: View {
    let word: VocabWord
    let pool: VocabPoolEntry
    let expanded: Bool
    let onTap: () -> Void
    let onKnown: () -> Void
    let onStruggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: onTap) {
                HStack(alignment: .center, spacing: 12) {
                    masteryBadge
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(word.word)
                                .font(Theme.Font.headline(17, weight: .bold))
                                .foregroundStyle(Theme.Color.textPrimary)
                            if let pos = partOfSpeechTr(word.partOfSpeech) {
                                Text(pos)
                                    .font(Theme.Font.caption(10, weight: .bold))
                                    .foregroundStyle(Theme.Color.textMuted)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Theme.Color.backgroundSurface, in: Capsule())
                            }
                        }
                        if let tr = word.translationTr {
                            Text(tr)
                                .font(Theme.Font.body(14))
                                .foregroundStyle(Theme.Color.textSecondary)
                        }
                    }
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)

            if expanded {
                VStack(alignment: .leading, spacing: 10) {
                    if let ipa = word.ipa {
                        HStack {
                            Image(systemName: "speaker.wave.2")
                                .foregroundStyle(Theme.Color.accent)
                            Text(ipa)
                                .font(Theme.Font.mono(13))
                                .foregroundStyle(Theme.Color.textSecondary)
                        }
                    }
                    if let example = word.exampleSentence {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(example)
                                .font(Theme.Font.body(14))
                                .foregroundStyle(Theme.Color.textPrimary)
                                .italic()
                            if let tr = word.exampleTranslationTr {
                                Text(tr)
                                    .font(Theme.Font.body(13))
                                    .foregroundStyle(Theme.Color.textMuted)
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                                .fill(Theme.Color.backgroundElevated)
                        )
                    }
                    HStack(spacing: 10) {
                        PrimaryButton(
                            title: "I know this",
                            icon: "checkmark",
                            style: .success,
                            fullWidth: true
                        ) { onKnown() }
                        PrimaryButton(
                            title: "Review again",
                            icon: "arrow.counterclockwise",
                            style: .secondary,
                            fullWidth: true
                        ) { onStruggle() }
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }

    private var masteryBadge: some View {
        let (color, icon): (Color, String) = {
            switch pool.masteryLevel {
            case .mastered: return (Theme.Color.success, "checkmark.seal.fill")
            case .familiar: return (Theme.Color.accent, "star.fill")
            case .learning: return (Theme.Color.warning, "sparkles")
            case .new: return (Theme.Color.textMuted, "circle.dashed")
            }
        }()
        return ZStack {
            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                .fill(color.opacity(0.18))
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(width: 36, height: 36)
    }
}
