import Foundation

/// Reads/writes `UserProgress` (and the vocab pool) in UserDefaults without
/// ever destroying a blob it could not read.
///
/// The app used to decode with `try?` and treat failure as "no progress", so
/// the next save replaced the learner's history with an empty record. Now an
/// unreadable blob is first copied to its own backup key, where a later
/// build can still recover it, and only then reported as absent.
enum ProgressPersistence {
    static let progressKey = "user_progress_v2"
    static let backupKeyPrefix = "user_progress_v2_backup"

    static let vocabPoolKey = "vocab_pool_v2"
    static let vocabPoolBackupKeyPrefix = "vocab_pool_v2_backup"

    /// `nil` when nothing is stored or the stored blob can't be decoded; in
    /// the latter case its bytes have been backed up before returning.
    static func load(from defaults: UserDefaults, now: Date = Date()) -> UserProgress? {
        load(UserProgress.self, key: progressKey, backupKeyPrefix: backupKeyPrefix, from: defaults, now: now)
    }

    static func save(_ progress: UserProgress, to defaults: UserDefaults) {
        save(progress, key: progressKey, to: defaults)
    }

    /// Same contract as `load(from:now:)`, for the spaced-repetition pool.
    static func loadVocabPool(from defaults: UserDefaults, now: Date = Date()) -> [String: VocabPoolEntry]? {
        load([String: VocabPoolEntry].self, key: vocabPoolKey, backupKeyPrefix: vocabPoolBackupKeyPrefix, from: defaults, now: now)
    }

    static func saveVocabPool(_ pool: [String: VocabPoolEntry], to defaults: UserDefaults) {
        save(pool, key: vocabPoolKey, to: defaults)
    }

    // MARK: - Shared

    private static func load<T: Decodable>(
        _ type: T.Type,
        key: String,
        backupKeyPrefix: String,
        from defaults: UserDefaults,
        now: Date
    ) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            backUp(data, keyPrefix: backupKeyPrefix, in: defaults, now: now)
            return nil
        }
    }

    /// Writes only the main key; backups are never touched.
    private static func save<T: Encodable>(_ value: T, key: String, to defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }

    /// Stores `data` under a new `<prefix>_<unix seconds>` key, appending a
    /// counter rather than replacing an earlier backup. Bytes that are
    /// already backed up (relaunching before anything was saved over them)
    /// are not stored again.
    private static func backUp(_ data: Data, keyPrefix: String, in defaults: UserDefaults, now: Date) {
        let existing = defaults.dictionaryRepresentation()
        let alreadyBackedUp = existing.contains { key, value in
            key.hasPrefix(keyPrefix) && (value as? Data) == data
        }
        guard !alreadyBackedUp else { return }

        let base = "\(keyPrefix)_\(Int(now.timeIntervalSince1970))"
        var key = base
        var counter = 1
        while existing[key] != nil {
            key = "\(base)_\(counter)"
            counter += 1
        }
        defaults.set(data, forKey: key)
    }
}
