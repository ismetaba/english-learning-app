import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    // Repo root has app.json (Expo config) alongside data.db
    if (fs.existsSync(path.join(dir, 'app.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
const DB_PATH = process.env.DATABASE_PATH || path.join(findRepoRoot(), 'data.db');

let _db: Database.Database | null = null;

const SCHEMA = `
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

-- ── Targeted lines (user-curated lines for lessons) ───────────
CREATE TABLE IF NOT EXISTS targeted_lines (
  clip_id INTEGER NOT NULL,
  lesson_id TEXT NOT NULL,
  line_id INTEGER NOT NULL,
  PRIMARY KEY (clip_id, lesson_id, line_id)
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clips_video_id ON clips(video_id);
CREATE INDEX IF NOT EXISTS idx_subtitle_lines_clip_id ON subtitle_lines(clip_id);
CREATE INDEX IF NOT EXISTS idx_word_timestamps_line_id ON word_timestamps(line_id);
CREATE INDEX IF NOT EXISTS idx_videos_movie_title ON videos(movie_title);
CREATE INDEX IF NOT EXISTS idx_videos_difficulty ON videos(difficulty);
CREATE INDEX IF NOT EXISTS idx_clip_structures_lesson_id ON clip_structures(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sentences_lesson_id ON lesson_sentences(lesson_id);
`;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(SCHEMA);

    // Migrations for existing databases
    try {
      _db.exec('ALTER TABLE curriculum_lessons ADD COLUMN sections TEXT');
    } catch {
      // Column already exists — ignore
    }
  }
  return _db;
}

// ── Video helpers ────────────────────────────────────────────────

export interface Video {
  id: string;
  youtube_video_id: string;
  title: string;
  movie_title: string;
  genre: string | null;
  difficulty: string;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  clip_count?: number;
}

// ── POC video helpers (Feynman video-first) ─────────────────────

export interface PocStarterWord {
  id: string;
  word: string;
  tr: string;
  occurrences: number;
}

export interface PocVideo {
  id: string;
  youtube_video_id: string;
  title: string;
  movie_title: string;
  difficulty: string;
  wpm: number | null;
  a2_ratio: number | null;
  avg_sentence_len: number | null;
  clip_count: number;
  total_lines: number;
  tagged_lines: number;
  starter_words: PocStarterWord[];
}

export function getPocVideos(): PocVideo[] {
  const db = getDb();
  // Aggregates over healthy clips only (the same band used in selection),
  // line counts over all approved clips. Starter coverage is grouped per
  // video, sorted by total occurrences so the UI can pick the most
  // pedagogically loaded words first.
  const videos = db
    .prepare(
      `SELECT
         v.id,
         v.youtube_video_id,
         v.title,
         v.movie_title,
         v.difficulty,
         (SELECT COUNT(*) FROM clips c WHERE c.video_id = v.id AND c.status = 'approved') AS clip_count,
         (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id
          WHERE c.video_id = v.id AND c.status = 'approved'
            AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0) AS total_lines,
         (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id
          WHERE c.video_id = v.id AND c.status = 'approved'
            AND sl.structure IS NOT NULL) AS tagged_lines,
         (SELECT AVG(c.wpm) FROM clips c
          WHERE c.video_id = v.id AND c.status = 'approved'
            AND c.wpm BETWEEN 80 AND 200
            AND c.avg_sentence_len BETWEEN 3 AND 12) AS wpm,
         (SELECT AVG(c.a2_ratio) FROM clips c
          WHERE c.video_id = v.id AND c.status = 'approved'
            AND c.wpm BETWEEN 80 AND 200
            AND c.avg_sentence_len BETWEEN 3 AND 12) AS a2_ratio,
         (SELECT AVG(c.avg_sentence_len) FROM clips c
          WHERE c.video_id = v.id AND c.status = 'approved'
            AND c.wpm BETWEEN 80 AND 200
            AND c.avg_sentence_len BETWEEN 3 AND 12) AS avg_sentence_len
       FROM videos v
       WHERE v.poc = 1
       ORDER BY v.movie_title, v.title`,
    )
    .all() as Omit<PocVideo, 'starter_words'>[];

  const wordsStmt = db.prepare(
    `SELECT vw.id, vw.word, vw.translation_tr AS tr, SUM(cv.occurrence_count) AS occurrences
     FROM clip_vocab cv
     JOIN clips c ON c.id = cv.clip_id
     JOIN vocab_words vw ON vw.id = cv.word_id
     WHERE c.video_id = ? AND c.status = 'approved' AND cv.word_id LIKE 'a2-%'
     GROUP BY vw.id
     ORDER BY occurrences DESC`,
  );

  return videos.map(v => ({
    ...v,
    starter_words: wordsStmt.all(v.id) as PocStarterWord[],
  }));
}

export interface VideoSet {
  id: string;
  title: string;
  title_tr: string | null;
  description: string | null;
  description_tr: string | null;
  difficulty: string | null;
  sort_order: number;
  videos: PocVideo[];
}

/**
 * Curated learning sets — a named, ordered group of POC videos that
 * share a vocabulary footprint. Each set is one "unit" of progression
 * in the Feynman flow: working through the videos exposes the learner
 * to the same starter words across multiple contexts, driving them
 * toward the 7-context mastery threshold without forcing extra reps
 * of the same scene.
 */
export function getVideoSets(): VideoSet[] {
  const db = getDb();

  const sets = db
    .prepare(
      `SELECT id, title, title_tr, description, description_tr, difficulty, sort_order
       FROM video_sets
       ORDER BY sort_order, id`,
    )
    .all() as Omit<VideoSet, 'videos'>[];

  const videoStmt = db.prepare(
    `SELECT
       v.id, v.youtube_video_id, v.title, v.movie_title, v.difficulty,
       (SELECT COUNT(*) FROM clips c WHERE c.video_id = v.id AND c.status = 'approved') AS clip_count,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id
        WHERE c.video_id = v.id AND c.status = 'approved'
          AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0) AS total_lines,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id
        WHERE c.video_id = v.id AND c.status = 'approved'
          AND sl.structure IS NOT NULL) AS tagged_lines,
       (SELECT AVG(c.wpm) FROM clips c
        WHERE c.video_id = v.id AND c.status = 'approved'
          AND c.wpm BETWEEN 80 AND 200
          AND c.avg_sentence_len BETWEEN 3 AND 12) AS wpm,
       (SELECT AVG(c.a2_ratio) FROM clips c
        WHERE c.video_id = v.id AND c.status = 'approved'
          AND c.wpm BETWEEN 80 AND 200
          AND c.avg_sentence_len BETWEEN 3 AND 12) AS a2_ratio,
       (SELECT AVG(c.avg_sentence_len) FROM clips c
        WHERE c.video_id = v.id AND c.status = 'approved'
          AND c.wpm BETWEEN 80 AND 200
          AND c.avg_sentence_len BETWEEN 3 AND 12) AS avg_sentence_len
     FROM videos v
     JOIN video_set_items vsi ON vsi.video_id = v.id
     WHERE vsi.set_id = ?
     ORDER BY vsi.sort_order`,
  );

  const wordsStmt = db.prepare(
    `SELECT vw.id, vw.word, vw.translation_tr AS tr, SUM(cv.occurrence_count) AS occurrences
     FROM clip_vocab cv
     JOIN clips c ON c.id = cv.clip_id
     JOIN vocab_words vw ON vw.id = cv.word_id
     WHERE c.video_id = ? AND c.status = 'approved' AND cv.word_id LIKE 'a2-%'
     GROUP BY vw.id
     ORDER BY occurrences DESC`,
  );

  return sets.map(set => {
    const videos = videoStmt.all(set.id) as Omit<PocVideo, 'starter_words'>[];
    return {
      ...set,
      videos: videos.map(v => ({
        ...v,
        starter_words: wordsStmt.all(v.id) as PocStarterWord[],
      })),
    };
  });
}

export function getAllVideos(): Video[] {
  const db = getDb();
  return db.prepare(`
    SELECT v.*, COUNT(c.id) as clip_count
    FROM videos v
    LEFT JOIN clips c ON c.video_id = v.id
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `).all() as Video[];
}

export function getVideo(id: string): Video | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;
}

