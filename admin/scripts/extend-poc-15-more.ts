/**
 * Add 15 more curated videos to the POC corpus (additive — does not touch
 * the existing POC 15). The picks were chosen by the same composite score
 * as `select-poc-videos.ts` but filtered for family-friendly content and
 * diversity across movies/shows. Re-running is idempotent.
 *
 * Run: cd admin && npx tsx scripts/extend-poc-15-more.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const NEW_POC_IDS = [
  'inside-out-emotions',
  'if-ryan-reynolds-funny-tour-scene',
  'ending-the-idea-of-you-movie',
  'adaline-jenny-actually',
  'dear-john-first-meeting-opening-scene',
  'chief-meets-with-rescued-orphan-years-later-in-heartwarming-reunion-chicago-fire',
  'anne-hathaways-mindblowing-final-modern-love-prime-video',
  'michael-jackson-performs-billie-jean-song-michael',
  'instant-family-not-coming',
  'madagascar-zoo',
  'the-mandalorian-baby-yoda-w0hxmhxsgxo',
  'mrs-doubtfire-trying-to-make-dinner-scene',
  'the-truman-show-ending-zyn-hhcya',
  'little-mermaid-part-world',
  '17-again-maggies-breakup-scene---cinemafilm-s',
];

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Extend POC by 15 more videos');
console.log('-----------------------------');

const placeholders = NEW_POC_IDS.map(() => '?').join(',');
const found = db
  .prepare(`SELECT id, movie_title, title, poc FROM videos WHERE id IN (${placeholders})`)
  .all(...NEW_POC_IDS) as { id: string; movie_title: string; title: string; poc: number }[];

const foundSet = new Set(found.map(r => r.id));
const missing = NEW_POC_IDS.filter(id => !foundSet.has(id));
if (missing.length > 0) {
  console.error('Missing video IDs in DB — aborting:');
  for (const id of missing) console.error(`  ${id}`);
  process.exit(1);
}

const alreadyPoc = found.filter(r => r.poc === 1);
if (alreadyPoc.length > 0) {
  console.log(`(${alreadyPoc.length} already flagged poc=1, will be no-ops)`);
}

const flag = db.prepare(`UPDATE videos SET poc = 1 WHERE id = ? AND poc = 0`);
let newlyFlagged = 0;
const tx = db.transaction(() => {
  for (const id of NEW_POC_IDS) newlyFlagged += flag.run(id).changes;
});
tx();
console.log(`Newly flagged ${newlyFlagged} videos as POC.`);

const summary = db
  .prepare(
    `SELECT v.id, v.movie_title, v.title,
       (SELECT COUNT(*) FROM clips WHERE video_id = v.id AND status='approved') AS approved_clips,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.video_id=v.id AND c.status='approved') AS lines,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.video_id=v.id AND c.status='approved' AND sl.translation_tr IS NOT NULL AND length(trim(sl.translation_tr))>0) AS lines_tr,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.video_id=v.id AND c.status='approved' AND sl.structure IS NOT NULL) AS lines_struct,
       (SELECT COUNT(DISTINCT cv.word_id) FROM clip_vocab cv JOIN clips c ON c.id=cv.clip_id WHERE c.video_id=v.id AND c.status='approved' AND cv.word_id LIKE 'a2-%') AS distinct_a2
     FROM videos v
     WHERE v.id IN (${placeholders})
     ORDER BY distinct_a2 DESC`,
  )
  .all(...NEW_POC_IDS);
console.table(summary);

const totals = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM videos WHERE poc=1) AS poc_videos,
       (SELECT COUNT(*) FROM clips WHERE status='approved' AND video_id IN (SELECT id FROM videos WHERE poc=1)) AS poc_approved_clips,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id WHERE v.poc=1 AND c.status='approved') AS poc_lines,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id WHERE v.poc=1 AND c.status='approved' AND sl.translation_tr IS NOT NULL AND length(trim(sl.translation_tr))>0) AS poc_lines_tr,
       (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id WHERE v.poc=1 AND c.status='approved' AND sl.structure IS NOT NULL) AS poc_lines_struct`,
  )
  .get();
console.log('\nNew POC totals:');
console.log(totals);

db.close();
