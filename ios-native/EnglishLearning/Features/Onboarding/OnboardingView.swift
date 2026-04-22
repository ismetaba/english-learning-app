import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @State private var step: Int = 0
    @State private var selectedLevel: OnboardingLevel = .beginner
    @State private var selectedGoal: LearningGoal = .personal
    @State private var dailyMinutes: Int = 10

    private let totalSteps = 4

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
                topBar
                    .padding(.top, 12)
                    .padding(.horizontal, 20)

                Group {
                    switch step {
                    case 0: languageStep
                    case 1: levelStep
                    case 2: goalStep
                    default: minutesStep
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))

                bottomBar
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: step)
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 8) {
            if step > 0 {
                Button {
                    Haptics.selection()
                    step -= 1
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Color.textSecondary)
                        .frame(width: 40, height: 40)
                        .background(Theme.Color.backgroundCard, in: Circle())
                        .overlay(Circle().strokeBorder(Theme.Color.border, lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                ForEach(0..<totalSteps, id: \.self) { i in
                    Capsule()
                        .fill(i <= step ? Theme.Color.primary : Theme.Color.backgroundSurface)
                        .frame(width: i == step ? 28 : 10, height: 6)
                        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: step)
                }
            }
            Spacer(minLength: 0)
            Text("\(step + 1)/\(totalSteps)")
                .font(Theme.Font.caption(12, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
                .frame(minWidth: 40, alignment: .trailing)
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        VStack(spacing: 12) {
            PrimaryButton(
                title: step == totalSteps - 1 ? appState.t.t("startLearning") : appState.t.t("continue"),
                icon: step == totalSteps - 1 ? "sparkles" : "chevron.right",
                style: .primary
            ) {
                advance()
            }
        }
    }

    private func advance() {
        if step < totalSteps - 1 {
            step += 1
        } else {
            Haptics.success()
            appState.completeOnboarding(
                level: selectedLevel,
                goal: selectedGoal,
                minutes: dailyMinutes
            )
        }
    }

    // MARK: - Step 1: language

    private var languageStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            stepHeader(
                emoji: "👋",
                title: appState.t.t("welcome"),
                subtitle: appState.t.t("chooseLanguage")
            )
            VStack(spacing: 10) {
                ForEach(NativeLanguage.allCases) { lang in
                    Button {
                        Haptics.selection()
                        appState.nativeLanguage = lang
                    } label: {
                        HStack(spacing: 14) {
                            Text(lang.flag)
                                .font(.system(size: 30))
                            Text(lang.displayName)
                                .font(Theme.Font.headline(17, weight: .semibold))
                                .foregroundStyle(Theme.Color.textPrimary)
                            Spacer()
                            if appState.nativeLanguage == lang {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 22, weight: .bold))
                                    .foregroundStyle(Theme.Color.primary)
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background {
                            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                                .fill(appState.nativeLanguage == lang ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
                        }
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                                .strokeBorder(appState.nativeLanguage == lang ? Theme.Color.primary : Theme.Color.border, lineWidth: 1.5)
                        )
                    }
                    .buttonStyle(.pressable)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    // MARK: - Step 2: level

    private var levelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            stepHeader(
                emoji: "🎯",
                title: appState.t.t("whatsYourLevel"),
                subtitle: "Tell us where to start"
            )
            VStack(spacing: 12) {
                levelRow(.beginner, emoji: "🌱", title: appState.t.t("levelBeginner"),
                         sub: "Just starting out")
                levelRow(.elementary, emoji: "📗", title: appState.t.t("levelElementary"),
                         sub: "I know some basics")
                levelRow(.intermediate, emoji: "📘", title: appState.t.t("levelIntermediate"),
                         sub: "I can hold conversations")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
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
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
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
        }
        .buttonStyle(.pressable)
    }

    // MARK: - Step 3: goal

    private var goalStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            stepHeader(
                emoji: "⭐️",
                title: appState.t.t("whatsYourGoal"),
                subtitle: "We'll tailor your plan"
            )
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                goalTile(.travel, emoji: "✈️", title: appState.t.t("goalTravel"))
                goalTile(.work, emoji: "💼", title: appState.t.t("goalWork"))
                goalTile(.school, emoji: "🎓", title: appState.t.t("goalSchool"))
                goalTile(.personal, emoji: "🌟", title: appState.t.t("goalPersonal"))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func goalTile(_ goal: LearningGoal, emoji: String, title: String) -> some View {
        let selected = selectedGoal == goal
        return Button {
            Haptics.selection()
            selectedGoal = goal
        } label: {
            VStack(spacing: 14) {
                Text(emoji).font(.system(size: 40))
                Text(title)
                    .font(Theme.Font.headline(15, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .fill(selected ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(selected ? Theme.Color.primary : Theme.Color.border, lineWidth: 2)
            )
        }
        .buttonStyle(.pressable)
    }

    // MARK: - Step 4: minutes

    private var minutesStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            stepHeader(
                emoji: "⏰",
                title: appState.t.t("chooseDailyGoal"),
                subtitle: appState.t.t("minutesPerDay")
            )
            VStack(spacing: 10) {
                ForEach([5, 10, 15, 20, 30], id: \.self) { m in
                    minutesRow(m)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func minutesRow(_ minutes: Int) -> some View {
        let selected = dailyMinutes == minutes
        let labels: [Int: String] = [
            5: "Casual",
            10: "Regular",
            15: "Serious",
            20: "Intense",
            30: "Hardcore"
        ]
        return Button {
            Haptics.selection()
            dailyMinutes = minutes
        } label: {
            HStack(spacing: 16) {
                Text("\(minutes)")
                    .font(Theme.Font.display(28, weight: .heavy))
                    .foregroundStyle(selected ? Theme.Color.primary : Theme.Color.textPrimary)
                    .frame(width: 64, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(minutes) min / day")
                        .font(Theme.Font.headline(15, weight: .bold))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text(labels[minutes] ?? "")
                        .font(Theme.Font.body(13))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Theme.Color.primary)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(selected ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(selected ? Theme.Color.primary : Theme.Color.border, lineWidth: 1.5)
            )
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
                .font(Theme.Font.body(15))
                .foregroundStyle(Theme.Color.textSecondary)
        }
    }
}
