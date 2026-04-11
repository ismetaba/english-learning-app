/**
 * Split shared clips into per-lesson clips.
 *
 * Before: 1 clip per video, assigned to N lessons, trimmed to widest window
 * After: N clips per video, one per lesson, each trimmed to 30s around that lesson's targets
 *
 * Run: cd admin && npx tsx scripts/split-clips-per-lesson.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const PADDING = 30;

interface Assignment {
  clip_id: number;
  lesson_id: string;
  video_id: string;
}

interface TargetedLine {
  line_id: number;
  start_time: number;
  end_time: number;
}

// Get all clip-lesson assignments with video info
const assignments = db.prepare(`
  SELECT cs.clip_id, cs.lesson_id, c.video_id
  FROM clip_structures cs
  JOIN clips c ON c.id = cs.clip_id
  ORDER BY c.video_id, cs.lesson_id
`).all() as Assignment[];

console.log(`Processing ${assignments.length} clip-lesson assignments...`);

const createClip = db.prepare(`
  INSERT INTO clips (video_id, start_time, end_time, status)
  VALUES (?, ?, ?, 'approved')
`);
const updateStructure = db.prepare(`
  UPDATE clip_structures SET clip_id = ? WHERE clip_id = ? AND lesson_id = ?
`);
const moveTargeted = db.prepare(`
  UPDATE targeted_lines SET clip_id = ? WHERE clip_id = ? AND lesson_id = ?
`);
const getTargets = db.prepare(`
  SELECT tl.line_id, sl.start_time, sl.end_time
  FROM targeted_lines tl
  JOIN subtitle_lines sl ON sl.id = tl.line_id
  WHERE tl.clip_id = ? AND tl.lesson_id = ?
`);
const getClipInfo = db.prepare(`SELECT start_time, end_time, status FROM clips WHERE id = ?`);

// Track which old clips can be deleted (if all their assignments are moved)
const oldClipAssignmentCount = new Map<number, number>();
const oldClipMovedCount = new Map<number, number>();

for (const a of assignments) {
  oldClipAssignmentCount.set(a.clip_id, (oldClipAssignmentCount.get(a.clip_id) || 0) + 1);
}

let created = 0;
let kept = 0;

// Group assignments by clip_id to handle clips with single assignment differently
const clipAssignments = new Map<number, Assignment[]>();
for (const a of assignments) {
  const list = clipAssignments.get(a.clip_id) || [];
  list.push(a);
  clipAssignments.set(a.clip_id, list);
}

for (const [clipId, assigns] of clipAssignments) {
  // If clip has only 1 lesson assignment, just trim in place
  if (assigns.length === 1) {
    const targets = getTargets.all(clipId, assigns[0].lesson_id) as TargetedLine[];
    if (targets.length > 0) {
      const minStart = Math.max(0, Math.min(...targets.map(t => t.start_time)) - PADDING);
      const maxEnd = Math.max(...targets.map(t => t.end_time)) + PADDING;
      db.prepare('UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?').run(minStart, maxEnd, clipId);
    }
    kept++;
    continue;
  }

  // Multiple lessons — create a new clip for each lesson
  const oldClip = getClipInfo.get(clipId) as { start_time: number; end_time: number; status: string } | undefined;
  if (!oldClip) continue;

  for (const a of assigns) {
    const targets = getTargets.all(a.clip_id, a.lesson_id) as TargetedLine[];

    let newStart: number, newEnd: number;
    if (targets.length > 0) {
      newStart = Math.max(0, Math.min(...targets.map(t => t.start_time)) - PADDING);
      newEnd = Math.max(...targets.map(t => t.end_time)) + PADDING;
    } else {
      // No targets — keep original bounds
      newStart = oldClip.start_time;
      newEnd = oldClip.end_time;
    }

    // Create new clip
    const result = createClip.run(a.video_id, newStart, newEnd);
    const newClipId = result.lastInsertRowid as number;

    // Move the assignment and targeted lines to the new clip
    updateStructure.run(newClipId, a.clip_id, a.lesson_id);
    moveTargeted.run(newClipId, a.clip_id, a.lesson_id);

    // Copy subtitle lines reference — subtitle_lines stay on the original clip
    // The new clip references the same video, so subtitle_lines are accessed via video_id + time range

    created++;
    oldClipMovedCount.set(a.clip_id, (oldClipMovedCount.get(a.clip_id) || 0) + 1);
  }
}

// Clean up old clips that had all assignments moved away
let deleted = 0;
for (const [clipId, totalAssigns] of oldClipAssignmentCount) {
  const moved = oldClipMovedCount.get(clipId) || 0;
  if (moved === totalAssigns) {
    // All assignments moved — check if old clip still has any references
    const remaining = (db.prepare('SELECT COUNT(*) as n FROM clip_structures WHERE clip_id = ?').get(clipId) as any).n;
    if (remaining === 0) {
      // Don't delete the clip — it still holds the subtitle_lines
      // Just leave it as an orphan. The subtitle_lines reference it.
      deleted++;
    }
  }
}

// Verify
const totalClips = (db.prepare('SELECT COUNT(*) as n FROM clips').get() as any).n;
const totalAssignments = (db.prepare('SELECT COUNT(*) as n FROM clip_structures').get() as any).n;

console.log(`Done!`);
console.log(`  New clips created: ${created}`);
console.log(`  Single-lesson clips trimmed in place: ${kept}`);
console.log(`  Old shared clips freed: ${deleted}`);
console.log(`  Total clips now: ${totalClips}`);
console.log(`  Total assignments: ${totalAssignments}`);

// Verify the rule
const violations = db.prepare(`
  SELECT c.id, v.title, c.start_time, c.end_time,
    MAX(0, MIN(sl.start_time) - 30) as expected_start,
    MAX(sl.end_time) + 30 as expected_end
  FROM clips c
  JOIN videos v ON v.id = c.video_id
  JOIN clip_structures cs ON cs.clip_id = c.id
  JOIN targeted_lines tl ON tl.clip_id = c.id AND tl.lesson_id = cs.lesson_id
  JOIN subtitle_lines sl ON sl.id = tl.line_id
  GROUP BY c.id
  HAVING ABS(c.start_time - expected_start) > 0.5 OR ABS(c.end_time - expected_end) > 0.5
`).all();

console.log(`  Rule violations: ${violations.length}`);

db.close();
