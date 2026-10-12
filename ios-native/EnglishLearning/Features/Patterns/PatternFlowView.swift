import SwiftUI

// MARK: - Pattern akış (sentence feed)
//
// Anti-flashcard pattern reinforcement. The user swipes vertically
// through example sentences for one kalıp; each card shows the English
// sentence color-coded by 3-color structure (subject sky / verb sage /
// rest lavender) with a Turkish gloss under each chunk. After the
// static examples a "video akış" card invites the user to see the
// pattern in real movie clips (only for patterns that have them). Last
// card is a finish state that records completion via AppState.

/// Lightweight nav payload — passed to navigationDestination so we
/// push PatternReelsView on demand rather than always mounting it.
private struct PatternReelsTarget: Hashable {
    let patternId: String
    let title: String
}

struct PatternFlowView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let pattern: Pattern
    /// Called by "Bitir" instead of closing just this screen (the path
    /// closes the intro under it too).
    var onFinished: (() -> Void)? = nil

    @State private var visibleIndex: Int = 0
    @State private var openedReels: PatternReelsTarget? = nil

    /// Number of static example cards before the trailing meta cards.
    private var exampleCount: Int { pattern.examples.count }
    /// The pattern has movie scenes. Without them there is no video card
    /// at all (a "yakında" card would be a dead end in the demo).
    private var hasVideo: Bool { pattern.videoStructureId != nil }
    /// Index of the "video akışı" intermission card (only with video).
    private var videoCardIndex: Int { exampleCount }
    /// Index of the final finish card.
    private var finishCardIndex: Int { hasVideo ? exampleCount + 1 : exampleCount }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            GeometryReader { geo in
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        // Static example cards
                        ForEach(Array(pattern.examples.enumerated()), id: \.offset) { idx, example in
                            PatternFlowCard(
                                pattern: pattern,
                                example: example,
                                index: idx,
                                total: exampleCount,
                                hasVideo: hasVideo
                            )
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(idx)
                        }

                        // Video akış intermission
                        if hasVideo {
                            PatternFlowVideoCard(
                                pattern: pattern,
                                onOpenReels: openReels
                            )
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(videoCardIndex)
                        }

                        // Finish card
                        PatternFlowFinishCard(
                            pattern: pattern,
                            onFinish: finish,
                            onAgain: { advance(to: 0) }
                        )
                        .frame(width: geo.size.width, height: geo.size.height)
                        .id(finishCardIndex)
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: Binding(
                    get: { visibleIndex },
                    set: { newValue in
                        if let v = newValue { visibleIndex = v }
                    }
                ))
            }
            .ignoresSafeArea()

            // Top chrome — title pill + close
            VStack {
                topBar
                    .padding(.horizontal, 16)
                    .padding(.top, 56)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
        .navigationBarHidden(true)
        // Hide the floating tab bar via the same hook the video player uses.
        .hidesTabBarWhileVisible()
        .navigationDestination(item: $openedReels) { target in
            PatternReelsView(patternId: target.patternId, title: target.title)
                .environmentObject(appState)
        }
        // Back from the video akış: the next step is the finish card, as
        // the video card promised, not the video card again.
        .onChange(of: openedReels) { old, new in
            if old != nil && new == nil {
                advance(to: finishCardIndex)
            }
        }
    }

    private func openReels() {
        guard let id = pattern.videoStructureId else { return }
        Haptics.medium()
        openedReels = PatternReelsTarget(patternId: id, title: pattern.titleTr)
    }

    /// Records the pattern (its haptic comes from there) and goes back to
    /// the path, where the node now shows ✓.
    private func finish() {
        appState.markPatternComplete(pattern.id)
        if let onFinished {
            onFinished()
        } else {
            dismiss()
        }
    }

    private func advance(to idx: Int) {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.3)) {
            visibleIndex = idx
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                Haptics.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.12), in: Circle())
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.2), lineWidth: 1))
            }
            .buttonStyle(.pressable)

            VStack(alignment: .leading, spacing: 1) {
                Text("AKIŞ · " + pattern.familyTrCaps)
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.6))
                Text(pattern.titleTr)
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }

            Spacer()

            Text(progressText)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.white.opacity(0.12)))
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.25), lineWidth: 1))
        }
    }

    private var progressText: String {
        if visibleIndex >= finishCardIndex { return "Bitti" }
        if hasVideo && visibleIndex == videoCardIndex { return "Video" }
        let shown = min(visibleIndex + 1, exampleCount)
        return "\(shown) / \(exampleCount)"
    }
}

// MARK: - Single example card (with per-word Turkish)

struct PatternFlowCard: View {
    let pattern: Pattern
    let example: PatternExample
    let index: Int
    let total: Int
    /// The video card follows the last example; otherwise the finish card.
    let hasVideo: Bool

