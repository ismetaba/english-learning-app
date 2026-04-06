/**
 * Wave 4: Lessons 5-8 boost from agent 2 search results.
 * Run:  cd admin && npx tsx scripts/seed-a1-wave4.ts
 * Then: npx tsx scripts/batch-whisperx.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface E { youtubeId: string; videoId: string; title: string; movieTitle: string; genre: string; }
interface L { lessonId: string; clips: E[]; }

const s = {
  fv: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  fc: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  iv: db.prepare("INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES (?, ?, ?, ?, ?, 'beginner')"),
  ic: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  ll: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  el: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

const LESSONS: L[] = [
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: '56fngopihOo', videoId: 'pursuit-happyness-hired', title: 'Chris is Hired (Happy)', movieTitle: 'The Pursuit of Happyness', genre: 'drama' },
      { youtubeId: 'UZb2NOHPA2A', videoId: 'pursuit-happyness-bball', title: 'Basketball and Dreams', movieTitle: 'The Pursuit of Happyness', genre: 'drama' },
      { youtubeId: 're5veV2F7eY', videoId: 'mean-girls-plastics', title: 'Meeting the Plastics (She Is...)', movieTitle: 'Mean Girls', genre: 'comedy' },
      { youtubeId: '3ERuhks3GNk', videoId: 'big-josh-doesnt-get', title: 'It Is Big', movieTitle: 'Big', genre: 'comedy' },
      { youtubeId: '8JoOpx6VwHk', videoId: 'romeo-juliet-love-sight', title: 'She Is Beautiful', movieTitle: 'Romeo + Juliet', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 't_FRWUPcR7Y', videoId: 'kindergarten-cop-tumor', title: "It's Not a Tumor!", movieTitle: 'Kindergarten Cop', genre: 'comedy' },
      { youtubeId: 'rUczpTPATyU', videoId: 'princess-bride-left', title: 'I Am Not Left-Handed', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'XO0pcWxcROI', videoId: 'matrix-no-spoon', title: 'There Is No Spoon', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: '0jxVnlRdelU', videoId: '12-angry-men-not-guilty', title: 'Not Guilty', movieTitle: '12 Angry Men', genre: 'drama' },
      { youtubeId: 'b65C_muXajk', videoId: 'la-la-land-not-good', title: "I'm Not Good Enough", movieTitle: 'La La Land', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'ixljWVyPby0', videoId: 'airplane-shirley', title: "Don't Call Me Shirley (Are You Serious?)", movieTitle: 'Airplane!', genre: 'comedy' },
      { youtubeId: 'zeUsI-duhgc', videoId: 'dark-knight-serious', title: 'Why So Serious?', movieTitle: 'The Dark Knight', genre: 'action' },
    ],
  },
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'PeGDBR0Ej_0', videoId: 'bourne-whats-name', title: "What's Your Name?", movieTitle: 'The Bourne Identity', genre: 'action' },
      { youtubeId: 'xEvb7B4O698', videoId: 'predator-what-are-you', title: 'What Are You?', movieTitle: 'Predator', genre: 'action' },
      { youtubeId: 'dUYCIwyMZTQ', videoId: 'close-encounters-who', title: 'Who Are You People?', movieTitle: 'Close Encounters of the Third Kind', genre: 'scifi' },
      { youtubeId: 'NYo4WkYNLn4', videoId: 'john-wick-where-is-he', title: 'Where Is He?', movieTitle: 'John Wick', genre: 'action' },
    ],
  },
  // Cross-link some to other lessons too
  {
    lessonId: 'lesson-03-subject-pronouns',
    clips: [
      { youtubeId: 're5veV2F7eY', videoId: 'mean-girls-plastics', title: 'She Is / He Is / They Are', movieTitle: 'Mean Girls', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: 'ixljWVyPby0', videoId: 'airplane-shirley', title: 'I Am A Doctor', movieTitle: 'Airplane!', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: 'NYo4WkYNLn4', videoId: 'john-wick-where-is-he', title: 'Tell Me! Give Me A Name!', movieTitle: 'John Wick', genre: 'action' },
      { youtubeId: 't_FRWUPcR7Y', videoId: 'kindergarten-cop-tumor', title: 'Stop It! Sit Down!', movieTitle: 'Kindergarten Cop', genre: 'comedy' },
    ],
  },
];

function run(): void {
  console.log('═══ Wave 4 ═══\n');
  let linked = 0, created = 0;
  for (const lesson of LESSONS) {
    console.log(`─── ${lesson.lessonId} ───`);
    for (const e of lesson.clips) {
      const ex = s.fv.get(e.youtubeId) as any;
      if (ex) {
        const clip = s.fc.get(ex.id) as any;
        if (!clip) continue;
        if (s.el.get(clip.id, lesson.lessonId)) { console.log(`  ↗ ${e.movieTitle} (already linked)`); }
        else { s.ll.run(clip.id, lesson.lessonId); console.log(`  ↗ ${e.movieTitle} — ${e.title} (linked #${clip.id})`); }
        linked++;
      } else {
        try {
          s.iv.run(e.videoId, e.youtubeId, e.title, e.movieTitle, e.genre);
          const r = s.ic.run(e.videoId);
          const cid = r.lastInsertRowid as number;
          s.ll.run(cid, lesson.lessonId);
          console.log(`  ★ ${e.movieTitle} — ${e.title} (new #${cid})`);
          created++;
        } catch (err: any) { console.log(`  ⚠ ${e.videoId}: ${err.message}`); }
      }
    }
  }
  console.log(`\n═══ Linked: ${linked}, New: ${created} ═══`);
  const res = db.prepare('SELECT cs.lesson_id, COUNT(DISTINCT cs.clip_id) as n FROM clip_structures cs GROUP BY cs.lesson_id ORDER BY cs.lesson_id').all() as any[];
  for (const r of res) console.log(`  ${r.lesson_id}: ${r.n} clips`);
  const need = (db.prepare('SELECT COUNT(DISTINCT v.id) as n FROM videos v JOIN clips c ON c.video_id=v.id LEFT JOIN subtitle_lines sl ON sl.clip_id=c.id WHERE sl.id IS NULL').get() as any).n;
  if (need > 0) console.log(`\n⚡ ${need} need WhisperX`);
  db.close();
}
run();
