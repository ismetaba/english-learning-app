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
            .transition(.asymmetric(
                insertion: .opacity.combined(with: .move(edge: .trailing)),
                removal: .opacity
            ))
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            FloatingTabBar(selected: $selected, onCenterTap: {
                showDailyTasks = true
            })
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .animation(.easeInOut(duration: 0.28), value: selected)
        .sheet(isPresented: $showDailyTasks) {
            DailyTasksView()
                .environmentObject(appState)
        }
        .onAppear { appState.updateStreak() }
    }
}

// MARK: - Floating pill tab bar

struct FloatingTabBar: View {
    @EnvironmentObject var appState: AppState
    @Binding var selected: MainTab
    var onCenterTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MainTab.displayed, id: \.self) { tab in
                tabButton(tab: tab)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 38, style: .continuous)
                    .fill(.ultraThinMaterial)
                RoundedRectangle(cornerRadius: 38, style: .continuous)
                    .fill(Color(hex: 0x11182A).opacity(0.92))
                RoundedRectangle(cornerRadius: 38, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.45), radius: 28, x: 0, y: 14)
            .shadow(color: .black.opacity(0.25), radius: 10, x: 0, y: 4)
        }
    }

    @ViewBuilder
    private func tabButton(tab: MainTab) -> some View {
        if tab == .play {
            Button(action: {
                Haptics.medium()
                onCenterTap()
            }) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [Theme.Color.primary, Theme.Color.primaryDark],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                    Circle().strokeBorder(.white.opacity(0.15), lineWidth: 1)
                    Image(systemName: "play.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                        .offset(x: 2)
                }
                .frame(width: 58, height: 58)
                .offset(y: -6)
                .shadow(color: Theme.Color.primary.opacity(0.55), radius: 18, x: 0, y: 6)
            }
            .buttonStyle(.pressable)
        } else {
            Button(action: {
                Haptics.selection()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                    selected = tab
                }
            }) {
                VStack(spacing: 4) {
                    Image(systemName: selected == tab ? tab.iconFilled : tab.icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(selected == tab ? Theme.Color.textPrimary : Theme.Color.textMuted)
                        .scaleEffect(selected == tab ? 1.08 : 1.0)
                    Text(tab.label(t: appState.t))
                        .font(.system(size: 11, weight: selected == tab ? .bold : .medium, design: .rounded))
                        .foregroundStyle(selected == tab ? Theme.Color.textPrimary : Theme.Color.textMuted)
                        .tracking(-0.1)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
        }
    }
}
