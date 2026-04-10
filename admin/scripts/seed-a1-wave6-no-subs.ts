/**
 * Wave 6: 195 popular movie/TV clips WITHOUT subtitles, distributed round-robin across all 13 A1 lessons.
 * Source: yt-dlp ytsearch1 of curated popular movie scene queries.
 * Run:  cd admin && npx tsx scripts/seed-a1-wave6-no-subs.ts
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const LESSONS = [
  'lesson-01-greetings',
  'lesson-02-courtesy-phrases',
  'lesson-03-subject-pronouns',
  'lesson-04-to-be-noun',
  'lesson-05-to-be-adjective',
  'lesson-06-to-be-negative',
  'lesson-07-to-be-questions',
  'lesson-08-wh-questions-to-be',
  'lesson-09-articles',
  'lesson-10-demonstratives',
  'lesson-11-possessive-adjectives',
  'lesson-12-basic-vocabulary',
  'lesson-13-simple-commands',
];

const s = {
  fv: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  fc: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  iv: db.prepare("INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES (?, ?, ?, ?, ?, 'beginner')"),
  ic: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  ll: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  el: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function inferMovie(search: string): string {
  // Strip trailing "scene movieclips" / "scene" tokens to get a movie-ish title
  return search
    .replace(/\bmovieclips\b/gi, '')
    .replace(/\bscene\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

interface Row { ytId: string; title: string; search: string; }

function loadRows(): Row[] {
  const txt = fs.readFileSync('/tmp/popular_unique.txt', 'utf8');
  const rows: Row[] = [];
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    const [ytId, title, search] = line.split('|');
    if (!ytId || ytId.length !== 11) continue;
    rows.push({ ytId, title: title || ytId, search: search || ytId });
  }
  return rows;
}

function run(): void {
  console.log('═══ Wave 6: 195 popular clips (no subtitles) ═══\n');
  const rows = loadRows();
  console.log(`Loaded ${rows.length} unique clips from /tmp/popular_unique.txt`);

  let created = 0, linked = 0, skipped = 0;
  const usedSlugs = new Set<string>();

  rows.forEach((r, idx) => {
    const lessonId = LESSONS[idx % LESSONS.length];
    const movie = inferMovie(r.search);
    let slug = slugify(`${movie}-${r.ytId}`);
    if (usedSlugs.has(slug)) slug = `${slug}-${idx}`;
    usedSlugs.add(slug);

    const ex = s.fv.get(r.ytId) as any;
    if (ex) {
      const clip = s.fc.get(ex.id) as any;
      if (!clip) { skipped++; return; }
      if (s.el.get(clip.id, lessonId)) {
        skipped++;
      } else {
        s.ll.run(clip.id, lessonId);
        linked++;
      }
      return;
    }
    try {
      s.iv.run(slug, r.ytId, r.title.slice(0, 200), movie.slice(0, 100), 'movie');
      const res = s.ic.run(slug);
      const cid = res.lastInsertRowid as number;
      s.ll.run(cid, lessonId);
      created++;
      if (created % 25 === 0) console.log(`  ★ ${created} created so far…`);
    } catch (err: any) {
      console.log(`  ⚠ ${r.ytId} (${slug}): ${err.message}`);
    }
  });

  console.log(`\n═══ Created: ${created}, Linked-existing: ${linked}, Skipped: ${skipped} ═══`);
  const stats = db.prepare('SELECT cs.lesson_id, COUNT(DISTINCT cs.clip_id) as n FROM clip_structures cs GROUP BY cs.lesson_id ORDER BY cs.lesson_id').all() as any[];
  for (const st of stats) console.log(`  ${st.lesson_id}: ${st.n} clips`);
  const total = (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n;
  const noSubs = (db.prepare("SELECT COUNT(*) as n FROM videos v JOIN clips c ON c.video_id=v.id LEFT JOIN subtitle_lines sl ON sl.clip_id=c.id WHERE sl.id IS NULL").get() as any).n;
  console.log(`\nTotal videos: ${total}  (without subtitles: ${noSubs})`);
  db.close();
}
run();
