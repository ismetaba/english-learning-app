import SwiftUI

// MARK: - Pattern intro screen
//
// First step of a kalıp: short formula + brief Turkish hook + a couple
// of preview examples (with per-word TR). The "Akış'a başla" CTA hands
// off to `PatternFlowView`, where the user actually internalizes the
// pattern by scrolling through example sentences and (later) movie clips.

struct PatternIntroView: View {
    @EnvironmentObject var appState: AppState
    let pattern: Pattern

    @State private var showFlow = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    heroCard
                    introCard
                    if let tip = pattern.tipTr {
                        tipCard(tip)
                    }
                    // Clears the floating tab bar + sticky CTA
                    Spacer().frame(height: 200)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }

            // Sticky bottom CTA
            VStack(spacing: 0) {
                Spacer()
                stickyCTA
            }
            .ignoresSafeArea(.keyboard)
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(pattern.familyTr.uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(Theme.Color.textMuted)
                    Text(pattern.titleTr)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.textPrimary)
                        .lineLimit(1)
                }
            }
        }
        .toolbarBackground(Theme.Color.background, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showFlow) {
            PatternFlowView(pattern: pattern)
                .environmentObject(appState)
        }
    }

    // MARK: - Hero (formula)

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                Image(systemName: "function")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
                Text("KALIP")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.accent)
                Spacer()
                Text(pattern.titleEn)
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.textMuted)
            }

            Text(pattern.titleTr)
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.4)

            FormulaRow(tokens: pattern.formula, size: 15)
                .padding(.top, 4)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.Color.accent.opacity(0.25), lineWidth: 1)
        )
    }

    // MARK: - Short Turkish intro

    private var introCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "text.bubble")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.Color.primary)
                Text("ÖZET")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.primary)
                Spacer()
            }
            Text(pattern.introTr)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }

    // MARK: - Tip

    private func tipCard(_ tip: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.xp)
                Text("DİKKAT")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.xp)
                Spacer()
            }
            Text(tip)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.xpGlow)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Theme.Color.xp.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Sticky CTA

    private var stickyCTA: some View {
        let count = pattern.examples.count
        return VStack(spacing: 0) {
            Rectangle()
                .fill(LinearGradient(
                    colors: [Theme.Color.background.opacity(0), Theme.Color.background],
                    startPoint: .top, endPoint: .bottom
                ))
                .frame(height: 24)
                .allowsHitTesting(false)
            VStack(spacing: 8) {
                PrimaryButton(
                    title: "Akış'a başla",
                    icon: "play.fill",
                    style: .primary,
                    fullWidth: true
                ) {
                    Haptics.medium()
                    showFlow = true
                }
                Text("\(count) örnek + video akışı")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.textMuted)
                    .textCase(.uppercase)
            }
            .padding(.horizontal, 20)
            // Lift above MainTabView's floating tab bar (~88pt + safe area).
            .padding(.bottom, 120)
            .padding(.top, 8)
            .background(Theme.Color.background)
        }
    }
}
