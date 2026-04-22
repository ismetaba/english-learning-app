import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundAmbience()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 22) {
                        avatarHero
                        levelProgressCard
                        statsGrid
                        weeklyChart
                        languageSection
                        aboutCard
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 58)
                }
            }
        }
    }

    // MARK: - Avatar hero

    private var avatarHero: some View {
        let level = appState.levelInfo
        return VStack(spacing: 14) {
            ZStack {
                // Progress ring
                Circle()
                    .stroke(Theme.Color.border, lineWidth: 4)
                    .frame(width: 112, height: 112)
                Circle()
                    .trim(from: 0, to: CGFloat(level.percent / 100))
                    .stroke(Theme.Color.primary,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 112, height: 112)

                // Avatar
                ZStack {
                    Circle().fill(Theme.Color.backgroundElevated)
                    Circle().strokeBorder(Theme.Color.border, lineWidth: 1)
                    Image(systemName: "person.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(Theme.Color.primary)
                }
                .frame(width: 96, height: 96)
            }
            .frame(height: 120)

            VStack(spacing: 2) {
                Text(level.name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.2)
                Text("Level \(level.level)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.textMuted)
            }
        }
    }

    private var levelProgressCard: some View {
        let level = appState.levelInfo
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .foregroundStyle(Theme.Color.xp)
                        Text("\(appState.progress.xp)")
                            .font(.system(size: 32, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.Color.textPrimary)
                        Text("XP")
                            .font(.system(size: 14, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.Color.textMuted)
                            .offset(y: 4)
                    }
                    Text("\(level.next - appState.progress.xp) XP to reach Level \(level.level + 1)")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(Theme.Color.textSecondary)
                }
                Spacer()
                Image(systemName: "trophy.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Theme.Color.xp, Theme.Color.warning],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            }
            ProgressBar(percent: level.percent, height: 10, color: Theme.Color.primary)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial.opacity(0.7))
        )
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Theme.Color.primaryGlow, lineWidth: 1)
        )
    }

    // MARK: - Stats grid

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ProfileStat(
                icon: "book.closed.fill",
                value: "\(appState.progress.completedLessons.count)",
                label: appState.t.t("structures"),
                color: Theme.Color.primary
            )
            ProfileStat(
                icon: "character.book.closed.fill",
                value: "\(appState.progress.learnedWords.count)",
                label: appState.t.t("words"),
                color: Theme.Color.accent
            )
            ProfileStat(
                icon: "film.fill",
                value: "\(appState.progress.watchedClips.count)",
                label: "Clips",
                color: Theme.Color.levelElementary
            )
            ProfileStat(
                icon: "flame.fill",
                value: "\(appState.progress.streak)",
                label: appState.t.t("dayStreak"),
                color: Theme.Color.streak,
                highlight: true
            )
        }
    }

    // MARK: - Weekly chart

    private var weeklyChart: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Last 7 days")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text("Daily activity")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer()
                Image(systemName: "chart.bar.xaxis")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.Color.warning)
            }
            let data = lastNDays(7)
            let maxVal = max(1, data.map(\.minutes).max() ?? 1)
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(Array(data.enumerated()), id: \.offset) { i, day in
                    VStack(spacing: 6) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Theme.Color.backgroundSurface.opacity(0.5))
                                .frame(height: 84)
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [Theme.Color.primary, Theme.Color.accent],
                                        startPoint: .top, endPoint: .bottom
                                    )
                                )
                                .frame(height: max(6, CGFloat(day.minutes / maxVal * 84)))
                        }
                        Text(day.label)
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .foregroundStyle(i == data.count - 1 ? Theme.Color.primary : Theme.Color.textMuted)
                    }
                }
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }

    private func lastNDays(_ n: Int) -> [(label: String, minutes: Double)] {
        let cal = Calendar(identifier: .iso8601)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(secondsFromGMT: 0)
        let d = DateFormatter(); d.dateFormat = "E"
        var out: [(String, Double)] = []
        for offset in stride(from: n - 1, through: 0, by: -1) {
            guard let day = cal.date(byAdding: .day, value: -offset, to: Date()) else { continue }
            let iso = f.string(from: day)
            let label = d.string(from: day).prefix(1)
            let total = appState.progress.sessionHistory.filter { $0.date == iso }
                .reduce(0) { $0 + $1.minutesWatched }
            out.append((String(label), total))
        }
        return out.map { (label: $0.0, minutes: $0.1) }
    }

    // MARK: - Language section

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Native language")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.Color.textPrimary)
                    Text("Translations shown in your language")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(Theme.Color.textMuted)
                }
                Spacer()
                Image(systemName: "globe")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.Color.accent)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(NativeLanguage.allCases) { lang in
                    Button {
                        Haptics.selection()
                        appState.nativeLanguage = lang
                    } label: {
                        LanguageTile(lang: lang, selected: appState.nativeLanguage == lang)
                    }
                    .buttonStyle(.pressable)
                }
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Theme.Color.border, lineWidth: 1)
        )
    }

    // MARK: - About

    private var aboutCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.primary)
            Text("English Learning · v1.0")
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

struct ProfileStat: View {
    let icon: String
    let value: String
    let label: String
    let color: Color
    var highlight: Bool = false

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
            Text(value)
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(highlight ? color : Theme.Color.textPrimary)
            Text(label)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Theme.Color.backgroundCard.opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(highlight ? color.opacity(0.5) : Theme.Color.border, lineWidth: highlight ? 1.5 : 1)
        )
    }
}

struct LanguageTile: View {
    let lang: NativeLanguage
    let selected: Bool

    var body: some View {
        VStack(spacing: 8) {
            Text(lang.flag)
                .font(.system(size: 32))
            Text(lang.displayName)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(selected ? Theme.Color.primary : Theme.Color.textSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(selected ? Theme.Color.primarySoft : Theme.Color.backgroundElevated)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(selected ? Theme.Color.primary : Theme.Color.border, lineWidth: selected ? 1.5 : 1)
        )
    }
}
