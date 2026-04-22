import SwiftUI

enum MainTab: Hashable, CaseIterable {
    case home, courses, play, vocab, profile

    var icon: String {
        switch self {
        case .home:    return "house"
        case .courses: return "film"
        case .play:    return "play.fill"
        case .vocab:   return "character.book.closed"
        case .profile: return "person"
        }
    }

    var iconFilled: String {
        switch self {
        case .home:    return "house.fill"
        case .courses: return "film.fill"
        case .play:    return "play.fill"
        case .vocab:   return "character.book.closed.fill"
        case .profile: return "person.fill"
        }
    }

    func label(t: Translations) -> String {
        switch self {
        case .home:    return t.t("learn")
        case .courses: return t.t("video")
        case .play:    return ""
        case .vocab:   return t.t("vocabulary")
        case .profile: return t.t("profile")
        }
    }

    static var displayed: [MainTab] { [.home, .courses, .play, .vocab, .profile] }
}

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selected: MainTab = .home
    @State private var showDailyTasks = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.Color.background.ignoresSafeArea()

            Group {
                switch selected {
                case .home:    HomeView()
                case .courses: CoursesView()
                case .play:    ScenesLandingView()
                case .vocab:   VocabView()
                case .profile: ProfileView()
                }
            }
            .transition(.opacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            FloatingTabBar(selected: $selected, onCenterTap: {
                showDailyTasks = true
            })
            .environmentObject(appState)
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
        .animation(.easeInOut(duration: 0.24), value: selected)
        .sheet(isPresented: $showDailyTasks) {
            DailyTasksView()
                .environmentObject(appState)
        }
        .onAppear { appState.updateStreak() }
    }
}

// MARK: - Glassy floating pill tab bar with animated selection

struct FloatingTabBar: View {
    @EnvironmentObject var appState: AppState
    @Binding var selected: MainTab
    var onCenterTap: () -> Void
    @Namespace private var selection

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MainTab.displayed, id: \.self) { tab in
                tabButton(tab: tab)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .background(barBackground)
        .frame(height: 78)
    }

    private var barBackground: some View {
        ZStack {
            // Glass
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(.ultraThinMaterial)

            // Tint + depth
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(Color(hex: 0x0E1424).opacity(0.85))

            // Top highlight — gives a glassy sheen
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.14), .clear],
                        startPoint: .top, endPoint: .center
                    ),
                    lineWidth: 1
                )

            // Outer border
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.55), radius: 28, y: 14)
        .shadow(color: Theme.Color.primary.opacity(0.15), radius: 18, y: 6)
    }

    @ViewBuilder
    private func tabButton(tab: MainTab) -> some View {
        if tab == .play {
            centerPlayButton
        } else {
            Button(action: {
                Haptics.selection()
                withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) {
                    selected = tab
                }
            }) {
                VStack(spacing: 3) {
                    Image(systemName: selected == tab ? tab.iconFilled : tab.icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(selected == tab ? .white : Theme.Color.textMuted)
                    Text(tab.label(t: appState.t))
                        .font(.system(size: 10, weight: selected == tab ? .heavy : .semibold, design: .rounded))
                        .foregroundStyle(selected == tab ? .white : Theme.Color.textMuted)
                        .tracking(-0.1)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Theme.Color.primary.opacity(0.3), Theme.Color.primary.opacity(0.08)],
                                startPoint: .top, endPoint: .bottom
                            )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .strokeBorder(Theme.Color.primary.opacity(0.35), lineWidth: 1)
                        )
                        .opacity(selected == tab ? 1 : 0)
                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selected)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable(scale: 0.92))
        }
    }

    private var centerPlayButton: some View {
        Button(action: {
            Haptics.medium()
            onCenterTap()
        }) {
            ZStack {
                // Halo
                Circle()
                    .fill(Theme.Color.primary.opacity(0.25))
                    .frame(width: 72, height: 72)
                    .blur(radius: 14)

                // Main
                Circle()
                    .fill(LinearGradient(
                        colors: [Theme.Color.primary, Theme.Color.primaryDark],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                Circle()
                    .stroke(
                        LinearGradient(colors: [.white.opacity(0.5), .clear],
                                       startPoint: .top, endPoint: .center),
                        lineWidth: 1.5
                    )
                Image(systemName: "play.fill")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(.white)
                    .offset(x: 2)
            }
            .frame(width: 56, height: 56)
            .offset(y: -10)
            .shadow(color: Theme.Color.primary.opacity(0.6), radius: 18, y: 6)
        }
        .buttonStyle(.pressable)
    }
}
