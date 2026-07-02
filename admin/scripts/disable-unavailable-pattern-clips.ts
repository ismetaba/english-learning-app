/**
 * Apply step: read the detector output and flip the `clips.status` of
 * every clip belonging to an unavailable video to `'video_unavailable'`.
 * Reversible — the rows stay in place, just no longer pass the
 * `status = 'approved'` gate used by patterns/vocab-feed/word-reels.
 *
 * Usage:
 *   # dry-run (default): show what would change
 *   npx tsx scripts/check-pattern-video-availability.ts --json \
 *     | npx tsx scripts/disable-unavailable-pattern-clips.ts
 *
 *   # actually update the DB
 *   npx tsx scripts/check-pattern-video-availability.ts --json \
 *     | npx tsx scripts/disable-unavailable-pattern-clips.ts --apply
 *
 * Input on stdin is the JSON array emitted by the detector (each entry
 * has at least `videoId` and `youtubeVideoId`).
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const DB_PATH = process.env.DATABASE_PATH ?? path.join(__dirname, '..', '..', 'data.db');

interface DetectorEntry {
  videoId: string;
  youtubeVideoId: string;
  movieTitle?: string;
  title?: string;
  sentenceCount?: number;
  reason?: string;
}

async function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf));
  });
}

function extractJsonArray(raw: string): DetectorEntry[] {
  // The detector's stderr is verbose; stdout is the JSON array. When
  // the user pipes everything together we still expect a clean JSON
  // payload on stdin. Be forgiving — find the first '[' and parse from
  // there.
  const start = raw.indexOf('[');
  if (start < 0) throw new Error('no JSON array found on stdin');
  const slice = raw.slice(start);
  return JSON.parse(slice) as DetectorEntry[];
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    console.error('stdin was empty — pipe the detector output in.');
    process.exit(2);
  }
  const entries = extractJsonArray(raw);
  if (entries.length === 0) {
    console.log('No unavailable videos in input — nothing to do.');
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: ${entries.length} unavailable video(s) to disable`);
  console.log('');

  const clipCountStmt = db.prepare(
    `SELECT COUNT(*) AS c FROM clips WHERE video_id = ? AND status = 'approved'`,
  );
  const updateStmt = db.prepare(
    `UPDATE clips SET status = 'video_unavailable' WHERE video_id = ? AND status = 'approved'`,
  );

  let totalClipsAffected = 0;
  const tx = db.transaction((es: DetectorEntry[]) => {
    for (const e of es) {
      const before = (clipCountStmt.get(e.videoId) as { c: number }).c;
      const tag = e.reason ?? 'unavailable';
      console.log(`  ${e.youtubeVideoId}  [${tag}]  ${e.movieTitle ?? e.videoId} — ${before} approved clip(s) would flip to video_unavailable`);
      totalClipsAffected += before;
      if (APPLY) updateStmt.run(e.videoId);
    }
  });
  tx(entries);

  console.log('');
  console.log(`Total approved clips ${APPLY ? 'flipped' : 'that would flip'}: ${totalClipsAffected}`);
  if (!APPLY) {
    console.log('');
    console.log('Re-run with --apply to actually update the DB.');
  }
}

main().catch(err => {
  console.error('fatal:', err);
  process.exit(1);
});