export function createVideo(video: Omit<Video, 'created_at' | 'updated_at' | 'clip_count'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(video.id, video.youtube_video_id, video.title, video.movie_title, video.genre, video.difficulty, video.duration_seconds);
}

// ── Clip helpers ─────────────────────────────────────────────────

export interface Clip {
  id: number;
  video_id: string;
  start_time: number;
  end_time: number;
  status: string;
  created_at: string;
}

export interface ClipWithDetails extends Clip {
  youtube_video_id: string;
  movie_title: string;
  video_title: string;
  lines: SubtitleLine[];
}

export function getClipsForVideo(videoId: string): Clip[] {
  const db = getDb();
  return db.prepare('SELECT * FROM clips WHERE video_id = ? ORDER BY start_time').all(videoId) as Clip[];
}

export function getClipWithDetails(clipId: number): ClipWithDetails | undefined {
  const db = getDb();
  const clip = db.prepare(`
    SELECT c.*, v.youtube_video_id, v.movie_title, v.title as video_title
    FROM clips c JOIN videos v ON v.id = c.video_id
    WHERE c.id = ?
  `).get(clipId) as (ClipWithDetails | undefined);
  if (!clip) return undefined;
  clip.lines = getLinesForClip(clipId);
  return clip;
}

export function getAllApprovedClips(): ClipWithDetails[] {
  const db = getDb();
  const clips = db.prepare(`
    SELECT c.*, v.youtube_video_id, v.movie_title, v.title as video_title
    FROM clips c JOIN videos v ON v.id = c.video_id
    WHERE c.status = 'approved'
    ORDER BY c.created_at DESC
  `).all() as ClipWithDetails[];
  for (const clip of clips) {
    clip.lines = getLinesForClip(clip.id);
  }
  return clips;
}

