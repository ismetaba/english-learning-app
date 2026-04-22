import SwiftUI

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var trailing: String? = nil
    var icon: String? = nil
    var iconColor: Color = Theme.Color.primary

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if let icon = icon {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                        .fill(iconColor.opacity(0.15))
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(iconColor)
                }
                .frame(width: 34, height: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.Font.title(20, weight: .heavy))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.4)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
            Spacer(minLength: 4)
            if let trailing = trailing {
                Text(trailing)
                    .font(Theme.Font.caption(12))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.Color.backgroundElevated, in: Capsule())
            }
        }
    }
}

struct ScreenTitle: View {
    let title: String
    var subtitle: String? = nil
    var icon: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let icon = icon {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.Color.primary)
            }
            Text(title)
                .font(Theme.Font.display(32))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.6)
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
            }
        }
    }
}

struct Chip: View {
    let label: String
    var color: Color = Theme.Color.primary
    var filled: Bool = true

    var body: some View {
        Text(label)
            .font(Theme.Font.caption(11, weight: .bold))
            .tracking(0.4)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(filled ? color : color.opacity(0.9))
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xs, style: .continuous)
                    .fill(color.opacity(0.15))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xs, style: .continuous)
                    .strokeBorder(color.opacity(0.3), lineWidth: 1)
            )
    }
}

struct ProgressBar: View {
    let percent: Double
    var height: CGFloat = 6
    var color: Color = Theme.Color.primary
    var track: Color = Theme.Color.backgroundSurface
    var animated: Bool = true

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule()
                    .fill(LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .leading,
                        endPoint: .trailing
                    ))
                    .frame(width: max(0, min(geo.size.width, geo.size.width * percent / 100)))
                    .animation(animated ? .spring(response: 0.5, dampingFraction: 0.8) : nil,
                               value: percent)
            }
        }
        .frame(height: height)
    }
}
