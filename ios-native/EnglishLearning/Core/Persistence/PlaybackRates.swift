import Foundation

/// One playback speed per learning language, so a learner who follows
/// English at native speed (onboarding "Orta" sets 1.0×) still starts the
/// Spanish scenes slowed down, as a beginner there.
enum PlaybackRates {
    /// The speeds the players offer.
    static let options: [Double] = [0.5, 0.75, 1.0]
    /// Comprehension over speed: where nothing was chosen yet.
    static let defaultRate = 0.75

    /// English keeps the key it was always stored under.
    static func key(for language: LearningLanguage) -> String {
        language == .en ? "playback_rate_v1" : "playback_rate_\(language.rawValue)_v1"
    }

    static func load(for language: LearningLanguage, from defaults: UserDefaults) -> Double {
        let rate = defaults.double(forKey: key(for: language))
        return options.contains(rate) ? rate : defaultRate
    }

    static func save(_ rate: Double, for language: LearningLanguage, to defaults: UserDefaults) {
        defaults.set(rate, forKey: key(for: language))
    }
}
