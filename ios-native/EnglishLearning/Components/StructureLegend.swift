import SwiftUI

/// The key to the 3-colour sentence structure: özne (subject) blue · fiil
/// (verb) green · tamamlayıcı (the rest) lavender. Colours and labels come
/// from `PatternSlotKind`, so every screen that colours sentences agrees.
///
/// `compact` (players): small dots and lowercase labels on one quiet line.
/// Otherwise (Kalıplar): bordered chips with uppercase labels.
struct StructureLegend: View {
    var compact: Bool = true

    private static let kinds: [PatternSlotKind] = [.subject, .verb, .rest]
    /// Uppercasing Turkish needs the Turkish locale ("fiil" → "FİİL").
    private static let turkish = Locale(identifier: "tr_TR")

    var body: some View {
        Group {
            if compact {
                compactKey
            } else {
                chipKey
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Renkler: özne mavi, fiil yeşil, tamamlayıcı lila")
    }

    private var compactKey: some View {
        HStack(spacing: 6) {
            ForEach(Array(Self.kinds.enumerated()), id: \.offset) { i, kind in
                if i > 0 {
                    Text("·")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                HStack(spacing: 4) {
                    Circle()
                        .fill(kind.color)
                        .frame(width: 7, height: 7)
                    Text(kind.labelTr)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
            }
        }
        .lineLimit(1)
    }

    private var chipKey: some View {
        HStack(spacing: 10) {
            ForEach(Self.kinds, id: \.self) { kind in
                chip(kind)
            }
            Spacer(minLength: 0)
        }
    }

    private func chip(_ kind: PatternSlotKind) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(kind.color)
                .frame(width: 7, height: 7)
            Text(kind.labelTr.uppercased(with: Self.turkish))
                .font(.system(size: 11, weight: .heavy))
                .tracking(0.4)
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(Theme.Color.backgroundCard.opacity(0.7))
        )
        .overlay(
            Capsule().strokeBorder(kind.color.opacity(0.4), lineWidth: 1)
        )
    }
}
