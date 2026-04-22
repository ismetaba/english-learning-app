import SwiftUI
import UIKit

/// Design tokens for the entire app. Mirrors (and refines) the RN `constants/Colors.ts` palette.
enum Theme {

    // MARK: - Colors
    enum Color {
        // Primary — Soft violet
        static let primary         = SwiftUI.Color(hex: 0x8577FF)
        static let primaryLight    = SwiftUI.Color(hex: 0xA99CFF)
        static let primaryDark     = SwiftUI.Color(hex: 0x6A5CE0)
        static let primarySoft     = SwiftUI.Color(hex: 0x8577FF, opacity: 0.12)
        static let primaryGlow     = SwiftUI.Color(hex: 0x8577FF, opacity: 0.25)

        // Accent — Cyan
        static let accent          = SwiftUI.Color(hex: 0x06D6B0)
        static let accentLight     = SwiftUI.Color(hex: 0x5DFFC8)
        static let accentSoft      = SwiftUI.Color(hex: 0x06D6B0, opacity: 0.12)

        // Success
        static let success         = SwiftUI.Color(hex: 0x10B981)
        static let successLight    = SwiftUI.Color(hex: 0x6EE7B7)
        static let successSoft     = SwiftUI.Color(hex: 0x10B981, opacity: 0.12)
        static let successGlow     = SwiftUI.Color(hex: 0x10B981, opacity: 0.25)

        // Warning
        static let warning         = SwiftUI.Color(hex: 0xF59E0B)
        static let warningSoft     = SwiftUI.Color(hex: 0xF59E0B, opacity: 0.12)

        // Error
        static let error           = SwiftUI.Color(hex: 0xEF4444)
        static let errorSoft       = SwiftUI.Color(hex: 0xEF4444, opacity: 0.12)

        // XP + Streak
        static let xp              = SwiftUI.Color(hex: 0xFFB347)
        static let xpGlow          = SwiftUI.Color(hex: 0xFFB347, opacity: 0.18)
        static let streak          = SwiftUI.Color(hex: 0xFF6348)

        // Backgrounds (darkest → lightest)
        static let background      = SwiftUI.Color(hex: 0x080A14)
        static let backgroundCard  = SwiftUI.Color(hex: 0x111827)
        static let backgroundElevated = SwiftUI.Color(hex: 0x1A2238)
        static let backgroundSurface  = SwiftUI.Color(hex: 0x222D47)
        static let backgroundInput    = SwiftUI.Color(hex: 0x2C3756)

        // Text
        static let textPrimary     = SwiftUI.Color(hex: 0xF1F3FF)
        static let textSecondary   = SwiftUI.Color(hex: 0x94A0C4)
        static let textMuted       = SwiftUI.Color(hex: 0x5E6B8A)
        static let textDisabled    = SwiftUI.Color(hex: 0x3E4A6A)

        // Borders
        static let border          = SwiftUI.Color(hex: 0x1E2A42)
        static let borderLight     = SwiftUI.Color(hex: 0x172035)
        static let borderAccent    = SwiftUI.Color(hex: 0x8577FF, opacity: 0.3)

        // Unit/Level colors
        static let unit1 = SwiftUI.Color(hex: 0x7C6AFF)
        static let unit2 = SwiftUI.Color(hex: 0x00D4AA)
        static let unit3 = SwiftUI.Color(hex: 0xFFB347)
        static let unit4 = SwiftUI.Color(hex: 0xFF6B8A)
        static let unit5 = SwiftUI.Color(hex: 0x47C9FF)

        static let levelBeginner     = SwiftUI.Color(hex: 0x00D4AA)
        static let levelElementary   = SwiftUI.Color(hex: 0x47C9FF)
        static let levelIntermediate = SwiftUI.Color(hex: 0xFFB347)
        static let levelUpper        = SwiftUI.Color(hex: 0xFF6B8A)
        static let levelAdvanced     = SwiftUI.Color(hex: 0xFF6B6B)

        /// Resolve a color by CEFR level string ("A1", "A2", etc.)
        static func forCEFR(_ level: String?) -> SwiftUI.Color {
            switch level?.uppercased() {
            case "A1": return levelBeginner
            case "A2": return levelElementary
            case "B1": return levelIntermediate
            case "B2": return levelUpper
            case "C1", "C2": return levelAdvanced
            default:   return primary
            }
        }

        /// Resolve a color from a hex string (like `"#7C6AFF"`) with a fallback.
        static func fromHex(_ hex: String?, fallback: SwiftUI.Color = primary) -> SwiftUI.Color {
            guard let hex = hex else { return fallback }
            let trimmed = hex.replacingOccurrences(of: "#", with: "")
            guard let value = UInt32(trimmed, radix: 16) else { return fallback }
            return SwiftUI.Color(hex: Int(value))
        }
    }

    // MARK: - Spacing
    enum Space {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
    }

    // MARK: - Radius
    enum Radius {
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let full: CGFloat = 999
    }

    // MARK: - Typography
    enum Font {
        static func display(_ size: CGFloat = 32, weight: SwiftUI.Font.Weight = .heavy) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .rounded)
        }
        static func title(_ size: CGFloat = 22, weight: SwiftUI.Font.Weight = .bold) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .rounded)
        }
        static func headline(_ size: CGFloat = 17, weight: SwiftUI.Font.Weight = .semibold) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .rounded)
        }
        static func body(_ size: CGFloat = 15, weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .default)
        }
        static func caption(_ size: CGFloat = 12, weight: SwiftUI.Font.Weight = .semibold) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .rounded)
        }
        static func mono(_ size: CGFloat = 14, weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .monospaced)
        }
    }

    // MARK: - Gradients
    enum Gradient {
        static let heroPrimary = LinearGradient(
            colors: [
                SwiftUI.Color(hex: 0x8577FF),
                SwiftUI.Color(hex: 0x5DFFC8).opacity(0.7)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        static let heroWarm = LinearGradient(
            colors: [
                SwiftUI.Color(hex: 0xFFB347),
                SwiftUI.Color(hex: 0xFF6348)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        static let heroCool = LinearGradient(
            colors: [
                SwiftUI.Color(hex: 0x47C9FF),
                SwiftUI.Color(hex: 0x06D6B0)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        static let heroRose = LinearGradient(
            colors: [
                SwiftUI.Color(hex: 0xFF6B8A),
                SwiftUI.Color(hex: 0x8577FF)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        static let cardGlow = LinearGradient(
            colors: [
                SwiftUI.Color(hex: 0x1A2238),
                SwiftUI.Color(hex: 0x111827)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        static let surfaceGlass = LinearGradient(
            colors: [
                SwiftUI.Color.white.opacity(0.06),
                SwiftUI.Color.white.opacity(0.02)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - UIKit global appearance
    static func configureGlobalAppearance() {
        let navBar = UINavigationBarAppearance()
        navBar.configureWithTransparentBackground()
        navBar.titleTextAttributes = [
            .foregroundColor: UIColor(Theme.Color.textPrimary)
        ]
        navBar.largeTitleTextAttributes = [
            .foregroundColor: UIColor(Theme.Color.textPrimary)
        ]
        UINavigationBar.appearance().standardAppearance = navBar
        UINavigationBar.appearance().scrollEdgeAppearance = navBar
        UINavigationBar.appearance().tintColor = UIColor(Theme.Color.primary)

        UIScrollView.appearance().keyboardDismissMode = .interactive
    }
}

// MARK: - Color Hex helper
extension SwiftUI.Color {
    init(hex: Int, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
