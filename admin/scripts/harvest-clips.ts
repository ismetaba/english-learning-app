/**
 * Harvest new clips from existing videos for A1 lessons.
 * For each video not yet assigned to a lesson, check if its subtitles
 * match the lesson's pattern. If yes, create a per-lesson clip with
 * targeted lines and 30s-padded bounds.
 *
 * Run: cd admin && npx tsx scripts/harvest-clips.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const PADDING = 30;

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

interface SubLine {
  id: number;
  line_index: number;
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

// Get all videos
const videos = db.prepare('SELECT DISTINCT v.id as video_id FROM videos v JOIN clips c ON c.video_id = v.id JOIN subtitle_lines sl ON sl.clip_id = c.id').all() as { video_id: string }[];

console.log(`Checking ${videos.length} videos for unharvested clips...`);

const insertClip = db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')");
const insertLine = db.prepare('INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)');
const insertStructure = db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)');
const insertTarget = db.prepare('INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id) VALUES (?, ?, ?)');
const updateClip = db.prepare('UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?');
const hasAssignment = db.prepare('SELECT 1 FROM clip_structures cs JOIN clips c ON c.id = cs.clip_id WHERE c.video_id = ? AND cs.lesson_id = ?');

let created = 0;
let targeted = 0;

for (const { video_id } of videos) {
  // Get all subtitle lines for this video (from any existing clip)
  const sourceClip = db.prepare('SELECT c.id FROM clips c JOIN subtitle_lines sl ON sl.clip_id = c.id WHERE c.video_id = ? LIMIT 1').get(video_id) as { id: number } | undefined;
  if (!sourceClip) continue;

  const lines = db.prepare('SELECT id, line_index, speaker, text, start_time, end_time FROM subtitle_lines WHERE clip_id = ? ORDER BY start_time').all(sourceClip.id) as SubLine[];
  if (lines.length === 0) continue;

  for (const [lessonId, pattern] of Object.entries(LESSON_PATTERNS)) {
    // Skip if already assigned
    if (hasAssignment.get(video_id, lessonId)) continue;

    // Find matching lines
    const matches = lines.filter(l => pattern.test(l.text));
    if (matches.length === 0) continue;

    // Create new clip
    const result = insertClip.run(video_id);
    const newClipId = result.lastInsertRowid as number;

    // Copy all subtitle lines to new clip
    for (const l of lines) {
      insertLine.run(newClipId, l.line_index, l.speaker, l.text, l.start_time, l.end_time);
    }

    // Get the new line IDs for the matching lines
    const newLines = db.prepare('SELECT id, text, start_time, end_time FROM subtitle_lines WHERE clip_id = ? ORDER BY start_time').all(newClipId) as SubLine[];

    // Link to lesson
    insertStructure.run(newClipId, lessonId);

    // Add targeted lines
    let targetCount = 0;
    for (const match of matches) {
      const newLine = newLines.find(nl => nl.text === match.text && Math.abs(nl.start_time - match.start_time) < 0.1);
      if (newLine) {
        insertTarget.run(newClipId, lessonId, newLine.id);
        targetCount++;
      }
    }

    if (targetCount === 0) {
      // No targets found — delete the clip
      db.prepare('DELETE FROM clip_structures WHERE clip_id = ?').run(newClipId);
      db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(newClipId);
      db.prepare('DELETE FROM clips WHERE id = ?').run(newClipId);
      continue;
    }

    // Auto-trim: 30s padding around targeted lines
    const targetedLines = db.prepare(`
      SELECT MIN(sl.start_time) as min_start, MAX(sl.end_time) as max_end
      FROM targeted_lines tl JOIN subtitle_lines sl ON sl.id = tl.line_id
      WHERE tl.clip_id = ?
    `).get(newClipId) as { min_start: number; max_end: number };

    const newStart = Math.max(0, targetedLines.min_start - PADDING);
    const newEnd = targetedLines.max_end + PADDING;
    updateClip.run(newStart, newEnd, newClipId);

    created++;
    targeted += targetCount;
  }
}

console.log(`Done!`);
console.log(`  New clips created: ${created}`);
console.log(`  Targeted lines added: ${targeted}`);

// Verify
const violations = db.prepare(`
  SELECT COUNT(*) as n FROM (
    SELECT c.id FROM clips c
    JOIN clip_structures cs ON cs.clip_id = c.id
    JOIN targeted_lines tl ON tl.clip_id = c.id AND tl.lesson_id = cs.lesson_id
    JOIN subtitle_lines sl ON sl.id = tl.line_id
    GROUP BY c.id, cs.lesson_id
    HAVING ABS(c.start_time - MAX(0, MIN(sl.start_time) - 30)) > 0.5
       OR ABS(c.end_time - (MAX(sl.end_time) + 30)) > 0.5
  )
`).get() as { n: number };
const noTargets = db.prepare(`
  SELECT COUNT(DISTINCT cs.clip_id) as n FROM clip_structures cs
  WHERE NOT EXISTS (SELECT 1 FROM targeted_lines tl WHERE tl.clip_id = cs.clip_id AND tl.lesson_id = cs.lesson_id)
`).get() as { n: number };
const total = (db.prepare('SELECT COUNT(*) as n FROM clip_structures').get() as any).n;

console.log(`  Total assignments: ${total}`);
console.log(`  Rule violations: ${violations.n}`);
console.log(`  No targets: ${noTargets.n}`);

db.close();
