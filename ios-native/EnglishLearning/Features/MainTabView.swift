import SwiftUI

enum MainTab: Hashable, CaseIterable {
    // The Feynman pivot collapsed the tab set to three: a video feed
    // (formerly the lessons home), the vocab review tab, and profile.
    // `courses` and `play` (daily-tasks center button) cases stay around
    // so any direct references compile, but they're no longer in
    // `displayed` and never selected. `patterns` is the sentence-pattern
    // teaching tab added on top of the Feynman set — small, opt-in.
    case home, vocab, patterns, profile
    case courses, play // legacy — not surfaced

    var icon: String {
        switch self {
        case .home:     return "film"
        case .vocab:    return "character.book.closed"
        case .patterns: return "puzzlepiece"
        case .profile:  return "person"
        case .courses:  return "film"
        case .play:     return "play.fill"
        }
    }

    var iconFilled: String {
        switch self {
        case .home:     return "film.fill"
        case .vocab:    return "character.book.closed.fill"
        case .patterns: return "puzzlepiece.fill"
        case .profile:  return "person.fill"
        case .courses:  return "film.fill"
        case .play:     return "play.fill"
        }
    }

    func label(t: Translations) -> String {
        switch self {
        case .home:     return t.t("video")
        case .vocab:    return t.t("vocabulary")
        case .patterns: return t.t("patterns")
        case .profile:  return t.t("profile")
        case .courses:  return t.t("video")
        case .play:     return ""
        }
    }

    static var displayed: [MainTab] { [.patterns, .home, .vocab, .profile] }
}

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selected: MainTab = .home

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.Color.background.ignoresSafeArea()

            Group {
                switch selected {
                case .home:     VideoFeedView()
                case .vocab:    VocabView()
                case .patterns: PatternsView()
                case .profile:  ProfileView()
                // Legacy fall-through — never reached because these aren't
                // in `MainTab.displayed`, but a switch must be exhaustive.
                case .courses:  VideoFeedView()
                case .play:     VideoFeedView()
                }
            }
            .transition(.opacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Hidden while an immersive ClipPlayer is showing — the video
            // chrome owns the bottom band in that mode (gradient fade,
            // transport row, scrubber). Animated so the bar slides out
            // rather than disappearing instantly.
            if !appState.isVideoPlayerActive {
                FloatingTabBar(selected: $selected)
                    .environmentObject(appState)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.24), value: selected)
        .animation(.easeInOut(duration: 0.22), value: appState.isVideoPlayerActive)
        .onAppear { appState.updateStreak() }
    }
}

// MARK: - Glassy floating pill tab bar with animated selection

struct FloatingTabBar: View {
    @EnvironmentObject var appState: AppState
    @Binding var selected: MainTab
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
        // .play (center daily-tasks button) is no longer in `displayed`,
        // so this branch is functionally dead — kept for future revival.
        if tab == .play {
            EmptyView()
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

    // The center daily-tasks button was removed when we collapsed the tab
    // bar to three tabs for the Feynman pivot. If we revive a `.play` tab
    // later, restore `centerPlayButton` and route it from `tabButton`.
}
