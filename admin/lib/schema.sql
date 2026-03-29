CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  genre TEXT,
  difficulty TEXT DEFAULT 'intermediate',
  duration_seconds INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subtitle_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL,
  speaker TEXT DEFAULT 'Speaker',
  text TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS word_timestamps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL REFERENCES subtitle_lines(id) ON DELETE CASCADE,
  word_index INTEGER NOT NULL,
  word TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'vocab'
);

CREATE TABLE IF NOT EXISTS clip_tags (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (clip_id, tag_id)
);

-- ── Lessons ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_tr TEXT,
  description TEXT,
  level TEXT DEFAULT 'elementary',
  grammar_focus TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lesson_sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  line_id INTEGER NOT NULL REFERENCES subtitle_lines(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  grammar_annotations TEXT,
  translations TEXT
);

-- ── Curriculum (API-driven lesson tree) ─────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_units (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_tr TEXT,
  description TEXT,
  cefr_level TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS curriculum_lessons (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_tr TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL,
  lesson_type TEXT NOT NULL DEFAULT 'grammar',
  grammar_pattern TEXT,
  grammar_explanation TEXT,
  grammar_explanation_tr TEXT,
  examples TEXT,
  exercises TEXT,
  sections TEXT,
  status TEXT DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS lesson_prerequisites (
  lesson_id TEXT NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  required_lesson_id TEXT NOT NULL REFERENCES curriculum_lessons(id),
  PRIMARY KEY (lesson_id, required_lesson_id)
);

-- ── Vocabulary ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vocab_words (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  ipa TEXT,
  part_of_speech TEXT,
  translation_tr TEXT,
  example_sentence TEXT,
  example_translation_tr TEXT,
  frequency_rank INTEGER,
  cefr_level TEXT
);

CREATE TABLE IF NOT EXISTS vocab_sets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES curriculum_lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_tr TEXT
);

CREATE TABLE IF NOT EXISTS vocab_set_words (
  set_id TEXT NOT NULL REFERENCES vocab_sets(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, word_id)
);

-- ── Clip-to-content mappings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS clip_structures (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE SET NULL,
  PRIMARY KEY (clip_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS clip_vocab (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE SET NULL,
  occurrence_count INTEGER DEFAULT 1,
  PRIMARY KEY (clip_id, word_id)
);