export function getClipsByTag(tagName: string): ClipWithDetails[] {
  const db = getDb();
  const clips = db.prepare(`
    SELECT c.*, v.youtube_video_id, v.movie_title, v.title as video_title
    FROM clips c
    JOIN videos v ON v.id = c.video_id
    JOIN clip_tags ct ON ct.clip_id = c.id
    JOIN tags t ON t.id = ct.tag_id
    WHERE c.status = 'approved' AND t.name = ?
    ORDER BY c.created_at DESC
  `).all(tagName) as ClipWithDetails[];
  for (const clip of clips) {
    clip.lines = getLinesForClip(clip.id);
  }
  return clips;
}

export function createClip(videoId: string, startTime: number, endTime: number): number {
  const db = getDb();
  const result = db.prepare('INSERT INTO clips (video_id, start_time, end_time) VALUES (?, ?, ?)').run(videoId, startTime, endTime);
  return result.lastInsertRowid as number;
}

export function updateClipStatus(clipId: number, status: string): void {
  const db = getDb();
  db.prepare('UPDATE clips SET status = ? WHERE id = ?').run(status, clipId);
}

// ── Subtitle line helpers ────────────────────────────────────────

export interface SubtitleLine {
  id: number;
  clip_id: number;
  line_index: number;
  speaker: string;
  text: string;
  translation_tr: string | null;
  start_time: number;
  end_time: number;
  words?: WordTimestamp[];
}

export function getLinesForClip(clipId: number): SubtitleLine[] {
  const db = getDb();
  const lines = db.prepare('SELECT * FROM subtitle_lines WHERE clip_id = ? ORDER BY line_index').all(clipId) as SubtitleLine[];
  for (const line of lines) {
    line.words = getWordsForLine(line.id);
  }
  return lines;
}

