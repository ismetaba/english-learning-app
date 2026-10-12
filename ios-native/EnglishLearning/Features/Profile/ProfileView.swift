import SwiftUI

/// What the learner has done so far, counted plainly: no XP, levels or
/// rewards — the counts are the whole story.
struct ProfileView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundAmbience()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 22) {
                        header
                        statsGrid
                        aboutCard
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 58)
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(Theme.Color.backgroundElevated)
                Circle().strokeBorder(Theme.Color.border, lineWidth: 1)
                Image(systemName: "person.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Theme.Color.primary)
            }
            .frame(width: 88, height: 88)

            Text("İlerlemem")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.2)
        }
    }

    // MARK: - Stats grid

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ProfileStat(
                icon: "film.fill",
                value: appState.progress.watchedVideos.count,
                label: "İZLENEN VİDEO",
                color: Theme.Color.primary
            )
            ProfileStat(
                icon: "character.book.closed.fill",
                value: appState.progress.learnedWords.count,
                label: "EKLENEN KELİME",
                color: Theme.Color.accent
            )
            ProfileStat(
                icon: "puzzlepiece.fill",
                value: appState.completedPatterns.count,
                label: "TAMAMLANAN KALIP",
                color: Theme.Color.levelElementary
            )
            ProfileStat(
                icon: "calendar",
                value: appState.progress.streak,
                label: "GÜN ÜST ÜSTE",
                color: Theme.Color.levelIntermediate
            )
        }
    }

    // MARK: - About

    /// The build's own version, so a demo device shows what it runs.
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "–"
    }

    private var aboutCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.primary)
            Text("English Learning · Sürüm \(appVersion)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Theme.Color.textMuted)
            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.5))
        )
    }
}

/// One counter. `label` arrives already uppercased: Turkish capitals
/// (İ, I) don't survive a locale-blind `.textCase(.uppercase)`.
struct ProfileStat: View {
    let icon: String
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(color.opacity(0.2))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(color)
                }
                .frame(width: 40, height: 40)
                Spacer()
            }
            Text("\(value)")
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .monospacedDigit()
            Text(label)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textSecondary)
                .tracking(0.6)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}
