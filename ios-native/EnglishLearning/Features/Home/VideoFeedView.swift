import SwiftUI

// MARK: - View model

@MainActor
final class VideoFeedViewModel: ObservableObject {
    @Published var sets: [VideoSet] = []
    @Published var isLoading = true
    @Published var errorMessage: String? = nil

    func load(forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }
        errorMessage = nil
        do {
            self.sets = try await CurriculumRepository.shared.videoSets(forceRefresh: forceRefresh)
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Main feed (sets list)

struct VideoFeedView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = VideoFeedViewModel()
    @State private var selectedSet: VideoSet? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundAmbience()

                if vm.isLoading && vm.sets.isEmpty {
                    LoadingState(label: appState.t.t("loading"))
                } else if let err = vm.errorMessage, vm.sets.isEmpty {
                    ErrorState(message: err) {
                        Task { await vm.load(forceRefresh: true) }
                    }
                } else {
                    content
                }
            }
            .navigationDestination(item: $selectedSet) { set in
                SetDetailView(set: set)
                    .environmentObject(appState)
            }
        }
        .task { await vm.load() }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 24) {
                heroHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 56)
                    .padding(.bottom, 4)

                ForEach(Array(vm.sets.enumerated()), id: \.element.id) { idx, set in
                    SetHeroCard(set: set, index: idx + 1) {
                        selectedSet = set
                    }
                    .padding(.horizontal, 20)
                }

                Spacer().frame(height: 140) // Tab bar clearance.
            }
        }
        .refreshable { await vm.load(forceRefresh: true) }
    }

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SETLER")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(2)
                .foregroundStyle(Theme.Color.accent)
            Text("Bir set seç,\nbaşla.")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.6)
                .lineSpacing(-2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Set hero card (feed-level)

private struct SetHeroCard: View {
    let set: VideoSet
    let index: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); onTap() }) {
            VStack(spacing: 0) {
                heroImage
                infoBlock
            }
            .background(Theme.Color.backgroundCard)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Theme.Color.border.opacity(0.6), lineWidth: 1),
            )
            .shadow(color: .black.opacity(0.35), radius: 20, x: 0, y: 8)
        }
        .buttonStyle(.pressable(scale: 0.98))
    }

    private var heroImage: some View {
        ZStack(alignment: .bottomLeading) {
            // Mosaic of the first 4 video thumbnails — gives the set
            // a face that's clearly multi-video, instead of leaning on
            // any single video to represent the whole journey.
            thumbnailMosaic

            // Bottom gradient so the position label stays legible
            // regardless of the underlying thumbnail brightness.
            LinearGradient(
                colors: [.clear, .black.opacity(0.85)],
                startPoint: .center,
                endPoint: .bottom,
            )

            HStack(spacing: 8) {
                Text(String(format: "SET %02d", index))
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(1.4)
                    .foregroundStyle(.white)
                Text("·")
                    .foregroundStyle(.white.opacity(0.6))
                Text(difficultyLabel)
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(difficultyTint)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
        }
        .aspectRatio(16.0 / 7.0, contentMode: .fit)
        .clipped()
    }

    private var thumbnailMosaic: some View {
        let firstFour = Array(set.videos.prefix(4))
        return GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(firstFour) { v in
                    AsyncImage(url: v.thumbnailURL) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().aspectRatio(contentMode: .fill)
                        case .empty, .failure:
                            Color.black
                        @unknown default:
                            Color.black
                        }
                    }
                    .frame(width: geo.size.width / CGFloat(max(firstFour.count, 1)), height: geo.size.height)
                    .clipped()
                }
            }
        }
    }

    private var infoBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(set.displayTitle)
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Color.textPrimary)
                .tracking(-0.4)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if let desc = set.displayDescription, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 8) {
                MetaPill(icon: "film.stack", label: "\(set.videos.count) video")
                MetaPill(icon: "character.book.closed", label: "\(set.distinctStarterWordCount) kelime")
                Spacer(minLength: 0)
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
            }
            .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var difficultyLabel: String {
        switch set.difficulty {
        case "beginner":     return "BAŞLANGIÇ"
        case "elementary":   return "TEMEL"
        case "intermediate": return "ORTA"
        case "advanced":     return "İLERİ"
        default:             return "POC"
        }
    }

    private var difficultyTint: Color {
        switch set.difficulty {
        case "beginner":     return Theme.Color.success
        case "elementary":   return Theme.Color.primary
        case "intermediate": return Theme.Color.warning
        case "advanced":     return Theme.Color.error
        default:             return Theme.Color.accent
        }
    }
}

// MARK: - Meta pill (shared with detail view)

struct MetaPill: View {
    let icon: String
    let label: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .bold))
            Text(label)
                .font(.system(size: 11, weight: .heavy))
        }
        .foregroundStyle(Theme.Color.textSecondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(Theme.Color.backgroundSurface.opacity(0.7)),
        )
        .overlay(
            Capsule().strokeBorder(Theme.Color.border, lineWidth: 0.5),
        )
    }
}

// MARK: - Flow layout

/// Wraps subviews onto multiple rows when the row width exceeds the
/// available horizontal space. Uses iOS 16+ Layout protocol.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let arr = arrange(width: width, subviews: subviews)
        return arr.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let arr = arrange(width: bounds.width, subviews: subviews)
        for (i, point) in arr.positions.enumerated() {
            let size = subviews[i].sizeThatFits(.unspecified)
            subviews[i].place(
                at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y),
                proposal: ProposedViewSize(size),
            )
        }
    }

    private func arrange(width maxWidth: CGFloat, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxRowWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            maxRowWidth = max(maxRowWidth, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: maxRowWidth, height: y + rowHeight), positions)
    }
}