export function createSubtitleLine(clipId: number, lineIndex: number, speaker: string, text: string, startTime: number, endTime: number): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(clipId, lineIndex, speaker, text, startTime, endTime);
  return result.lastInsertRowid as number;
}

export function updateSubtitleLine(lineId: number, updates: { speaker?: string; text?: string; start_time?: number; end_time?: number }): void {
  const db = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (updates.speaker !== undefined) { sets.push('speaker = ?'); vals.push(updates.speaker); }
  if (updates.text !== undefined) { sets.push('text = ?'); vals.push(updates.text); }
  if (updates.start_time !== undefined) { sets.push('start_time = ?'); vals.push(updates.start_time); }
  if (updates.end_time !== undefined) { sets.push('end_time = ?'); vals.push(updates.end_time); }
  if (sets.length === 0) return;
  vals.push(lineId);
  db.prepare(`UPDATE subtitle_lines SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteSubtitleLine(lineId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM subtitle_lines WHERE id = ?').run(lineId);
}

export function deleteAllLinesForClip(clipId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(clipId);
}

// ── Word timestamp helpers ───────────────────────────────────────

export interface WordTimestamp {
  id: number;
  line_id: number;
  word_index: number;
  word: string;
  start_time: number;
  end_time: number;
}

export function getWordsForLine(lineId: number): WordTimestamp[] {
  const db = getDb();
  return db.prepare('SELECT * FROM word_timestamps WHERE line_id = ? ORDER BY word_index').all(lineId) as WordTimestamp[];
}

export function createWordTimestamp(lineId: number, wordIndex: number, word: string, startTime: number, endTime: number): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
  ).run(lineId, wordIndex, word, startTime, endTime);
}

export function deleteWordsForLine(lineId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM word_timestamps WHERE line_id = ?').run(lineId);
}

// ── Tag helpers ──────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  category: string;
}

export function getAllTags(): Tag[] {
  const db = getDb();
  return db.prepare('SELECT * FROM tags ORDER BY category, name').all() as Tag[];
}

export function createTag(name: string, category: string = 'vocab'): number {
  const db = getDb();
  const result = db.prepare('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)').run(name, category);
  if (result.changes === 0) {
    const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number };
    return existing.id;
  }
  return result.lastInsertRowid as number;
}

export function addTagToClip(clipId: number, tagId: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?, ?)').run(clipId, tagId);
}

export function getTagsForClip(clipId: number): Tag[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN clip_tags ct ON ct.tag_id = t.id
    WHERE ct.clip_id = ?
    ORDER BY t.name
  `).all(clipId) as Tag[];
}

// ── Lesson helpers ───────────────────────────────────────────────

export interface Lesson {
  id: number;
  title: string;
  title_tr: string | null;
  description: string | null;
  level: string;
  grammar_focus: string | null;
  created_at: string;
  sentence_count?: number;
}

export interface LessonSentence {
  id: number;
  lesson_id: number;
  line_id: number;
  sort_order: number;
  grammar_annotations: string | null; // JSON: [{word_index, role: 'subject'|'auxiliary'|'predicate'}]
  translations: string | null;         // JSON: [{word, tr}]
  // Joined fields
  text?: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  youtube_video_id?: string;
  movie_title?: string;
  words?: WordTimestamp[];
}

