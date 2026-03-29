/**
 * Add new greeting/introduction videos to the database.
 * Run: npx tsx scripts/add-greeting-videos.ts
 */
import { getDb, createVideo, createClip } from '../lib/db';

const VIDEOS = [
  { id: 'forrest-gump-name', yt: 'd5GDFLt6Z8I', title: 'His Name is Forrest Scene', movie: 'Forrest Gump', genre: 'drama', difficulty: 'beginner' },
  { id: 'princess-bride-inigo', yt: 'I73sP93-0xA', title: 'My Name Is Inigo Montoya', movie: 'The Princess Bride', genre: 'adventure', difficulty: 'beginner' },
  { id: 'harry-potter-first-meet', yt: 'Gs7SIiRHQfs', title: 'Harry Ron Hermione First Meet', movie: 'Harry Potter', genre: 'fantasy', difficulty: 'beginner' },
  { id: 'despicable-me-hello', yt: 'z8VDANXnJjc', title: 'Minions Say Hello', movie: 'Despicable Me', genre: 'animation', difficulty: 'beginner' },
  { id: 'the-office-michael', yt: 'JMNyDtib6Y4', title: 'Michael Scott Meets David Brent', movie: 'The Office', genre: 'comedy', difficulty: 'elementary' },
  { id: 'elf-buddy', yt: 'ZZIMJ9aCTUY', title: 'Buddy in the Mail Room', movie: 'Elf', genre: 'comedy', difficulty: 'beginner' },
  { id: 'up-married-life', yt: 'XO77YuyMOek', title: 'Married Life Opening', movie: 'Up', genre: 'animation', difficulty: 'beginner' },
  { id: 'madagascar-zoo', yt: 'Dod-OBCuJ9Q', title: 'A Day at Central Park Zoo', movie: 'Madagascar', genre: 'animation', difficulty: 'beginner' },
  { id: 'spongebob-morning', yt: '0-ccV-rm2nw', title: 'Good Morning Scene', movie: 'SpongeBob', genre: 'animation', difficulty: 'beginner' },
  { id: 'shrek3-morning', yt: 'K-60AfWHvBw', title: 'Good Morning', movie: 'Shrek the Third', genre: 'animation', difficulty: 'beginner' },
  { id: 'harry-potter-sorting', yt: 'z4K2F_OALPQ', title: 'The Sorting Ceremony', movie: 'Harry Potter', genre: 'fantasy', difficulty: 'beginner' },
  { id: 'big-hero-6-baymax', yt: '99RzToAF55Y', title: 'Hello I am Baymax', movie: 'Big Hero 6', genre: 'animation', difficulty: 'beginner' },
  { id: 'ratatouille-soup', yt: 'NvM3nMbyeM8', title: 'Remy Making Soup', movie: 'Ratatouille', genre: 'animation', difficulty: 'beginner' },
  { id: 'zootopia-opening', yt: '9jNRkLpFhlg', title: 'Opening Scene', movie: 'Zootopia', genre: 'animation', difficulty: 'beginner' },
  { id: 'inside-out-emotions', yt: '1S0RKRRyqhQ', title: "Meet Riley's Emotions", movie: 'Inside Out', genre: 'animation', difficulty: 'beginner' },
];

function run() {
  const db = getDb();
  console.log('Adding greeting videos...\n');

  let added = 0;
  let skipped = 0;

  for (const v of VIDEOS) {
    // Check if video already exists
    const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(v.id);
    if (existing) {
      console.log(`  [skip] ${v.movie} — ${v.title} (already exists)`);
      skipped++;
      continue;
    }

    try {
      createVideo({
        id: v.id,
        youtube_video_id: v.yt,
        title: v.title,
        movie_title: v.movie,
        genre: v.genre,
        difficulty: v.difficulty,
        duration_seconds: null,
      });

      // Create a single clip covering the full video (WhisperX will get exact timings)
      const clipId = createClip(v.id, 0, 300); // 0-5min, will be refined
      db.prepare("UPDATE clips SET status = 'approved' WHERE id = ?").run(clipId);

      console.log(`  [added] ${v.movie} — ${v.title} (clip #${clipId})`);
      added++;
    } catch (err: any) {
      console.error(`  [error] ${v.movie}: ${err.message}`);
    }
  }

  console.log(`\nDone! Added: ${added}, Skipped: ${skipped}`);
  console.log(`Total videos: ${(db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n}`);
}

run();
