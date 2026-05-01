import SwiftUI

// MARK: - View model

@MainActor
final class VocabWordDetailViewModel: ObservableObject {
    @Published var detail: StarterWordContexts? = nil
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(id: String, forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
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

/// One starter word with every distinct POC sentence it appears in.
/// The Feynman bet is that the more contexts you see a word in, the
/// less you're "memorizing" it — you're actually meeting it. So this
/// screen leans into the contexts: each one is a re-watchable card
/// that drops you back into the scene where the word lived.
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
                    masteryBlock
                    contextsSection
                    Spacer().frame(height: 60)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
            }
        }
        .navigationBarBackButtonHidden(false)
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
                if let pos = summary.partOfSpeech, !pos.isEmpty {
                    metaBadge(text: pos.uppercased())
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

            if let ipa = summary.ipa, !ipa.isEmpty {
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

    // MARK: Mastery block

    private var masteryBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(summary.pocContextCount)")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                Text("/ \(StarterWordSummary.masteryThreshold) bağlam")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.textMuted)
                Spacer(minLength: 0)
                if summary.isMastered {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12, weight: .heavy))
                        Text("MASTERED")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(1.4)
                    }
                    .foregroundStyle(Theme.Color.accent)
                }
            }

            // Cyan progress bar — fills proportionally to context count,
            // clamped at the 7-context mastery threshold so the bar
            // doesn't keep growing past "full".
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Theme.Color.backgroundSurface)
                        .frame(height: 8)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Theme.Color.accent, Theme.Color.accent.opacity(0.7)],
                                startPoint: .leading,
                                endPoint: .trailing,
                            ),
                        )
                        .frame(
                            width: max(
                                12,
                                geo.size.width * CGFloat(summary.contextProgressFraction),
                            ),
                            height: 8,
                        )
                        .shadow(
                            color: Theme.Color.accent.opacity(summary.isMastered ? 0.5 : 0.15),
                            radius: 8, x: 0, y: 0,
                        )
                }
            }
            .frame(height: 8)

            Text(masteryHint)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.textSecondary)
                .lineSpacing(2)
                .padding(.top, 2)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.7)),
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

    private var masteryHint: String {
        if summary.isMastered {
            return "Bu kelimeyi 7+ farklı sahnede gördün. Artık \"öğreniyor\" değil, biliyorsun."
        }
        let remaining = StarterWordSummary.masteryThreshold - summary.pocContextCount
        if summary.pocContextCount == 0 {
            return "Bu kelimeyi henüz hiçbir sette görmedin — yeni bir sahnede karşılaşmak için izlemeye devam."
        }
        return "Mastery için \(remaining) yeni bağlam daha. Aynı kelimeyi farklı sahnelerde görmek, ezberlemekten güçlüdür."
    }

    // MARK: Contexts

    private var contextsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("GÖRDÜĞÜN BAĞLAMLAR")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(2)
                    .foregroundStyle(Theme.Color.accent)
                Rectangle()
                    .fill(Theme.Color.border.opacity(0.6))
                    .frame(height: 1)
            }

            if vm.isLoading && vm.detail == nil {
                LoadingState(label: "Bağlamlar yükleniyor")
                    .padding(.top, 24)
            } else if let err = vm.errorMessage {
                ErrorState(message: err) {
                    Task { await vm.load(id: summary.id, forceRefresh: true) }
                }
            } else if let detail = vm.detail {
                if detail.contexts.isEmpty {
                    Text("Henüz POC setlerinde bu kelime için sahne yok.")
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
                        Text("Sahneye dön")
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

/// Wraps ClipPlayerView for a single VocabContext — synthesizes a
/// one-line clip from the context, drops the user into the existing
/// player at exactly that line.
struct VocabContextPlayerView: View {
    let context: VocabContext

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ClipPlayerView(
                clips: [context.asLessonClip()],
                onFinish: { dismiss() },
                onExit: { dismiss() },
            )
            .environmentObject(appState)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { appState.isVideoPlayerActive = true }
        .onDisappear { appState.isVideoPlayerActive = false }
    }
}