export function getAllLessons(): Lesson[] {
  const db = getDb();
  return db.prepare(`
    SELECT l.*, COUNT(ls.id) as sentence_count
    FROM lessons l
    LEFT JOIN lesson_sentences ls ON ls.lesson_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all() as Lesson[];
}

export function getLesson(id: number): Lesson | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as Lesson | undefined;
}

export function createLesson(title: string, titleTr: string | null, description: string | null, level: string, grammarFocus: string | null): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO lessons (title, title_tr, description, level, grammar_focus) VALUES (?, ?, ?, ?, ?)'
  ).run(title, titleTr, description, level, grammarFocus);
  return result.lastInsertRowid as number;
}

export function deleteLesson(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
}

export function getLessonSentences(lessonId: number): LessonSentence[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ls.*, sl.text, sl.speaker, sl.start_time, sl.end_time,
           v.youtube_video_id, v.movie_title
    FROM lesson_sentences ls
    JOIN subtitle_lines sl ON sl.id = ls.line_id
    JOIN clips c ON c.id = sl.clip_id
    JOIN videos v ON v.id = c.video_id
    WHERE ls.lesson_id = ?
    ORDER BY ls.sort_order
  `).all(lessonId) as LessonSentence[];

  for (const row of rows) {
    row.words = getWordsForLine(row.line_id);
  }
  return rows;
}

export function addSentenceToLesson(lessonId: number, lineId: number, sortOrder: number, grammarAnnotations: string | null, translations: string | null): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO lesson_sentences (lesson_id, line_id, sort_order, grammar_annotations, translations) VALUES (?, ?, ?, ?, ?)'
  ).run(lessonId, lineId, sortOrder, grammarAnnotations, translations);
  return result.lastInsertRowid as number;
}

export function updateSentenceAnnotations(id: number, grammarAnnotations: string, translations: string): void {
  const db = getDb();
  db.prepare('UPDATE lesson_sentences SET grammar_annotations = ?, translations = ? WHERE id = ?').run(grammarAnnotations, translations, id);
}

export function removeSentenceFromLesson(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM lesson_sentences WHERE id = ?').run(id);
}

export function searchSubtitleLines(query: string, limit: number = 20): (SubtitleLine & { youtube_video_id: string; movie_title: string })[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT sl.*, v.youtube_video_id, v.movie_title
    FROM subtitle_lines sl
    JOIN clips c ON c.id = sl.clip_id
    JOIN videos v ON v.id = c.video_id
    WHERE sl.text LIKE ?
    ORDER BY LENGTH(sl.text) ASC
    LIMIT ?
  `).all(`%${query}%`, limit) as any[];
  for (const row of rows) {
    row.words = getWordsForLine(row.id);
  }
  return rows;
}

export function deleteVideo(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM videos WHERE id = ?').run(id);
}

export function deleteClip(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM clips WHERE id = ?').run(id);
}

export function deleteTag(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
}

export function removeTagFromClip(clipId: number, tagId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM clip_tags WHERE clip_id = ? AND tag_id = ?').run(clipId, tagId);
}

// ── Curriculum helpers ───────────────────────────────────────────

export interface CurriculumUnit {
  id: string;
  title: string;
  title_tr: string | null;
  description: string | null;
  cefr_level: string;
  sort_order: number;
  color: string | null;
  lesson_count?: number;
}

export interface CurriculumLesson {
  id: string;
  unit_id: string;
  title: string;
  title_tr: string | null;
  description: string | null;
  sort_order: number;
  lesson_type: string;
  grammar_pattern: string | null;
  grammar_explanation: string | null;
  grammar_explanation_tr: string | null;
  examples: string | null;       // JSON array
  exercises: string | null;      // JSON array
  sections: string | null;       // JSON array of LessonSection
  status: string;
}

export function getAllCurriculumUnits(): CurriculumUnit[] {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, COUNT(cl.id) as lesson_count
    FROM curriculum_units u
    LEFT JOIN curriculum_lessons cl ON cl.unit_id = u.id
    GROUP BY u.id
    ORDER BY u.sort_order
  `).all() as CurriculumUnit[];
}

export function getCurriculumUnit(id: string): CurriculumUnit | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM curriculum_units WHERE id = ?').get(id) as CurriculumUnit | undefined;
}

