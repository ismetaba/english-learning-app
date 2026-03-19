import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    // Run schema
    const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    _db.exec(schema);
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

// ── Stats ────────────────────────────────────────────────────────

export function getStats(): { videos: number; clips: number; approved: number; tags: number } {
  const db = getDb();
  const videos = (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n;
  const clips = (db.prepare('SELECT COUNT(*) as n FROM clips').get() as any).n;
  const approved = (db.prepare("SELECT COUNT(*) as n FROM clips WHERE status = 'approved'").get() as any).n;
  const tags = (db.prepare('SELECT COUNT(*) as n FROM tags').get() as any).n;
  return { videos, clips, approved, tags };
}
