import SwiftUI

// MARK: - Pattern path: what Video and Kelimeler show along it (Spanish)

/// Video or Kelimeler before the learner has finished a pattern: the path
/// starts on Kalıplar.
struct PatternGateView: View {
    enum Kind { case video, words }
    let kind: Kind
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            BackgroundAmbience()
            VStack(spacing: 18) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.primary.opacity(0.14))
                        .frame(width: 96, height: 96)
                    Image(systemName: "puzzlepiece.fill")
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundStyle(Theme.Color.primary)
                }
                Text("Önce ilk kalıbı öğren")
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                PrimaryButton(title: "Kalıplara git", icon: "arrow.right", style: .primary, fullWidth: true) {
                    Haptics.medium()
                    appState.selectedTab = .patterns
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 32)
        }
    }

    private var message: String {
        switch kind {
        case .video:
            return "Kalıbı öğren, sonra o kalıbı film sahnelerinde gör. İlk kalıbı bitirince ilk setin açılır."
        case .words:
            return "Bir kalıbı bitirince o kalıbın ve sahnelerinin en sık kelimeleri burada olacak."
        }
    }
}

/// The next pattern of the path, whose set opens once it is done.
struct NextPatternCard: View {
    let pattern: Pattern
    let onTap: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); onTap() }) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .strokeBorder(Theme.Color.border, lineWidth: 1.5)
                        .frame(width: 48, height: 48)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("SIRADAKİ KALIP")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(Theme.Color.textMuted)
                    Text(pattern.titleTr)
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text("Bu kalıbı bitirince seti açılır")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.Color.textMuted)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.Color.backgroundCard.opacity(0.6)))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [5, 5])),
            )
        }
        .buttonStyle(.pressable(scale: 0.98))
    }
}

/// The speed-ordered sets wait until the path is done.
struct FreeWatchLockedRow: View {
    let done: Int
    let total: Int

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.textMuted)
            Text("Tüm kalıpları bitirince bütün setler açılır")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.textSecondary)
            Spacer(minLength: 4)
            Text("\(done) / \(total)")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textMuted)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.Color.backgroundCard.opacity(0.5)))
    }
}

extension VideoSet {
    /// A pattern set as the app shows it: the pattern's own Turkish title
    /// and a line on what the set is for.
    func asPatternSet(_ pattern: Pattern) -> VideoSet {
        VideoSet(id: id, title: title, titleTr: pattern.titleTr,
                 description: description,
                 descriptionTr: "Bu kalıbın geçtiği sahneler. Hedef cümleler işaretli, önceki kalıpların da.",
                 difficulty: "pattern", sortOrder: sortOrder, videos: videos, patternId: patternId, words: words)
    }

    /// Lines across the set's scenes that use its pattern.
    var targetLineCount: Int { videos.reduce(0) { $0 + ($1.targetLines ?? 0) } }
}
