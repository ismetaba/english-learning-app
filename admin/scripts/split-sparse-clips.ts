/**
 * Split clips where targeted lines are far apart (>60s gap).
 * If targeted lines cluster at 0:10, 0:20, and 2:00, 2:10:
 *   - Clip 1: 0:00 - 0:50 (targets at 0:10, 0:20)
 *   - Clip 2: 1:30 - 2:40 (targets at 2:00, 2:10)
 *
 * Run: cd admin && npx tsx scripts/split-sparse-clips.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const PADDING = 30;
const GAP_THRESHOLD = 60; // seconds — split if gap > this

interface TargetLine {
  line_id: number;
  text: string;
  start_time: number;
  end_time: number;
}

// Find clips where targeted lines span > 60s gap
const sparseClips = db.prepare(`
  SELECT c.id as clip_id, cs.lesson_id, c.video_id
  FROM clips c
  JOIN clip_structures cs ON cs.clip_id = c.id
  JOIN targeted_lines tl ON tl.clip_id = c.id AND tl.lesson_id = cs.lesson_id
  JOIN subtitle_lines sl ON sl.id = tl.line_id
  GROUP BY c.id, cs.lesson_id
  HAVING MAX(sl.start_time) - MIN(sl.start_time) > ?
`).all(GAP_THRESHOLD) as { clip_id: number; lesson_id: string; video_id: string }[];

console.log(`Found ${sparseClips.length} clips to check for splitting...`);

const insertClip = db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, ?, ?, 'approved')");
const insertStructure = db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)');
const insertTarget = db.prepare('INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id) VALUES (?, ?, ?)');
const insertLine = db.prepare('INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time, translation_tr) VALUES (?, ?, ?, ?, ?, ?, ?)');

let splitCount = 0;
let newClipsCreated = 0;

for (const { clip_id, lesson_id, video_id } of sparseClips) {
  // Get targeted lines for this clip+lesson, sorted by time
  const targets = db.prepare(`
    SELECT tl.line_id, sl.text, sl.start_time, sl.end_time
    FROM targeted_lines tl
    JOIN subtitle_lines sl ON sl.id = tl.line_id
    WHERE tl.clip_id = ? AND tl.lesson_id = ?
    ORDER BY sl.start_time
  `).all(clip_id, lesson_id) as TargetLine[];

  if (targets.length < 2) continue;

  // Group targets into clusters based on gap threshold
  const clusters: TargetLine[][] = [[targets[0]]];
  for (let i = 1; i < targets.length; i++) {
    const prevEnd = targets[i - 1].end_time;
    const currStart = targets[i].start_time;
    if (currStart - prevEnd > GAP_THRESHOLD) {
      clusters.push([targets[i]]);
    } else {
      clusters[clusters.length - 1].push(targets[i]);
    }
  }

  // Only split if there are multiple clusters
  if (clusters.length <= 1) continue;

  // Get all subtitle lines for this clip (to copy to new clips)
  const allLines = db.prepare(
    'SELECT line_index, speaker, text, start_time, end_time, translation_tr FROM subtitle_lines WHERE clip_id = ? ORDER BY start_time'
  ).all(clip_id) as { line_index: number; speaker: string; text: string; start_time: number; end_time: number; translation_tr: string | null }[];

  // Delete old clip assignment and targets
  db.prepare('DELETE FROM clip_structures WHERE clip_id = ? AND lesson_id = ?').run(clip_id, lesson_id);
  db.prepare('DELETE FROM targeted_lines WHERE clip_id = ? AND lesson_id = ?').run(clip_id, lesson_id);

  // Create new clip for each cluster
  for (const cluster of clusters) {
    const minStart = Math.max(0, Math.min(...cluster.map(t => t.start_time)) - PADDING);
    const maxEnd = Math.max(...cluster.map(t => t.end_time)) + PADDING;

    // Create new clip
    const result = insertClip.run(video_id, minStart, maxEnd);
    const newClipId = result.lastInsertRowid as number;

    // Copy subtitle lines within range (+5s buffer)
    const linesInRange = allLines.filter(l => l.start_time >= minStart - 5 && l.end_time <= maxEnd + 5);
    for (const l of linesInRange) {
      insertLine.run(newClipId, l.line_index, l.speaker, l.text, l.start_time, l.end_time, l.translation_tr);
    }

    // Link to lesson
    insertStructure.run(newClipId, lesson_id);

    // Add targeted lines — find new line IDs by matching text+time
    const newLines = db.prepare('SELECT id, text, start_time FROM subtitle_lines WHERE clip_id = ?').all(newClipId) as { id: number; text: string; start_time: number }[];
    for (const target of cluster) {
      const newLine = newLines.find(nl => nl.text === target.text && Math.abs(nl.start_time - target.start_time) < 0.1);
      if (newLine) {
        insertTarget.run(newClipId, lesson_id, newLine.id);
      }
    }

    // Copy word timestamps
    for (const target of cluster) {
      const newLine = newLines.find(nl => nl.text === target.text && Math.abs(nl.start_time - target.start_time) < 0.1);
      if (newLine) {
        const oldLineInClip = db.prepare('SELECT id FROM subtitle_lines WHERE clip_id = ? AND text = ? AND ABS(start_time - ?) < 0.1 LIMIT 1').get(clip_id, target.text, target.start_time) as { id: number } | undefined;
        if (oldLineInClip) {
          const words = db.prepare('SELECT word_index, word, start_time, end_time FROM word_timestamps WHERE line_id = ?').all(oldLineInClip.id) as any[];
          for (const w of words) {
            db.prepare('INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(newLine.id, w.word_index, w.word, w.start_time, w.end_time);
          }
        }
      }
    }

    newClipsCreated++;
  }

  // Delete old clip if it has no other lesson assignments
  const remaining = (db.prepare('SELECT COUNT(*) as n FROM clip_structures WHERE clip_id = ?').get(clip_id) as any).n;
  if (remaining === 0) {
    db.prepare('DELETE FROM word_timestamps WHERE line_id IN (SELECT id FROM subtitle_lines WHERE clip_id = ?)').run(clip_id);
    db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(clip_id);
    db.prepare('DELETE FROM clips WHERE id = ?').run(clip_id);
  }

  splitCount++;
}

// Clean orphans
const orphans = db.prepare("DELETE FROM clips WHERE NOT EXISTS (SELECT 1 FROM clip_structures WHERE clip_id = clips.id)").run();

console.log(`Done!`);
console.log(`  Clips split: ${splitCount}`);
console.log(`  New clips created: ${newClipsCreated}`);
console.log(`  Orphan clips cleaned: ${orphans.changes}`);

// Verify
const violations = (db.prepare(`SELECT COUNT(*) as n FROM (SELECT c.id FROM clips c JOIN clip_structures cs ON cs.clip_id = c.id JOIN targeted_lines tl ON tl.clip_id = c.id AND tl.lesson_id = cs.lesson_id JOIN subtitle_lines sl ON sl.id = tl.line_id GROUP BY c.id, cs.lesson_id HAVING ABS(c.start_time - MAX(0, MIN(sl.start_time) - 30)) > 0.5 OR ABS(c.end_time - (MAX(sl.end_time) + 30)) > 0.5)`).get() as any).n;
const dupes = (db.prepare(`SELECT COUNT(*) as n FROM (SELECT c.video_id, cs.lesson_id FROM clips c JOIN clip_structures cs ON cs.clip_id = c.id GROUP BY c.video_id, cs.lesson_id HAVING COUNT(*) > 1)`).get() as any).n;
console.log(`  Rule violations: ${violations}`);
console.log(`  Duplicate video+lesson (expected — multiple time ranges): ${dupes}`);

db.close();
