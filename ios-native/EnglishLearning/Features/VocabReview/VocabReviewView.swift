import SwiftUI

/// Flashcard-style spaced-repetition review driven by the vocab pool.
struct VocabReviewView: View {
    @EnvironmentObject var appState: AppState

    @State private var dueWords: [VocabWordWithEntry] = []
    @State private var index: Int = 0
    @State private var flipped = false
    @State private var isLoading = true
    @State private var sessionCorrect = 0
    @State private var sessionWrong = 0
    @State private var finished = false
    @Environment(\.dismiss) var dismiss

    struct VocabWordWithEntry: Identifiable {
        let word: VocabWord
        let entry: VocabPoolEntry
        var id: String { word.id }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if isLoading {
                LoadingState(label: "Preparing your review…")
            } else if dueWords.isEmpty {
                EmptyState(
                    icon: "checkmark.seal.fill",
                    title: "All caught up!",
                    subtitle: "No words due for review right now — come back later.",
                    action: ("Back home", { dismiss() })
                )
            } else if finished {
                finishedView
            } else {
                content
            }
        }
        .navigationTitle("Vocab review")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .task { await prepare() }
    }

    private var content: some View {
        VStack(spacing: 20) {
            progressHeader
            Spacer()
            flashcard
            Spacer()
            answerButtons
            Spacer().frame(height: 20)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
    }

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Card \(min(index + 1, dueWords.count)) of \(dueWords.count)")
                    .font(Theme.Font.caption(12, weight: .bold))
                    .foregroundStyle(Theme.Color.textMuted)
                    .textCase(.uppercase)
                    .tracking(0.6)
                Spacer()
                HStack(spacing: 8) {
                    Label("\(sessionCorrect)", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Theme.Color.success)
                        .font(Theme.Font.caption(13, weight: .bold))
                    Label("\(sessionWrong)", systemImage: "xmark.circle.fill")
                        .foregroundStyle(Theme.Color.error)
                        .font(Theme.Font.caption(13, weight: .bold))
                }
            }
            ProgressBar(
                percent: Double(index) / max(Double(dueWords.count), 1) * 100,
                height: 6,
                color: Theme.Color.primary
            )
        }
    }

    private var flashcard: some View {
        let wordWrap = dueWords[safe: index]
        return Button {
            Haptics.selection()
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) {
                flipped.toggle()
            }
        } label: {
            ZStack {
                // Front
                if !flipped, let wrap = wordWrap {
                    cardFront(wrap.word)
                } else if flipped, let wrap = wordWrap {
                    cardBack(wrap.word)
                }
            }
            .frame(height: 300)
            .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0))
            .animation(.spring(response: 0.55, dampingFraction: 0.7), value: flipped)
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private func cardFront(_ word: VocabWord) -> some View {
        VStack(spacing: 14) {
            Text("FRONT")
                .font(Theme.Font.caption(10, weight: .heavy))
                .foregroundStyle(Theme.Color.textMuted)
                .tracking(1.2)
            Spacer()
            Text(word.word)
                .font(Theme.Font.display(42, weight: .heavy))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.8)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
            if let ipa = word.ipa {
                Text(ipa)
                    .font(Theme.Font.mono(15))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            Spacer()
            Text("Tap to reveal meaning")
                .font(Theme.Font.caption(12, weight: .semibold))
                .foregroundStyle(Theme.Color.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .fill(Theme.Gradient.cardGlow)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .strokeBorder(Theme.Color.borderAccent, lineWidth: 1.5)
        )
        .premiumShadow(.card)
    }

    private func cardBack(_ word: VocabWord) -> some View {
        VStack(spacing: 14) {
            Text("MEANING")
                .font(Theme.Font.caption(10, weight: .heavy))
                .foregroundStyle(.white.opacity(0.85))
                .tracking(1.2)
            Spacer()
            if let tr = word.translationTr {
                Text(tr)
                    .font(Theme.Font.display(32, weight: .heavy))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }
            if let example = word.exampleSentence {
                VStack(spacing: 4) {
                    Text(example)
                        .font(Theme.Font.body(15))
                        .foregroundStyle(.white.opacity(0.95))
                        .italic()
                    if let tr = word.exampleTranslationTr {
                        Text(tr)
                            .font(Theme.Font.body(13))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .fill(Theme.Gradient.heroPrimary)
        )
        .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
        .premiumShadow(.card)
    }

    private var answerButtons: some View {
        HStack(spacing: 12) {
            PrimaryButton(
                title: "Didn't know",
                icon: "xmark",
                style: .destructive,
                fullWidth: true
            ) { answer(correct: false) }
            PrimaryButton(
                title: "Got it",
                icon: "checkmark",
                style: .success,
                fullWidth: true
            ) { answer(correct: true) }
        }
        .disabled(!flipped)
        .opacity(flipped ? 1.0 : 0.5)
    }

    private var finishedView: some View {
        VStack(spacing: 16) {
            Spacer()
            ZStack {
                Circle()
                    .fill(Theme.Color.successSoft)
                    .frame(width: 110, height: 110)
                Image(systemName: "sparkles")
                    .font(.system(size: 50, weight: .bold))
                    .foregroundStyle(Theme.Color.success)
            }
            Text("Great session!")
                .font(Theme.Font.display(28))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("+\(sessionCorrect * XPReward.perQuizCorrect) XP earned")
                .font(Theme.Font.headline(16, weight: .bold))
                .foregroundStyle(Theme.Color.xp)
            HStack(spacing: 28) {
                VStack {
                    Text("\(sessionCorrect)")
                        .font(Theme.Font.display(32, weight: .heavy))
                        .foregroundStyle(Theme.Color.success)
                    Text("Correct")
                        .font(Theme.Font.caption(12, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                VStack {
                    Text("\(sessionWrong)")
                        .font(Theme.Font.display(32, weight: .heavy))
                        .foregroundStyle(Theme.Color.error)
                    Text("Missed")
                        .font(Theme.Font.caption(12, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
            .padding(.top, 4)
            Spacer()
            PrimaryButton(title: "Done", style: .primary) {
                dismiss()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
    }

    private func answer(correct: Bool) {
        Haptics.medium()
        guard let wrap = dueWords[safe: index] else { return }
        appState.processReview(wordId: wrap.word.id, correct: correct)
        if correct { sessionCorrect += 1 } else { sessionWrong += 1 }

        withAnimation(.easeInOut(duration: 0.2)) {
            flipped = false
        }
        if index < dueWords.count - 1 {
            withAnimation(.easeInOut(duration: 0.25).delay(0.1)) {
                index += 1
            }
        } else {
            Haptics.success()
            withAnimation(.easeInOut) { finished = true }
            // Log session
            appState.logSession(SessionEntry(
                date: SpacedRepetition.isoDay(Date()),
                minutesWatched: 0,
                xpEarned: sessionCorrect * XPReward.perQuizCorrect,
                clipsWatched: 0,
                wordsReviewed: sessionCorrect + sessionWrong
            ))
        }
    }

    private func prepare() async {
        isLoading = true
        // Build a review set from pool + fallback to a featured vocab set
        var results: [VocabWordWithEntry] = []

        let dueEntries = SpacedRepetition.dueEntries(Array(appState.vocabPool.values))
        if !dueEntries.isEmpty {
            // Pull word details if we don't have them cached — since we might not have per-word caching,
            // fall back to vocab sets for enrichment.
            if let sets = try? await APIClient.shared.fetchVocabSets(), !sets.isEmpty {
                for entry in dueEntries {
                    for set in sets.prefix(5) {
                        if let full = try? await APIClient.shared.fetchVocabSet(id: set.id),
                           let word = full.words.first(where: { $0.id == entry.wordId || $0.word == entry.wordId }) {
                            results.append(VocabWordWithEntry(word: word, entry: entry))
                            break
                        }
                    }
                }
            }
        }

        // If the pool is empty (first-time user), pull from the top vocab set
        if results.isEmpty, let sets = try? await APIClient.shared.fetchVocabSets(), let first = sets.first,
           let full = try? await APIClient.shared.fetchVocabSet(id: first.id) {
            for word in full.words.prefix(10) {
                let entry = appState.poolEntry(for: word.id)
                results.append(VocabWordWithEntry(word: word, entry: entry))
            }
        }

        self.dueWords = results
        isLoading = false
    }
}
