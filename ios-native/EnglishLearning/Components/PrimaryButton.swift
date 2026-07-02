import SwiftUI

struct PrimaryButton: View {
    enum Style { case primary, secondary, ghost, destructive, success }

    let title: String
    var icon: String? = nil
    var style: Style = .primary
    var fullWidth: Bool = true
    var loading: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.medium()
            action()
        } label: {
            HStack(spacing: 10) {
                if loading {
                    ProgressView().tint(foreground)
                } else if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .bold))
                }
                Text(title)
                    .font(Theme.Font.headline(16, weight: .bold))
                    .tracking(-0.2)
            }
            .foregroundStyle(foreground)
            .padding(.vertical, 16)
            .padding(.horizontal, 24)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(backgroundView)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: borderWidth)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .opacity(disabled ? 0.5 : 1.0)
        }
        .buttonStyle(.pressable)
        .disabled(disabled || loading)
        .premiumShadow(shadowVariant)
    }

    @ViewBuilder private var backgroundView: some View {
        switch style {
        case .primary:
            LinearGradient(
                colors: [Theme.Color.primary, Theme.Color.primaryDark],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .success:
            LinearGradient(
                colors: [Theme.Color.success, Theme.Color.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .secondary:
            Theme.Color.backgroundElevated
        case .ghost:
            Color.clear
        case .destructive:
            Theme.Color.errorSoft
        }
    }

    private var foreground: Color {
        switch style {
        case .primary, .success: return .white
        case .secondary: return Theme.Color.textPrimary
        case .ghost: return Theme.Color.primary
        case .destructive: return Theme.Color.error
        }
    }

    private var borderColor: Color {
        switch style {
        case .primary, .success: return .clear
        case .secondary: return Theme.Color.border
        case .ghost: return Theme.Color.borderAccent
        case .destructive: return Theme.Color.error.opacity(0.35)
        }
    }

    private var borderWidth: CGFloat {
        switch style {
        case .primary, .success: return 0
        case .secondary: return 1
        case .ghost: return 1.5
        case .destructive: return 1
        }
    }

    private var shadowVariant: PremiumShadow.Variant {
        switch style {
        case .primary: return .button(Theme.Color.primary)
        case .success: return .button(Theme.Color.success)
        default: return .small
        }
    }
}