export function createCurriculumUnit(unit: Omit<CurriculumUnit, 'lesson_count'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO curriculum_units (id, title, title_tr, description, cefr_level, sort_order, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(unit.id, unit.title, unit.title_tr, unit.description, unit.cefr_level, unit.sort_order, unit.color);
}

export function deleteCurriculumUnit(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM curriculum_units WHERE id = ?').run(id);
}

export function getLessonsForUnit(unitId: string): CurriculumLesson[] {
  const db = getDb();
  return db.prepare('SELECT * FROM curriculum_lessons WHERE unit_id = ? ORDER BY sort_order').all(unitId) as CurriculumLesson[];
}

export function getCurriculumLesson(id: string): CurriculumLesson | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM curriculum_lessons WHERE id = ?').get(id) as CurriculumLesson | undefined;
}

export function createCurriculumLesson(lesson: CurriculumLesson): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO curriculum_lessons (id, unit_id, title, title_tr, description, sort_order, lesson_type, grammar_pattern, grammar_explanation, grammar_explanation_tr, examples, exercises, sections, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lesson.id, lesson.unit_id, lesson.title, lesson.title_tr, lesson.description,
    lesson.sort_order, lesson.lesson_type, lesson.grammar_pattern,
    lesson.grammar_explanation, lesson.grammar_explanation_tr,
    lesson.examples, lesson.exercises, lesson.sections, lesson.status
  );
}

export function updateCurriculumLesson(id: string, updates: Partial<CurriculumLesson>): void {
  const db = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    sets.push(`${key} = ?`);
    vals.push(value);
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE curriculum_lessons SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteCurriculumLesson(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM curriculum_lessons WHERE id = ?').run(id);
}

export function getPrerequisites(lessonId: string): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT required_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(lessonId) as { required_lesson_id: string }[];
  return rows.map(r => r.required_lesson_id);
}

export function setPrerequisites(lessonId: string, requiredLessonIds: string[]): void {
  const db = getDb();
  db.prepare('DELETE FROM lesson_prerequisites WHERE lesson_id = ?').run(lessonId);
  const insert = db.prepare('INSERT INTO lesson_prerequisites (lesson_id, required_lesson_id) VALUES (?, ?)');
  for (const reqId of requiredLessonIds) {
    insert.run(lessonId, reqId);
  }
}

export function getFullCurriculum(): (CurriculumUnit & { lessons: CurriculumLesson[] })[] {
  const units = getAllCurriculumUnits();
  return units.map(unit => ({
    ...unit,
    lessons: getLessonsForUnit(unit.id),
  }));
}

// ── Vocab word helpers ──────────────────────────────────────────

export interface VocabWord {
  id: string;
  word: string;
  ipa: string | null;
  part_of_speech: string | null;
  translation_tr: string | null;
  example_sentence: string | null;
  example_translation_tr: string | null;
  frequency_rank: number | null;
  cefr_level: string | null;
}

export interface VocabSet {
  id: string;
  lesson_id: string | null;
  title: string;
  title_tr: string | null;
  word_count?: number;
}

export function createVocabWord(word: VocabWord): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO vocab_words (id, word, ipa, part_of_speech, translation_tr, example_sentence, example_translation_tr, frequency_rank, cefr_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(word.id, word.word, word.ipa, word.part_of_speech, word.translation_tr, word.example_sentence, word.example_translation_tr, word.frequency_rank, word.cefr_level);
}

export function getVocabWord(id: string): VocabWord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM vocab_words WHERE id = ?').get(id) as VocabWord | undefined;
}

export function getAllVocabWords(): VocabWord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM vocab_words ORDER BY frequency_rank, word').all() as VocabWord[];
}

export function createVocabSet(set: Omit<VocabSet, 'word_count'>): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO vocab_sets (id, lesson_id, title, title_tr) VALUES (?, ?, ?, ?)').run(set.id, set.lesson_id, set.title, set.title_tr);
}

