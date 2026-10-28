// The production database's shape before the language dimension (no
// `language` columns), English tables only. Tests start from it so the
// first getDb() runs the same migration production ran after deploy.
export const LEGACY_SCHEMA = `
    CREATE TABLE videos (id TEXT PRIMARY KEY, youtube_video_id TEXT NOT NULL, title TEXT NOT NULL,
      movie_title TEXT NOT NULL, genre TEXT, difficulty TEXT DEFAULT 'intermediate',
      duration_seconds INTEGER, poc INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE clips (id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
      start_time REAL, end_time REAL, status TEXT DEFAULT 'draft', wpm REAL, a2_ratio REAL,
      avg_sentence_len REAL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE subtitle_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, clip_id INTEGER REFERENCES clips(id) ON DELETE CASCADE,
      line_index INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL,
      translation_tr TEXT, structure TEXT);
    CREATE TABLE word_timestamps (id INTEGER PRIMARY KEY AUTOINCREMENT, line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE CASCADE,
      word_index INTEGER, word TEXT, start_time REAL, end_time REAL, starter_word_id TEXT);
    CREATE TABLE vocab_words (id TEXT PRIMARY KEY, word TEXT, ipa TEXT, part_of_speech TEXT,
      translation_tr TEXT, example_sentence TEXT, example_translation_tr TEXT,
      frequency_rank INTEGER, cefr_level TEXT);
    CREATE TABLE word_translations (word_lower TEXT PRIMARY KEY, translation_tr TEXT);
    CREATE TABLE video_sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, title_tr TEXT, description TEXT,
      description_tr TEXT, difficulty TEXT, sort_order INTEGER);
    CREATE TABLE video_set_items (set_id TEXT, video_id TEXT, sort_order INTEGER, PRIMARY KEY(set_id, video_id));
    CREATE TABLE clip_vocab (clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
      line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE SET NULL,
      occurrence_count INTEGER DEFAULT 1, PRIMARY KEY (clip_id, word_id));
`;
