/**
 * Append the new 15 POC videos to the "beginner-animation-1" set as
 * sort_order 16..30. Updates the set's title/descriptions to reflect 30
 * total scenes. Idempotent — INSERT OR IGNORE on the join table, so a
 * re-run is a no-op if the new items are already present.
 *
 * Run: cd admin && npx tsx scripts/extend-beginner-set.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const SET_ID = 'beginner-animation-1';
const NEW_ITEMS: { sort_order: number; video_id: string }[] = [
  { sort_order: 16, video_id: 'inside-out-emotions' },
  { sort_order: 17, video_id: 'mrs-doubtfire-trying-to-make-dinner-scene' },
  { sort_order: 18, video_id: 'madagascar-zoo' },
  { sort_order: 19, video_id: 'little-mermaid-part-world' },
  { sort_order: 20, video_id: 'the-mandalorian-baby-yoda-w0hxmhxsgxo' },
  { sort_order: 21, video_id: 'if-ryan-reynolds-funny-tour-scene' },
  { sort_order: 22, video_id: 'instant-family-not-coming' },
  { sort_order: 23, video_id: 'ending-the-idea-of-you-movie' },
  { sort_order: 24, video_id: '17-again-maggies-breakup-scene---cinemafilm-s' },
  { sort_order: 25, video_id: 'adaline-jenny-actually' },
  { sort_order: 26, video_id: 'dear-john-first-meeting-opening-scene' },
  { sort_order: 27, video_id: 'anne-hathaways-mindblowing-final-modern-love-prime-video' },
  { sort_order: 28, video_id: 'the-truman-show-ending-zyn-hhcya' },
  { sort_order: 29, video_id: 'michael-jackson-performs-billie-jean-song-michael' },
  { sort_order: 30, video_id: 'chief-meets-with-rescued-orphan-years-later-in-heartwarming-reunion-chicago-fire' },
];

const NEW_DESCRIPTION =
  'Thirty short scenes (animation + live-action) sharing core A2 vocabulary — same words across many different contexts, perfect for the 7-context mastery threshold.';
const NEW_DESCRIPTION_TR =
  '30 kısa sahne (animasyon + canlı çekim), aynı temel A2 kelimelerini birçok farklı bağlamda gösteriyor — 7 farklı bağlamda mastery için ideal.';

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`Extend "${SET_ID}" with ${NEW_ITEMS.length} new items`);
console.log('---');

const set = db.prepare(`SELECT id, title FROM video_sets WHERE id = ?`).get(SET_ID) as
  | { id: string; title: string }
  | undefined;
if (!set) {
  console.error(`Set ${SET_ID} not found.`);
  process.exit(1);
}

const ids = NEW_ITEMS.map(i => i.video_id);
const placeholders = ids.map(() => '?').join(',');
const found = db
  .prepare(`SELECT id FROM videos WHERE id IN (${placeholders})`)
  .all(...ids) as { id: string }[];
const foundSet = new Set(found.map(r => r.id));
const missing = ids.filter(id => !foundSet.has(id));
if (missing.length > 0) {
  console.error('Missing video IDs:');
  for (const id of missing) console.error(`  ${id}`);
  process.exit(1);
}

const insert = db.prepare(
  `INSERT OR IGNORE INTO video_set_items (set_id, video_id, sort_order) VALUES (?, ?, ?)`,
);
const updateDesc = db.prepare(
  `UPDATE video_sets SET description = ?, description_tr = ? WHERE id = ?`,
);

let added = 0;
const tx = db.transaction(() => {
  for (const item of NEW_ITEMS) {
    added += insert.run(SET_ID, item.video_id, item.sort_order).changes;
  }
  updateDesc.run(NEW_DESCRIPTION, NEW_DESCRIPTION_TR, SET_ID);
});
tx();

console.log(`Inserted ${added} new items into ${SET_ID} (others were already present).`);

const summary = db
  .prepare(
    `SELECT vsi.sort_order, v.id, v.movie_title
     FROM video_set_items vsi
     JOIN videos v ON v.id = vsi.video_id
     WHERE vsi.set_id = ?
     ORDER BY vsi.sort_order`,
  )
  .all(SET_ID);
console.log(`\nFinal "${set.title}" contents (${summary.length} videos):`);
console.table(summary);

db.close();
