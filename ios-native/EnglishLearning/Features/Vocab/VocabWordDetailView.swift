import SwiftUI

// MARK: - View model

@MainActor
final class VocabWordDetailViewModel: ObservableObject {
    @Published var detail: StarterWordContexts? = nil
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(id: String, forceRefresh: Bool = false) async {
        // A retry from the error state has nothing on screen: show the
        // spinner, not a blank list.
        if !forceRefresh || detail == nil { isLoading = true }
        errorMessage = nil
        do {
            self.detail = try await CurriculumRepository.shared.starterWordContexts(
                id: id,
                forceRefresh: forceRefresh,
            )
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Word detail

/// One starter word with every distinct sentence it appears in across the
/// film library. The Feynman bet is that the more contexts you see a word
/// in, the less you're "memorizing" it — you're actually meeting it. So
/// this screen leans into the contexts: each one is a card that plays the
/// scene where the word lives. (These are the library's scenes, not the
/// ones the learner watched: nothing here claims progress.)
struct VocabWordDetailView: View {
    let summary: StarterWordSummary

    @EnvironmentObject var appState: AppState
    @StateObject private var vm = VocabWordDetailViewModel()
    @State private var playingContext: VocabContext? = nil

    var body: some View {
        ZStack {
            BackgroundAmbience()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    hero
                    scenesBlock
                    contextsSection
                    Spacer().frame(height: 60)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
            }
        }
        .navigationBarBackButtonHidden(false)
        // Back is just the chevron, not the system's English "Back".
        .toolbarRole(.editor)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(summary.word)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
            }
        }
        .navigationDestination(item: $playingContext) { ctx in
            VocabContextPlayerView(context: ctx)
                .environmentObject(appState)
        }
        .task {
            await vm.load(id: summary.id)
        }
        .refreshable {
            await vm.load(id: summary.id, forceRefresh: true)
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if let pos = partOfSpeechBadge(summary.partOfSpeech) {
                    metaBadge(text: pos)
                }
                if let cefr = summary.cefrLevel, !cefr.isEmpty {
                    metaBadge(text: cefr.uppercased(), tinted: true)
                }
                Spacer(minLength: 0)
            }

            Text(summary.word)
                .font(.system(size: 44, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-1)
                .lineLimit(2)
                .minimumScaleFactor(0.7)

            if let tr = summary.translationTr, !tr.isEmpty {
                Text(tr)
                    .font(.system(size: 18, weight: .semibold))
                    .italic()
                    .foregroundStyle(Color(hex: 0xE0B07A))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }

            // How to say it: the Turkish-letter okunuş when we know it,
            // otherwise the IPA when the word has one.
            if let reading = TurkishPhonetics.reading(for: summary.word) {
                Text(reading)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
                    .accessibilityLabel("Okunuşu: \(reading)")
            } else if let ipa = summary.ipa, !ipa.isEmpty {
                Text(ipa)
                    .font(.system(size: 13, weight: .regular, design: .monospaced))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaBadge(text: String, tinted: Bool = false) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy))
            .tracking(1.4)
            .foregroundStyle(tinted ? Theme.Color.accent : Theme.Color.textMuted)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(
                    tinted
                        ? Theme.Color.accent.opacity(0.12)
                        : Theme.Color.backgroundSurface.opacity(0.7),
                ),
            )
            .overlay(
                Capsule().strokeBorder(
                    tinted
                        ? Theme.Color.accent.opacity(0.3)
                        : Theme.Color.border.opacity(0.6),
                    lineWidth: 1,
                ),
            )
    }

    // MARK: Scenes block

    /// How many scenes in the library the word appears in: information
    /// about the word, not the learner's progress (that isn't tracked yet,
    /// so nothing here claims it). Hidden when there are none; the list
    /// below says so.
    @ViewBuilder
    private var scenesBlock: some View {
        if summary.pocContextCount > 0 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(summary.pocContextCount)")
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text("sahnede geçiyor")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.Color.textSecondary)
                    Spacer(minLength: 0)
                }

                Text("Bu kelimeyi farklı sahnelerde izle; her yeni sahne onu biraz daha kalıcı yapar.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Theme.Color.backgroundCard.opacity(0.7)),
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.5), lineWidth: 1),
            )
        }
    }

    // MARK: Contexts

    private var contextsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                // Every scene in the library, not only the watched ones.
                Text("BU KELİMENİN GEÇTİĞİ SAHNELER")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(1.6)
                    .foregroundStyle(Theme.Color.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Rectangle()
                    .fill(Theme.Color.border.opacity(0.6))
                    .frame(height: 1)
            }

            if vm.isLoading && vm.detail == nil {
                LoadingState(label: "Sahneler yükleniyor")
                    .padding(.top, 24)
            } else if vm.detail == nil, let err = vm.errorMessage {
                // Only with nothing loaded: a failed refresh keeps the list.
                ErrorState(message: err) {
                    Task { await vm.load(id: summary.id, forceRefresh: true) }
                }
            } else if let detail = vm.detail {
                if detail.contexts.isEmpty {
                    Text("Bu kelime için henüz sahne yok.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.Color.textMuted)
                        .padding(.top, 16)
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(Array(detail.contexts.enumerated()), id: \.element.id) { idx, ctx in
                            ContextCard(
                                context: ctx,
                                position: idx + 1,
                                starterId: summary.id,
                                onTap: {
                                    Haptics.medium()
                                    playingContext = ctx
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Context card

private struct ContextCard: View {
    let context: VocabContext
    let position: Int
    let starterId: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 14) {
                // Tiny position badge — gives a sense of order without
                // introducing thumbnail clutter for every line.
                ZStack {
                    Circle()
                        .strokeBorder(Theme.Color.border, lineWidth: 1)
                        .frame(width: 26, height: 26)
                    Text(String(format: "%02d", position))
                        .font(.system(size: 9, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textMuted)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(context.movieTitle.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(Theme.Color.textMuted)

                    Text(structureAttributed())
                        .font(.system(size: 16, weight: .semibold))
                        .lineSpacing(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 6) {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 13, weight: .heavy))
                        Text("Sahneyi izle")
                            .font(.system(size: 11, weight: .heavy))
                            .tracking(0.5)
                    }
                    .foregroundStyle(Theme.Color.accent)
                    .padding(.top, 4)
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.Color.textMuted.opacity(0.6))
                    .padding(.top, 4)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.Color.backgroundCard),
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.5), lineWidth: 1),
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    /// Builds the colored sentence with the matching starter word
    /// emphasized (heavier weight + amber underline) so the eye lands
    /// on the actual word being studied first.
    private func structureAttributed() -> AttributedString {
        let subjectIdx = Set(context.structure?.subject ?? [])
        let auxIdx     = Set(context.structure?.auxVerb  ?? [])

        var out = AttributedString()
        for (i, w) in context.words.enumerated() {
            let idx = w.wordIndex ?? i
            let color: Color
            if subjectIdx.contains(idx) {
                color = Color(hex: 0x5BA3DD)
            } else if auxIdx.contains(idx) {
                color = Color(hex: 0x6BC084)
            } else {
                color = Color(hex: 0xB093D2)
            }

            var chunk = AttributedString(w.word)
            chunk.foregroundColor = color
            if w.starterId == starterId {
                chunk.font = .system(size: 16, weight: .heavy)
                chunk.underlineStyle = .single
            }
            out.append(chunk)
            if i < context.words.count - 1 {
                out.append(AttributedString(" "))
            }
        }
        return out
    }
}

// MARK: - Context player

/// Drops the learner back into the scene a VocabContext came from: the
/// whole scene (every subtitle line) when the video's clips are at hand,
/// otherwise just the sentence — starting at the sentence either way
/// (`ScenePlan`).
struct VocabContextPlayerView: View {
    let context: VocabContext

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var plan: ScenePlan? = nil

    /// How long to wait for the full scene before playing just the sentence.
    private static let sceneTimeoutNanoseconds: UInt64 = 4_000_000_000

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if let plan {
                // No `onFinish`: the scene stays open when it ends (last
                // frame, transcript, ▶ replays it); only back leaves. No
                // first-word hint: it would pause on the sentence the
                // learner came to hear.
                ClipPlayerView(
                    clips: [plan.clip],
                    onExit: { dismiss() },
                    initialTime: plan.startAt,
                    showsStarterHint: false,
                )
                .environmentObject(appState)
            } else {
                // The scene can take a few seconds to arrive, and the
                // system bar (and its swipe back) is hidden: the way out is
                // there from the start.
                ZStack(alignment: .topLeading) {
                    LoadingState(label: "Sahne hazırlanıyor")
                    backButton
                        .padding(.leading, 12)
                        .padding(.top, 4)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .hidesTabBarWhileVisible()
        .task { await preparePlan() }
    }

    /// Same as the set player's close button (a 36pt circle, 44pt to tap).
    private var backButton: some View {
        Button {
            Haptics.light()
            dismiss()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Theme.Color.backgroundCard))
                .overlay(Circle().strokeBorder(Theme.Color.border, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Geri")
    }

    /// Fetches the video's scenes (session cache / saved copy answer at
    /// once) but never waits more than a few seconds for them: past that
    /// the sentence alone plays.
    private func preparePlan() async {
        guard plan == nil else { return }
        let context = self.context
        guard context.isPoc else {
            plan = ScenePlan.make(context: context, videoClips: nil)
            return
        }
        let fetch = Task {
            try? await CurriculumRepository.shared.pocVideoClips(videoId: context.videoId)
        }
        let fallback = Task { @MainActor in
            try? await Task.sleep(nanoseconds: Self.sceneTimeoutNanoseconds)
            guard !Task.isCancelled, plan == nil else { return }
            plan = ScenePlan.make(context: context, videoClips: nil)
        }
        let clips = await fetch.value
        fallback.cancel()
        guard plan == nil else { return }
        plan = ScenePlan.make(context: context, videoClips: clips)
    }
}

// MARK: - Part-of-speech badge

/// `partOfSpeechTr` in capitals for the badges. Its Turkish names follow
/// Turkish casing ("fiil" → "FİİL", "isim" → "İSİM"); a tag it passes
/// through untranslated is English and keeps English casing.
func partOfSpeechBadge(_ pos: String?) -> String? {
    guard let name = partOfSpeechTr(pos) else { return nil }
    let isTurkish = name != pos?.lowercased() || ["fiil", "sıfat", "isim", "zarf"].contains(name)
    return name.uppercased(with: Locale(identifier: isTurkish ? "tr_TR" : "en_US"))
}