export function getVocabSet(id: string): (VocabSet & { words: VocabWord[] }) | undefined {
  const db = getDb();
  const set = db.prepare('SELECT * FROM vocab_sets WHERE id = ?').get(id) as VocabSet | undefined;
  if (!set) return undefined;
  const words = db.prepare(`
    SELECT vw.* FROM vocab_words vw
    JOIN vocab_set_words vsw ON vsw.word_id = vw.id
    WHERE vsw.set_id = ?
    ORDER BY vsw.sort_order
  `).all(id) as VocabWord[];
  return { ...set, words };
}

export function getAllVocabSets(): VocabSet[] {
  const db = getDb();
  return db.prepare(`
    SELECT vs.*, COUNT(vsw.word_id) as word_count
    FROM vocab_sets vs
    LEFT JOIN vocab_set_words vsw ON vsw.set_id = vs.id
    GROUP BY vs.id
    ORDER BY vs.title
  `).all() as VocabSet[];
}

export function addWordToVocabSet(setId: string, wordId: string, sortOrder: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO vocab_set_words (set_id, word_id, sort_order) VALUES (?, ?, ?)').run(setId, wordId, sortOrder);
}

// ── Clip structure/vocab mapping helpers ─────────────────────────

const CLIP_PADDING = 30; // seconds before/after targeted sentences

/**
 * Recalculate a clip's start/end times based on its targeted lines.
 * Rule: start = earliest_target - 30s (min 0), end = latest_target + 30s
 * Must be called after any change to targeted_lines for this clip.
 */
export function enforceClipBounds(clipId: number): void {
  const db = getDb();
  const bounds = db.prepare(`
    SELECT MIN(sl.start_time) as min_start, MAX(sl.end_time) as max_end
    FROM targeted_lines tl
    JOIN subtitle_lines sl ON sl.id = tl.line_id
    WHERE tl.clip_id = ?
  `).get(clipId) as { min_start: number | null; max_end: number | null } | undefined;

  if (bounds?.min_start != null && bounds?.max_end != null) {
    const newStart = Math.max(0, bounds.min_start - CLIP_PADDING);
    const newEnd = bounds.max_end + CLIP_PADDING;
    db.prepare('UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?').run(newStart, newEnd, clipId);
  }
}

/**
 * Validate that a clip has targeted lines and correct bounds.
 * Returns false if the clip violates the rule.
 */
export function validateClipRule(clipId: number): boolean {
  const db = getDb();
  // Must have at least one targeted line
  const hasTargets = db.prepare('SELECT 1 FROM targeted_lines WHERE clip_id = ? LIMIT 1').get(clipId);
  if (!hasTargets) return false;

  // Bounds must match
  const bounds = db.prepare(`
    SELECT MIN(sl.start_time) as min_start, MAX(sl.end_time) as max_end
    FROM targeted_lines tl JOIN subtitle_lines sl ON sl.id = tl.line_id
    WHERE tl.clip_id = ?
  `).get(clipId) as { min_start: number; max_end: number };
  const clip = db.prepare('SELECT start_time, end_time FROM clips WHERE id = ?').get(clipId) as { start_time: number; end_time: number };
  if (!clip) return false;

  const expectedStart = Math.max(0, bounds.min_start - CLIP_PADDING);
  const expectedEnd = bounds.max_end + CLIP_PADDING;
  return Math.abs(clip.start_time - expectedStart) <= 0.5 && Math.abs(clip.end_time - expectedEnd) <= 0.5;
}

export function addStructureToClip(clipId: number, lessonId: string, lineId?: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id, line_id) VALUES (?, ?, ?)').run(clipId, lessonId, lineId ?? null);
}

export function getClipsByStructure(lessonId: string): ClipWithDetails[] {
  const db = getDb();
  const clips = db.prepare(`
    SELECT c.*, v.youtube_video_id, v.movie_title, v.title as video_title
    FROM clips c
    JOIN videos v ON v.id = c.video_id
    JOIN clip_structures cs ON cs.clip_id = c.id
    WHERE cs.lesson_id = ? AND c.status = 'approved'
    ORDER BY c.created_at DESC
  `).all(lessonId) as ClipWithDetails[];
  for (const clip of clips) {
    clip.lines = getLinesForClip(clip.id);
  }
  return clips;
}

