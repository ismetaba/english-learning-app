/**
 * Auto-trim all assigned clips based on targeted sentences.
 *
 * For each clip assigned to a lesson:
 * 1. Find subtitle lines that match the lesson's grammar pattern
 * 2. Save them as targeted_lines entries (if not already explicitly set)
 * 3. Set clip start = earliest_target - 30s, end = latest_target + 30s
 *
 * Run: cd admin && npx tsx scripts/auto-trim-clips.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure targeted_lines table exists
db.exec(`CREATE TABLE IF NOT EXISTS targeted_lines (
  clip_id INTEGER NOT NULL,
  lesson_id TEXT NOT NULL,
  line_id INTEGER NOT NULL,
  PRIMARY KEY (clip_id, lesson_id, line_id)
)`);

const PADDING = 30; // seconds

const LESSON_PATTERNS: Record<string, RegExp> = {
  'lesson-01-greetings': /\b(hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|my\s+name\s+is|nice\s+to\s+meet|goodbye|bye|how\s+are\s+you)\b/i,
  'lesson-02-courtesy-phrases': /\b(please|thank\s+you|thanks|sorry|excuse\s+me|you'?re\s+welcome|pardon)\b/i,
  'lesson-03-subject-pronouns': /\b(I\s+am|I'm|you\s+are|you're|he\s+is|he's|she\s+is|she's|we\s+are|we're|they\s+are|they're)\b/i,
  'lesson-04-to-be-noun': /\b(I\s+am\s+a|I'm\s+a|he\s+is\s+a|he's\s+a|she\s+is\s+a|she's\s+a|is\s+a|am\s+a)\b/i,
  'lesson-05-to-be-adjective': /\b(I'm\s+(?!a\b|not\b|gonna\b)|is\s+(?:so\s+|very\s+)?(?:happy|sad|tired|angry|scared|beautiful|smart|good|bad|great|fine|ready|afraid|crazy|dead|alive|safe|sick|nice|cool))/i,
  'lesson-06-to-be-negative': /\b(I'm\s+not|isn't|is\s+not|aren't|are\s+not|it's\s+not|that's\s+not|he's\s+not|she's\s+not)\b/i,
  'lesson-07-to-be-questions': /^(are\s+you|is\s+he|is\s+she|is\s+it|is\s+this|is\s+that|am\s+I)/i,
  'lesson-08-wh-questions-to-be': /^(what\s+is|what's|where\s+is|where's|who\s+is|who's|how\s+is|how's|how\s+are|why\s+is)/i,
  'lesson-09-articles': /\b(a\s+\w+|an\s+\w+|the\s+\w+)\b/i,
  'lesson-10-demonstratives': /\b(this\s+is|that\s+is|that's|these\s+are|those\s+are)\b/i,
  'lesson-11-possessive-adjectives': /\b(my\s+\w+|your\s+\w+|his\s+\w+|her\s+\w+|our\s+\w+|their\s+\w+)\b/i,
  'lesson-12-basic-vocabulary': /\b(red|blue|green|yellow|black|white|mother|father|mom|dad|brother|sister|family|hand|head|eye|face|heart)\b/i,
  'lesson-13-simple-commands': /^(come|go|look|stop|run|wait|listen|sit|stand|open|close|get|take|give|don't)\b/i,
};

interface Assignment {
  clip_id: number;
  lesson_id: string;
}

interface SubLine {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
}

// Get all clip-lesson assignments
const assignments = db.prepare(`
  SELECT DISTINCT cs.clip_id, cs.lesson_id
  FROM clip_structures cs
`).all() as Assignment[];

console.log(`Processing ${assignments.length} clip-lesson assignments...`);

const insertTarget = db.prepare('INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id) VALUES (?, ?, ?)');
const updateClip = db.prepare('UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?');
const hasExplicit = db.prepare('SELECT 1 FROM targeted_lines WHERE clip_id = ? AND lesson_id = ? LIMIT 1');

let trimmed = 0;
let targeted = 0;
let skippedExplicit = 0;

for (const { clip_id, lesson_id } of assignments) {
  const pattern = LESSON_PATTERNS[lesson_id];
  if (!pattern) continue;

  // Skip if already has explicit targeted lines
  const existing = hasExplicit.get(clip_id, lesson_id);
  if (existing) {
    // Still trim based on existing targets
    const existingTargets = db.prepare(
      'SELECT sl.start_time, sl.end_time FROM targeted_lines tl JOIN subtitle_lines sl ON sl.id = tl.line_id WHERE tl.clip_id = ? AND tl.lesson_id = ?'
    ).all(clip_id, lesson_id) as { start_time: number; end_time: number }[];

    if (existingTargets.length > 0) {
      const minStart = Math.max(0, Math.min(...existingTargets.map(t => t.start_time)) - PADDING);
      const maxEnd = Math.max(...existingTargets.map(t => t.end_time)) + PADDING;
      updateClip.run(minStart, maxEnd, clip_id);
      trimmed++;
    }
    skippedExplicit++;
    continue;
  }

  // Get subtitle lines for this clip
  const lines = db.prepare('SELECT id, text, start_time, end_time FROM subtitle_lines WHERE clip_id = ? ORDER BY start_time').all(clip_id) as SubLine[];

  // Find matching lines
  const matches: SubLine[] = [];
  for (const line of lines) {
    if (pattern.test(line.text)) {
      insertTarget.run(clip_id, lesson_id, line.id);
      matches.push(line);
      targeted++;
    }
  }

  // Auto-trim clip based on matched lines
  if (matches.length > 0) {
    const minStart = Math.max(0, Math.min(...matches.map(m => m.start_time)) - PADDING);
    const maxEnd = Math.max(...matches.map(m => m.end_time)) + PADDING;
    updateClip.run(minStart, maxEnd, clip_id);
    trimmed++;
  }
}

console.log(`Done!`);
console.log(`  Targeted lines added: ${targeted}`);
console.log(`  Clips trimmed: ${trimmed}`);
console.log(`  Skipped (already explicit): ${skippedExplicit}`);

const stats = db.prepare('SELECT COUNT(*) as n FROM targeted_lines').get() as { n: number };
console.log(`  Total targeted_lines: ${stats.n}`);

db.close();