    var body: some View {
        ZStack {
            // Soft radial backdrop so the kalıp has its own atmosphere
            RadialGradient(
                colors: [
                    Theme.Color.primary.opacity(0.18),
                    Color.black,
                ],
                center: .center,
                startRadius: 80,
                endRadius: 540
            )
            .ignoresSafeArea()

            VStack(spacing: 26) {
                Spacer(minLength: 0)

                // Sentence — each chunk stacks English (color-coded),
                // Turkish-style okunuş (when present), then Turkish gloss.
                FlowLayout(spacing: 14, lineSpacing: 18) {
                    chunk(text: example.subject,
                          phonetic: example.subjectPhonetic,
                          tr: example.subjectTr,
                          kind: .subject)
                    chunk(text: example.verb,
                          phonetic: example.verbPhonetic,
                          tr: example.verbTr,
                          kind: .verb)
                    chunk(text: example.rest,
                          phonetic: example.restPhonetic,
                          tr: example.restTr,
                          kind: .rest)
                }
                .padding(.horizontal, 20)

                // Full-sentence Turkish translation
                Text(example.tr)
                    .font(.system(size: 16, weight: .semibold))
                    .italic()
                    .foregroundStyle(Color(hex: 0xE0B07A))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)

                // Compact formula reminder
                FormulaRow(tokens: pattern.formula, size: 12)
                    .padding(.horizontal, 24)

                Spacer(minLength: 0)

                hint
                    .padding(.bottom, 80)
            }
        }
    }

    /// One subject/verb/rest chunk — English (color-coded) on top,
    /// Turkish-style okunuş (when set) directly under the word, then
    /// the Turkish gloss, quieter but readable.
    private func chunk(text: String, phonetic: String?, tr: String, kind: PatternSlotKind) -> some View {
        VStack(spacing: 3) {
            Text(text)
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(kind.color)
                .tracking(-0.4)
            if let okunus = phonetic {
                Text(okunus)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .italic()
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
                    .multilineTextAlignment(.center)
            }
            Text(tr)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.62))
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Capitals spelled out: `.textCase(.uppercase)` ignores Turkish
    /// casing ("VIDEO", "BITIR").
    private var hint: some View {
        HStack(spacing: 6) {
            Image(systemName: "chevron.up")
                .font(.system(size: 11, weight: .heavy))
            Text(hintText)
                .font(.system(size: 11, weight: .heavy))
                .tracking(0.6)
        }
        .foregroundStyle(.white.opacity(0.45))
    }

    private var hintText: String {
        guard index == total - 1 else { return "YUKARI KAYDIR" }
        return hasVideo ? "YUKARI KAYDIR → VİDEO AKIŞI" : "YUKARI KAYDIR → BİTİR"
    }
}

// MARK: - Video akış intermission card

/// Bridges the static example cards to a vertical reel of movie
/// clips that all open with this pattern: "Video akışını aç" pushes
/// `PatternReelsView`. Only shown for patterns with a
/// `videoStructureId` (the route key on the patterns API).
struct PatternFlowVideoCard: View {
    let pattern: Pattern
    let onOpenReels: () -> Void

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [
                    Theme.Color.accent.opacity(0.22),
                    Color.black,
                ],
                center: .center,
                startRadius: 80,
                endRadius: 540
            )
            .ignoresSafeArea()

            VStack(spacing: 22) {
                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .fill(Theme.Color.accent.opacity(0.18))
                        .frame(width: 130, height: 130)
                    Circle()
                        .strokeBorder(Theme.Color.accent.opacity(0.5), lineWidth: 2)
                        .frame(width: 130, height: 130)
                    Image(systemName: "film.stack")
                        .font(.system(size: 52, weight: .semibold))
                        .foregroundStyle(Theme.Color.accent)
                }

                VStack(spacing: 8) {
                    Text("Şimdi gerçek videolarda gör")
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(-0.4)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)

                    Text(pattern.titleTr + " kalıbı film sahnelerinde")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                statusChip
                    .padding(.top, 4)

                VStack(spacing: 10) {
                    PrimaryButton(
                        title: "Video akışını aç",
                        icon: "play.fill",
                        style: .primary,
                        fullWidth: true
                    ) {
                        onOpenReels()
                    }

                    // Capitals spelled out (Turkish İ).
                    Text("VİDEO AKIŞINDAN SONRA BİTİR ADIMINA GEÇECEKSİN")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(0.4)
                        .foregroundStyle(.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
                .padding(.top, 8)

                Spacer(minLength: 0)
                Spacer().frame(height: 80)
            }
        }
    }

    private var statusChip: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Theme.Color.success)
                .frame(width: 6, height: 6)
            Text("VİDEO HAZIR")
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.0)
        }
        .foregroundStyle(Theme.Color.success)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(Theme.Color.success.opacity(0.14)))
        .overlay(Capsule().strokeBorder(Theme.Color.success.opacity(0.4), lineWidth: 1))
    }
}

// MARK: - Finish card

struct PatternFlowFinishCard: View {
    let pattern: Pattern
    let onFinish: () -> Void
    let onAgain: () -> Void

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [
                    Theme.Color.success.opacity(0.22),
                    Color.black,
                ],
                center: .center,
                startRadius: 80,
                endRadius: 540
            )
            .ignoresSafeArea()

            VStack(spacing: 22) {
                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .fill(Theme.Color.success.opacity(0.18))
                        .frame(width: 130, height: 130)
                    Circle()
                        .strokeBorder(Theme.Color.success.opacity(0.5), lineWidth: 2)
                        .frame(width: 130, height: 130)
                    Image(systemName: "checkmark")
                        .font(.system(size: 56, weight: .heavy))
                        .foregroundStyle(Theme.Color.success)
                }

                VStack(spacing: 8) {
                    Text("Tebrikler!")
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(-0.5)
                    Text("Bu kalıbı tamamladın!")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                FormulaRow(tokens: pattern.formula, size: 13)
                    .padding(.horizontal, 24)
                    .padding(.top, 4)

                VStack(spacing: 10) {
                    PrimaryButton(
                        title: "Bitir",
                        icon: "checkmark",
                        style: .success,
                        fullWidth: true
                    ) { onFinish() }

                    Button {
                        onAgain()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.system(size: 12, weight: .heavy))
                            Text("Baştan başla")
                                .font(.system(size: 13, weight: .heavy))
                                .tracking(0.4)
                        }
                        .foregroundStyle(.white.opacity(0.7))
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.pressable)
                }
                .padding(.horizontal, 32)
                .padding(.top, 12)

                Spacer(minLength: 0)
                Spacer().frame(height: 80)
            }
        }
    }
}
