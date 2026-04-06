import Database from 'better-sqlite3';
import path from 'path';
const db = new Database(path.join(__dirname, '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const s = {
  fv: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  iv: db.prepare("INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES (?, ?, ?, ?, ?, 'beginner')"),
  ic: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  ll: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
};
const clips = [
  { youtubeId: 'Gn51xYvJhQI', videoId: 'shrek2-are-we-there', title: 'Are We There Yet?', movieTitle: 'Shrek 2', genre: 'animation', lesson: 'lesson-07-to-be-questions' },
  { youtubeId: 'vdtqSaJO-iM', videoId: 'forrest-gump-chocolates', title: 'Life is Like a Box of Chocolates', movieTitle: 'Forrest Gump', genre: 'drama', lesson: 'lesson-05-to-be-adjective' },
  { youtubeId: 'H5aRp8BguJo', videoId: 'lion-king-stampede', title: 'The Stampede', movieTitle: 'The Lion King', genre: 'animation', lesson: 'lesson-12-basic-vocabulary' },
];
let created = 0;
for (const c of clips) {
  if (s.fv.get(c.youtubeId)) { console.log(`  ↗ ${c.movieTitle} (exists)`); continue; }
  try {
    s.iv.run(c.videoId, c.youtubeId, c.title, c.movieTitle, c.genre);
    const r = s.ic.run(c.videoId);
    s.ll.run(r.lastInsertRowid, c.lesson);
    console.log(`  ★ ${c.movieTitle} — ${c.title} (new #${r.lastInsertRowid})`);
    created++;
  } catch (e: any) { console.log(`  ⚠ ${e.message}`); }
}
const total = (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n;
const noSub = (db.prepare("SELECT COUNT(DISTINCT v.id) as n FROM videos v JOIN clips c ON c.video_id=v.id LEFT JOIN subtitle_lines sl ON sl.clip_id=c.id WHERE sl.id IS NULL").get() as any).n;
console.log(`\nNew: ${created}. Total: ${total} videos (${noSub} without subtitles)`);
db.close();
