import SwiftUI

/// First launch: one Turkish question, then straight into the app. The
/// old language, goal and daily-minutes steps are gone — Turkish is the
/// only UI language and nothing ever read the other two answers.
struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedLevel: OnboardingLevel = .beginner

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.Color.background, Theme.Color.backgroundElevated],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ).ignoresSafeArea()

            // Decorative blobs
            Circle()
                .fill(Theme.Color.primary.opacity(0.18))
                .blur(radius: 80)
                .frame(width: 320, height: 320)
                .offset(x: -150, y: -300)
            Circle()
                .fill(Theme.Color.accent.opacity(0.12))
                .blur(radius: 80)
                .frame(width: 260, height: 260)
                .offset(x: 170, y: 320)

            VStack(spacing: 0) {
                ScrollView(showsIndicators: false) {
                    levelStep
                        .padding(.top, 40)
                        .padding(.bottom, 24)
                }

                PrimaryButton(
                    title: "Öğrenmeye başla",
                    icon: "sparkles",
                    style: .primary
                ) {
                    finish()
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
    }

    private func finish() {
        Haptics.success()
        // Goal and minutes keep their old defaults so the stored progress
        // looks the same as before; no screen reads them.
        appState.completeOnboarding(
            level: selectedLevel,
            goal: .personal,
            minutes: 10
        )
    }

    // MARK: - Level

    private var levelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            stepHeader(
                emoji: "👋",
                title: "Hoş geldin",
                subtitle: "Nereden başlayalım?"
            )
            VStack(spacing: 12) {
                levelRow(.beginner, emoji: "🌱", title: "Başlangıç",
                         sub: "Yeni başlıyorum")
                levelRow(.elementary, emoji: "📗", title: "Temel",
                         sub: "Temelleri biliyorum")
                levelRow(.intermediate, emoji: "📘", title: "Orta",
                         sub: "Sohbet edebiliyorum")
                speedNote
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 20)
    }

    /// What the answer changes (`AppState.completeOnboarding` sets the
    /// starting speed from it), said where it's chosen.
    private var speedNote: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "speedometer")
            Text(selectedLevel.suggestedPlaybackRate == 1.0
                 ? "Videolar normal hızda başlar; videodaki “Hız” ile değiştirebilirsin."
                 : "Videolar biraz yavaş başlar; videodaki “Hız” ile değiştirebilirsin.")
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(Theme.Font.body(13))
        .foregroundStyle(Theme.Color.textMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func levelRow(_ level: OnboardingLevel, emoji: String, title: String, sub: String) -> some View {
        let selected = selectedLevel == level
        return Button {
            Haptics.selection()
            selectedLevel = level
        } label: {
            HStack(spacing: 16) {
                Text(emoji).font(.system(size: 36))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Theme.Font.headline(17, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text(sub)
                        .font(Theme.Font.body(14))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Theme.Color.primary)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(selected ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(selected ? Theme.Color.primary : Theme.Color.border, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
    }

    // MARK: - Shared

    private func stepHeader(emoji: String, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(emoji).font(.system(size: 56))
            Text(title)
                .font(Theme.Font.display(30))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle)
                .font(Theme.Font.body(17, weight: .semibold))
                .foregroundStyle(Theme.Color.textSecondary)
        }
    }
}
