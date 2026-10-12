import SwiftUI

/// Shown in place of a video that can't play (removed, embedding blocked,
/// never loaded). Replaces the old behaviour — an endless black frame — with
/// the reason, a retry, and in flows that have a next item, a skip that
/// fires by itself after a short countdown so the session keeps moving.
struct PlayerErrorOverlay: View {
    let message: String
    var onRetry: (() -> Void)? = nil
    var onSkip: (() -> Void)? = nil
    var skipLabel: String = "Sonrakine geç"
    /// Seconds before `onSkip` fires on its own; nil disables the countdown.
    var autoSkipAfter: Int? = nil

    @State private var remaining: Int = 0
    @State private var countdown: Task<Void, Never>? = nil

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Theme.Color.warning)
            Text("Bu video şu an oynatılamıyor")
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            HStack(spacing: 10) {
                if let onRetry {
                    Button {
                        Haptics.light()
                        cancelCountdown()
                        onRetry()
                    } label: {
                        Label("Tekrar dene", systemImage: "arrow.clockwise")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Capsule().fill(Color.white.opacity(0.14)))
                            .overlay(Capsule().strokeBorder(Color.white.opacity(0.25), lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                }
                if let onSkip {
                    Button {
                        Haptics.medium()
                        cancelCountdown()
                        onSkip()
                    } label: {
                        HStack(spacing: 6) {
                            Text(remaining > 0 ? "\(skipLabel) (\(remaining))" : skipLabel)
                                .font(.system(size: 13, weight: .bold))
                                .monospacedDigit()
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Theme.Color.primary))
                    }
                    .buttonStyle(.pressable)
                }
            }
            .padding(.top, 4)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.88))
        .onAppear(perform: startCountdown)
        .onDisappear(perform: cancelCountdown)
    }

    private func startCountdown() {
        guard let seconds = autoSkipAfter, seconds > 0, let onSkip else { return }
        cancelCountdown()
        remaining = seconds
        countdown = Task { @MainActor in
            while remaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                remaining -= 1
            }
            onSkip()
        }
    }

    private func cancelCountdown() {
        countdown?.cancel()
        countdown = nil
        remaining = 0
    }
}