export function addVocabToClip(clipId: number, wordId: string, lineId?: number, count: number = 1): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, ?)').run(clipId, wordId, lineId ?? null, count);
}

export function getClipsByVocabWord(wordId: string): ClipWithDetails[] {
  const db = getDb();
  const clips = db.prepare(`
    SELECT c.*, v.youtube_video_id, v.movie_title, v.title as video_title
    FROM clips c
    JOIN videos v ON v.id = c.video_id
    JOIN clip_vocab cv ON cv.clip_id = c.id
    WHERE cv.word_id = ? AND c.status = 'approved'
    ORDER BY c.created_at DESC
  `).all(wordId) as ClipWithDetails[];
  for (const clip of clips) {
    clip.lines = getLinesForClip(clip.id);
  }
  return clips;
}

// ── Paginated queries ───────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface VideoWithStats extends Video {
  line_count: number;
  word_count: number;
}

export function getVideosPaginated(opts: {
  page: number;
  pageSize: number;
  search?: string;
  show?: string;
  difficulty?: string;
  since?: string;
}): PaginatedResult<VideoWithStats> {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.search) {
    conditions.push('(v.title LIKE ? OR v.movie_title LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.show) {
    conditions.push('v.movie_title = ?');
    params.push(opts.show);
  }
  if (opts.difficulty) {
    conditions.push('v.difficulty = ?');
    params.push(opts.difficulty);
  }
  if (opts.since) {
    // Normalize ISO timestamp to SQLite datetime format (YYYY-MM-DD HH:MM:SS)
    const normalized = opts.since.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
    conditions.push('v.created_at >= ?');
    params.push(normalized);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM videos v ${where}`).get(...params) as any).n;

  const offset = (opts.page - 1) * opts.pageSize;
  const data = db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as line_count,
      (SELECT COUNT(*) FROM word_timestamps wt JOIN subtitle_lines sl ON wt.line_id = sl.id JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as word_count
    FROM videos v
    ${where}
    ORDER BY v.movie_title ASC, v.title ASC
    LIMIT ? OFFSET ?
  `).all(...params, opts.pageSize, offset) as VideoWithStats[];

  return {
    data,
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export function getDistinctShows(): { movie_title: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT movie_title, COUNT(*) as count
    FROM videos
    WHERE movie_title != ''
    GROUP BY movie_title
    ORDER BY count DESC
  `).all() as { movie_title: string; count: number }[];
}

export function getDistinctDifficulties(): string[] {
  const db = getDb();
  return (db.prepare('SELECT DISTINCT difficulty FROM videos ORDER BY difficulty').all() as { difficulty: string }[]).map(r => r.difficulty);
}

export function getLessonsPaginated(opts: {
  page: number;
  pageSize: number;
  search?: string;
}): PaginatedResult<Lesson> {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.search) {
    conditions.push('(l.title LIKE ? OR l.description LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM lessons l ${where}`).get(...params) as any).n;

  const offset = (opts.page - 1) * opts.pageSize;
  const data = db.prepare(`
    SELECT l.*, COUNT(ls.id) as sentence_count
    FROM lessons l
    LEFT JOIN lesson_sentences ls ON ls.lesson_id = l.id
    ${where}
    GROUP BY l.id
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, opts.pageSize, offset) as Lesson[];

  return {
    data,
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

// ── Stats ────────────────────────────────────────────────────────

export function getStats(): { videos: number; clips: number; approved: number; tags: number } {
  const db = getDb();
  const videos = (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n;
  const clips = (db.prepare('SELECT COUNT(*) as n FROM clips').get() as any).n;
  const approved = (db.prepare("SELECT COUNT(*) as n FROM clips WHERE status = 'approved'").get() as any).n;
  const tags = (db.prepare('SELECT COUNT(*) as n FROM tags').get() as any).n;
  return { videos, clips, approved, tags };
}
