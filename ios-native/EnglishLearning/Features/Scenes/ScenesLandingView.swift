import SwiftUI

/// Scenes tab: a curated mixed feed of lesson clips — feels like a movie-scene browser.
struct ScenesLandingView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = HomeViewModel()
    @State private var selectedLesson: CurriculumLesson? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                if vm.isLoading && vm.curriculum.isEmpty {
                    LoadingState(label: appState.t.t("loading"))
                } else if let err = vm.errorMessage, vm.curriculum.isEmpty {
                    ErrorState(message: err) { Task { await vm.load(forceRefresh: true) } }
                } else {
                    content
                }
            }
            .navigationDestination(item: $selectedLesson) { lesson in
                LessonClipsView(lesson: lesson).environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                header
                featured
                allScenes
                Spacer().frame(height: 120)
            }
            .padding(.top, 12)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(appState.t.t("scenes"))
                .font(Theme.Font.display(30))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.5)
            Text("Learn through real movie scenes")
                .font(Theme.Font.body(14))
                .foregroundStyle(Theme.Color.textSecondary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 48)
    }

    private var featured: some View {
        let featuredLesson = vm.curriculum.first?.lessons.first
        return Group {
            if let lesson = featuredLesson {
                Button {
                    Haptics.medium()
                    selectedLesson = lesson
                } label: {
                    FeaturedSceneCard(lesson: lesson)
                }
                .buttonStyle(.pressable)
                .padding(.horizontal, 20)
            }
        }
    }

    private var allScenes: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Browse by unit",
                          subtitle: "Pick a lesson to watch its clips",
                          icon: "square.stack.3d.forward.dottedline.fill",
                          iconColor: Theme.Color.primary)
                .padding(.horizontal, 20)
            LazyVStack(spacing: 10) {
                ForEach(vm.curriculum) { unit in
                    unitGroup(unit)
                }
            }
        }
    }

    private func unitGroup(_ unit: CurriculumUnit) -> some View {
        let unitColor = Theme.Color.fromHex(unit.color, fallback: Theme.Color.forCEFR(unit.cefrLevel))
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Chip(label: unit.cefrLevel.uppercased(), color: unitColor)
                Text(unit.displayTitle)
                    .font(Theme.Font.headline(15, weight: .bold))
                    .foregroundStyle(Theme.Color.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(unit.lessons) { lesson in
                        Button {
                            Haptics.selection()
                            selectedLesson = lesson
                        } label: {
                            SceneTile(lesson: lesson, unitColor: unitColor)
                        }
                        .buttonStyle(.pressable)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

struct FeaturedSceneCard: View {
    let lesson: CurriculumLesson

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .fill(Theme.Gradient.heroRose)
                .frame(height: 220)

            // Decorative circles
            Circle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 180, height: 180)
                .offset(x: 180, y: -60)
            Circle()
                .fill(Color.white.opacity(0.06))
                .frame(width: 120, height: 120)
                .offset(x: -40, y: 120)

            VStack(alignment: .leading, spacing: 10) {
                Text("FEATURED")
                    .font(Theme.Font.caption(11, weight: .heavy))
                    .foregroundStyle(.white.opacity(0.85))
                    .tracking(1.2)
                Text(lesson.displayTitle)
                    .font(Theme.Font.display(26, weight: .heavy))
                    .foregroundStyle(.white)
                    .tracking(-0.5)
                    .lineLimit(3)
                HStack(spacing: 8) {
                    ZStack {
                        Circle().fill(.white.opacity(0.2))
                        Image(systemName: "play.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 32, height: 32)
                    Text("Start watching")
                        .font(Theme.Font.headline(14, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .padding(22)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .premiumShadow(.card)
    }
}

struct SceneTile: View {
    let lesson: CurriculumLesson
    let unitColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .fill(LinearGradient(
                        colors: [unitColor.opacity(0.4), unitColor.opacity(0.15)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                Image(systemName: "film.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
            }
            .frame(width: 140, height: 88)
            Text(lesson.displayTitle)
                .font(Theme.Font.headline(13, weight: .bold))
                .foregroundStyle(Theme.Color.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(width: 140, alignment: .leading)
    }
}
