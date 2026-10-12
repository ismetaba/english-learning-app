import SwiftUI

struct LoadingState: View {
    var label: String? = nil

    var body: some View {
        VStack(spacing: 16) {
            PulsingOrb()
                .frame(width: 80, height: 80)
            if let label = label {
                Text(label)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Color.background)
    }
}

struct PulsingOrb: View {
    @State private var scale: CGFloat = 0.7
    @State private var opacity: Double = 0.3

    var body: some View {
        ZStack {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Theme.Color.primary.opacity(0.4 - Double(i) * 0.12))
                    .scaleEffect(scale + CGFloat(i) * 0.15)
                    .opacity(opacity)
            }
            Circle()
                .fill(LinearGradient(
                    colors: [Theme.Color.primary, Theme.Color.primaryDark],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 24, height: 24)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                scale = 1.0
                opacity = 0.8
            }
        }
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var action: (label: String, run: () -> Void)? = nil

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Theme.Color.primarySoft)
                    .frame(width: 88, height: 88)
                Image(systemName: icon)
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(Theme.Color.primary)
            }
            Text(title)
                .font(Theme.Font.headline(17, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            if let action = action {
                PrimaryButton(title: action.label, style: .primary, fullWidth: false, action: action.run)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

struct ErrorState: View {
    let message: String
    var onRetry: (() -> Void)? = nil
    /// Optional second way forward, shown as a plain text button under the
    /// retry (e.g. "Sonraki videoya geç").
    var secondary: (label: String, run: () -> Void)? = nil

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Theme.Color.errorSoft)
                    .frame(width: 88, height: 88)
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(Theme.Color.error)
            }
            Text("Bir sorun oluştu")
                .font(Theme.Font.headline(17, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
            Text(shownMessage)
                .font(Theme.Font.body(14))
                .foregroundStyle(Theme.Color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            if let onRetry = onRetry {
                PrimaryButton(title: "Tekrar dene", icon: "arrow.clockwise",
                              style: .secondary, fullWidth: false, action: onRetry)
            }
            if let secondary = secondary {
                Button {
                    Haptics.light()
                    secondary.run()
                } label: {
                    Text(secondary.label)
                        .font(Theme.Font.body(14, weight: .semibold))
                        .foregroundStyle(Theme.Color.textSecondary)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 16)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    /// Error texts end in "Tekrar dene." for screens without a button;
    /// right above the "Tekrar dene" button that would say it twice.
    private var shownMessage: String {
        let suffix = " Tekrar dene."
        guard onRetry != nil, message.hasSuffix(suffix) else { return message }
        return String(message.dropLast(suffix.count))
    }
}
