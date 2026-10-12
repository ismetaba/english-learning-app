import Foundation

// STUB — API contract only. Implementation pending (see ProgressPersistenceTests).

/// Reads/writes `UserProgress` in UserDefaults without ever destroying a
/// blob it could not read.
enum ProgressPersistence {
    static let progressKey = "user_progress_v2"
    static let backupKeyPrefix = "user_progress_v2_backup"

    static func load(from defaults: UserDefaults, now: Date = Date()) -> UserProgress? {
        guard let data = defaults.data(forKey: progressKey) else { return nil }
        return try? JSONDecoder().decode(UserProgress.self, from: data)
    }

    static func save(_ progress: UserProgress, to defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(progress) else { return }
        defaults.set(data, forKey: progressKey)
    }
}
