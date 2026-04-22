import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var showLanguageSheet = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 24) {
                        title
                        xpHero
                        statsGrid
                        sessionSummary
                        languageSection
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                }
            }
        }
    }

    private var title: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Text(appState.t.t("profile"))
                    .font(Theme.Font.display(30))
                    .foregroundStyle(Theme.Color.textPrimary)
                    .tracking(-0.5)
                Text("Your progress at a glance")
                    .font(Theme.Font.body(14))
                    .foregroundStyle(Theme.Color.textSecondary)
            }
            Spacer()
        }
        .padding(.top, 48)
    }

    private var xpHero: some View {
        let level = appState.levelInfo
        return ZStack(alignment: .topTrailing) {
            VStack(spacing: 18) {
                HStack(alignment: .center, spacing: 18) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(appState.progress.xp)")
                            .font(Theme.Font.display(46, weight: .heavy))
                            .foregroundStyle(Theme.Color.textPrimary)
                            .tracking(-1.0)
                        Text(appState.t.t("totalExperience"))
                            .font(Theme.Font.body(13))
                            .foregroundStyle(Theme.Color.textSecondary)
                    }
                    Spacer()
                    ZStack {
                        Circle()
                            .strokeBorder(Theme.Color.primary.opacity(0.3), lineWidth: 6)
                            .frame(width: 66, height: 66)
                        Circle()
                            .trim(from: 0, to: CGFloat(level.percent / 100))
                            .stroke(LinearGradient(
                                colors: [Theme.Color.primary, Theme.Color.accent],
                                startPoint: .leading,
                                endPoint: .trailing
                            ), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: 66, height: 66)
                        Text("\(level.level)")
                            .font(Theme.Font.display(24, weight: .heavy))
                            .foregroundStyle(Theme.Color.primary)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(level.name)
                            .font(Theme.Font.headline(15, weight: .bold))
                            .foregroundStyle(Theme.Color.textPrimary)
                        Spacer()
                        Text("\(Int(level.percent))%")
                            .font(Theme.Font.headline(14, weight: .bold))
                            .foregroundStyle(Theme.Color.textSecondary)
                    }
                    ProgressBar(percent: level.percent, height: 8, color: Theme.Color.success)
                    Text("\(appState.progress.xp - level.current) / \(level.next - level.current) XP to next level")
                        .font(Theme.Font.caption(11, weight: .semibold))
                        .foregroundStyle(Theme.Color.textMuted)
                }
            }
            .padding(22)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Color.backgroundElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .strokeBorder(Theme.Color.primaryGlow, lineWidth: 1.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
            .background(
                ZStack {
                    Circle()
                        .fill(Theme.Color.primary.opacity(0.2))
                        .blur(radius: 40)
                        .frame(width: 180, height: 180)
                        .offset(x: 120, y: -80)
                        .allowsHitTesting(false)
                    Circle()
                        .fill(Theme.Color.accent.opacity(0.15))
                        .blur(radius: 40)
                        .frame(width: 130, height: 130)
                        .offset(x: -80, y: 80)
                        .allowsHitTesting(false)
                }
            )
            .premiumShadow(.card)
        }
    }

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
                color: Theme.Color.success
            )
            ProfileStat(
                icon: "film.fill",
                value: "\(appState.progress.watchedScenes.count)",
                label: appState.t.t("scenes"),
                color: Theme.Color.accent
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

    private var sessionSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "Last 7 days",
                subtitle: "Minutes per day",
                icon: "chart.bar.fill",
                iconColor: Theme.Color.warning
            )

            let data = lastNDays(7)
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(data.enumerated()), id: \.offset) { _, day in
                    VStack(spacing: 8) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(Theme.Color.backgroundCard)
                                .frame(height: 80)
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(LinearGradient(
                                    colors: [Theme.Color.primary, Theme.Color.accent],
                                    startPoint: .top,
                                    endPoint: .bottom
                                ))
                                .frame(height: max(6, CGFloat(day.minutes * 6)))
                                .animation(.spring(response: 0.4, dampingFraction: 0.7), value: day.minutes)
                        }
                        Text(day.label)
                            .font(Theme.Font.caption(10, weight: .bold))
                            .foregroundStyle(Theme.Color.textMuted)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(Theme.Color.backgroundElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(Theme.Color.border, lineWidth: 1)
            )
        }
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
            let total = appState.progress.sessionHistory
                .filter { $0.date == iso }
                .reduce(0) { $0 + $1.minutesWatched }
            out.append((String(label), total))
        }
        return out.map { (label: $0.0, minutes: $0.1) }
    }

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: appState.t.t("nativeLanguage"),
                subtitle: "Translations shown in your language",
                icon: "globe",
                iconColor: Theme.Color.accent
            )
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
    }
}

struct ProfileStat: View {
    let icon: String
    let value: String
    let label: String
    let color: Color
    var highlight: Bool = false

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(color.opacity(0.18))
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(color)
            }
            .frame(width: 48, height: 48)
            Text(value)
                .font(Theme.Font.display(28, weight: .heavy))
                .foregroundStyle(highlight ? color : Theme.Color.textPrimary)
            Text(label)
                .font(Theme.Font.caption(11, weight: .bold))
                .foregroundStyle(Theme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .fill(Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
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
                .font(.system(size: 34))
            Text(lang.displayName)
                .font(Theme.Font.caption(12, weight: .bold))
                .foregroundStyle(selected ? Theme.Color.primary : Theme.Color.textSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(selected ? Theme.Color.primarySoft : Theme.Color.backgroundCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(selected ? Theme.Color.primary : Theme.Color.border, lineWidth: selected ? 2 : 1)
        )
    }
}
