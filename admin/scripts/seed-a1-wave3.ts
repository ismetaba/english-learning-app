/**
 * Wave 3: More validated clips from search agents.
 * Run:  npx tsx scripts/seed-a1-wave3.ts
 * Then: npx tsx scripts/batch-whisperx.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const db = new Database(path.join(ROOT, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface Entry { youtubeId: string; videoId: string; title: string; movieTitle: string; genre: string; }
interface Lesson { lessonId: string; clips: Entry[]; }

const stmts = {
  findVideoByYt: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  findClipForVideo: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  insertVideo: db.prepare("INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES (?, ?, ?, ?, ?, 'beginner')"),
  insertClip: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  linkLesson: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  existingLink: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

const LESSONS: Lesson[] = [
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: 'WlPTmXi0pVk', videoId: 'starwars-its-a-trap', title: "It's a Trap!", movieTitle: 'Star Wars: Return of the Jedi', genre: 'scifi' },
      { youtubeId: 'D6me2-OurCw', videoId: 'godfather-offer', title: "An Offer He Can't Refuse", movieTitle: 'The Godfather', genre: 'drama' },
      { youtubeId: '9FnO3igOkOk', videoId: 'few-good-men-truth', title: "You Can't Handle the Truth", movieTitle: 'A Few Good Men', genre: 'drama' },
      { youtubeId: 'H-0RHqDWcJE', videoId: 'matrix-the-one', title: 'The One', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: 'ItjXTieWKyI', videoId: 'titanic-king-world', title: "I'm the King of the World", movieTitle: 'Titanic', genre: 'drama' },
      { youtubeId: 'A_HjMIjzyMU', videoId: 'shrek2-need-hero', title: 'I Need a Hero', movieTitle: 'Shrek 2', genre: 'animation' },
      { youtubeId: 'j934OgiMBNQ', videoId: 'matrix-blue-red-pill', title: 'Blue Pill or Red Pill', movieTitle: 'The Matrix', genre: 'scifi' },
    ],
  },
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: 'uelA7KRLINA', videoId: 'mandalorian-this-way', title: 'This Is the Way', movieTitle: 'The Mandalorian', genre: 'scifi' },
      { youtubeId: 'CXFulZhAnCc', videoId: 'starwars-chosen-one', title: 'You Were the Chosen One!', movieTitle: 'Star Wars: Revenge of the Sith', genre: 'scifi' },
      { youtubeId: 'D6me2-OurCw', videoId: 'godfather-offer', title: "That's An Offer", movieTitle: 'The Godfather', genre: 'drama' },
      { youtubeId: '9FnO3igOkOk', videoId: 'few-good-men-truth', title: "That's The Truth!", movieTitle: 'A Few Good Men', genre: 'drama' },
      { youtubeId: 'ItjXTieWKyI', videoId: 'titanic-king-world', title: 'This Is Amazing!', movieTitle: 'Titanic', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'Iz-8CSa9xj8', videoId: 'lotr-my-precious', title: 'My Precious!', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
      { youtubeId: 'lYxx-8wQSO0', videoId: 'incredibles-family-arg', title: 'Our Family Argument', movieTitle: 'The Incredibles', genre: 'animation' },
      { youtubeId: 'CXFulZhAnCc', videoId: 'starwars-chosen-one', title: 'You Were My Brother!', movieTitle: 'Star Wars: Revenge of the Sith', genre: 'scifi' },
    ],
  },
  {
    lessonId: 'lesson-12-basic-vocabulary',
    clips: [
      { youtubeId: 'j934OgiMBNQ', videoId: 'matrix-blue-red-pill', title: 'Blue Pill / Red Pill (Colors)', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: 'lYxx-8wQSO0', videoId: 'incredibles-family-arg', title: 'Family Argument', movieTitle: 'The Incredibles', genre: 'animation' },
      { youtubeId: 'TbQ_yX_rxNI', videoId: 'incredibles2-dinner', title: 'Family Dinner', movieTitle: 'Incredibles 2', genre: 'animation' },
      { youtubeId: 'A1-XFXX8rU4', videoId: 'gatsby-green-light', title: 'The Green Light', movieTitle: 'The Great Gatsby', genre: 'drama' },
      { youtubeId: 'moSFlvxnbgk', videoId: 'frozen-let-it-go', title: 'Let It Go (Blue/White)', movieTitle: 'Frozen', genre: 'animation' },
    ],
  },
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: '9FnO3igOkOk', videoId: 'few-good-men-truth', title: 'Answer The Question!', movieTitle: 'A Few Good Men', genre: 'drama' },
      { youtubeId: 'H-0RHqDWcJE', videoId: 'matrix-the-one', title: 'Follow Me!', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: 'uelA7KRLINA', videoId: 'mandalorian-this-way', title: 'Come With Me', movieTitle: 'The Mandalorian', genre: 'scifi' },
    ],
  },
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: 'ItjXTieWKyI', videoId: 'titanic-king-world', title: "It's Beautiful", movieTitle: 'Titanic', genre: 'drama' },
      { youtubeId: 'Iz-8CSa9xj8', videoId: 'lotr-my-precious', title: 'It Is Precious', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
    ],
  },
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'H-0RHqDWcJE', videoId: 'matrix-the-one', title: 'Are You The One?', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: '9FnO3igOkOk', videoId: 'few-good-men-truth', title: 'Is That Clear?', movieTitle: 'A Few Good Men', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'D6me2-OurCw', videoId: 'godfather-offer', title: 'What Is The Offer?', movieTitle: 'The Godfather', genre: 'drama' },
      { youtubeId: 'uelA7KRLINA', videoId: 'mandalorian-this-way', title: 'What Is The Way?', movieTitle: 'The Mandalorian', genre: 'scifi' },
    ],
  },
];

function run(): void {
  console.log('═══ Wave 3: Adding more validated clips ═══\n');
  let linked = 0, created = 0;

  for (const lesson of LESSONS) {
    console.log(`─── ${lesson.lessonId} ───`);
    for (const e of lesson.clips) {
      const existing = stmts.findVideoByYt.get(e.youtubeId) as any;
      if (existing) {
        const clip = stmts.findClipForVideo.get(existing.id) as any;
        if (!clip) continue;
        if (stmts.existingLink.get(clip.id, lesson.lessonId)) {
          console.log(`  ↗ ${e.movieTitle} (already linked)`);
        } else {
          stmts.linkLesson.run(clip.id, lesson.lessonId);
          console.log(`  ↗ ${e.movieTitle} — ${e.title} (linked #${clip.id})`);
        }
        linked++;
      } else {
        try {
          stmts.insertVideo.run(e.videoId, e.youtubeId, e.title, e.movieTitle, e.genre);
          const r = stmts.insertClip.run(e.videoId);
          const clipId = r.lastInsertRowid as number;
          stmts.linkLesson.run(clipId, lesson.lessonId);
          console.log(`  ★ ${e.movieTitle} — ${e.title} (new #${clipId})`);
          created++;
        } catch (err: any) { console.log(`  ⚠ ${e.videoId}: ${err.message}`); }
      }
    }
  }

  console.log(`\n═══ Linked: ${linked}, New: ${created} ═══`);
  const results = db.prepare('SELECT cs.lesson_id, COUNT(DISTINCT cs.clip_id) as n FROM clip_structures cs GROUP BY cs.lesson_id ORDER BY cs.lesson_id').all() as any[];
  for (const r of results) console.log(`  ${r.lesson_id}: ${r.n} clips`);

  const need = (db.prepare('SELECT COUNT(DISTINCT v.id) as n FROM videos v JOIN clips c ON c.video_id=v.id LEFT JOIN subtitle_lines sl ON sl.clip_id=c.id WHERE sl.id IS NULL').get() as any).n;
  if (need > 0) console.log(`\n⚡ ${need} need WhisperX. Run: npx tsx scripts/batch-whisperx.ts`);
  db.close();
}

run();
