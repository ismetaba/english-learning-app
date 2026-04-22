import SwiftUI

// MARK: - Card container

struct CardBackground: ViewModifier {
    var padding: CGFloat = Theme.Space.xl
    var cornerRadius: CGFloat = Theme.Radius.lg
    var borderColor: Color = Theme.Color.border
    var fill: Color = Theme.Color.backgroundCard

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1)
            )
    }
}

extension View {
    func card(
        padding: CGFloat = Theme.Space.xl,
        cornerRadius: CGFloat = Theme.Radius.lg,
        border: Color = Theme.Color.border,
        fill: Color = Theme.Color.backgroundCard
    ) -> some View {
        modifier(CardBackground(padding: padding, cornerRadius: cornerRadius, borderColor: border, fill: fill))
    }
}

// MARK: - Shadow presets

struct PremiumShadow: ViewModifier {
    enum Variant { case small, card, button(Color), glow(Color) }
    let variant: Variant

    func body(content: Content) -> some View {
        switch variant {
        case .small:
            content.shadow(color: .black.opacity(0.35), radius: 8, x: 0, y: 4)
        case .card:
            content.shadow(color: .black.opacity(0.5), radius: 18, x: 0, y: 8)
        case .button(let color):
            content.shadow(color: color.opacity(0.55), radius: 16, x: 0, y: 6)
        case .glow(let color):
            content.shadow(color: color.opacity(0.45), radius: 20, x: 0, y: 2)
        }
    }
}

extension View {
    func premiumShadow(_ variant: PremiumShadow.Variant = .card) -> some View {
        modifier(PremiumShadow(variant: variant))
    }
}

// MARK: - Haptics

enum Haptics {
    static func light() {
        let gen = UIImpactFeedbackGenerator(style: .light)
        gen.impactOccurred()
    }
    static func medium() {
        let gen = UIImpactFeedbackGenerator(style: .medium)
        gen.impactOccurred()
    }
    static func soft() {
        let gen = UIImpactFeedbackGenerator(style: .soft)
        gen.impactOccurred()
    }
    static func selection() {
        let gen = UISelectionFeedbackGenerator()
        gen.selectionChanged()
    }
    static func success() {
        let gen = UINotificationFeedbackGenerator()
        gen.notificationOccurred(.success)
    }
    static func error() {
        let gen = UINotificationFeedbackGenerator()
        gen.notificationOccurred(.error)
    }
}

// MARK: - Pressable scaling button

struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1.0)
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { .init() }
    static func pressable(scale: CGFloat) -> PressableStyle { .init(scale: scale) }
}

// MARK: - Hidden helper

extension View {
    @ViewBuilder
    func hidden(_ hidden: Bool) -> some View {
        if hidden { self.hidden() } else { self }
    }
}
