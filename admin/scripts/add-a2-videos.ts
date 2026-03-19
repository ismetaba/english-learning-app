/**
 * Add A2-level video clips from Friends, The Office, and Modern Family
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

interface VideoEntry {
  youtubeId: string;
  title: string;
  show: string;
  genre: string;
  difficulty: string;
}

const videos: VideoEntry[] = [
  // ── Friends (15 clips) ──────────────────────────────────
  { youtubeId: 'eZ5zJvP9Ycg', title: 'Spin the Bottle', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'ZldM7TMS02g', title: 'Joey Accidentally Kisses Phoebe', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'LnyKGilEzys', title: 'Ross Breaks Into Monas Apartment', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'dGLObch14e4', title: 'Joey Doesnt Share Food', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'P7TnA_8379E', title: 'Ross Is Fine', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '93N7PRkXmac', title: 'Ross Finds Out About Chandler and Monica', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'u2QM-Y5VuW0', title: 'The Secret Nap Partners', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'JLaQXxbsmMY', title: 'Rachel Refuses To Take Eye Drops', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'pMuVm1Y669U', title: 'What Does the Switch Do', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'vooZITJoPaQ', title: 'Everyones Annoying Habits', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'hJTg6HqJZkM', title: 'You Said She Was Bald', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '9dmeWE-qfMo', title: 'Monicas Secret Closet', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'ZFXGxlqd9B0', title: 'Ross Cant Remember All 50 States', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'L_PWbnHABsM', title: 'PIVOT Scene', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '7dVyEbHRTlU', title: 'Chandler Quits His Job', show: 'Friends', genre: 'Comedy', difficulty: 'elementary' },

  // ── The Office (12 clips) ───────────────────────────────
  { youtubeId: 'QOtuX0jL85Y', title: 'The DVD Logo', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'xLxHtBt2jtU', title: 'Asian Jim', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'glFrp-CmNVA', title: 'Stapler in Jello', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'WaaANll8h18', title: 'Jim Impersonates Dwight', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'Vmb1tqYqyII', title: 'First Aid Fail CPR Scene', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '8GxqvnQyaxs', title: 'The Password', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'iA89H8CgLTQ', title: 'What Wont Stanley Notice', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'drpNPMPqdtI', title: 'Dwights Fitness Orb', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'uLAuzWNrK0w', title: 'Dwight Thinks its Friday', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'uSpBKr1RPhg', title: 'Equality Meeting', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '9eqze5JWNjY', title: 'Should Michael Drive The Forklift', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'b1RoMfysruQ', title: 'Time Prank', show: 'The Office', genre: 'Comedy', difficulty: 'elementary' },

  // ── Modern Family (10 clips from Chrome YouTube search) ─
  { youtubeId: 'miYfxwMs5EI', title: 'Clive Bixby and Juliana', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '7i5CQVfmx-0', title: 'Mitchell Goes to Costco', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'mLbFWtFATPk', title: 'Haley is a Stripper', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'dmbtt3iGXzg', title: 'Phils ADHD', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'l7C0epKYeLA', title: 'Mitchell Pretends to Speak French', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'jW39JQCbCX8', title: 'Haley Why Didnt You Honk', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: '2oXiBu6r13M', title: 'Gloria and Guns', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
  { youtubeId: 'tvCUgiqMLW4', title: 'Phil Caught Flirting At The Hospital', show: 'Modern Family', genre: 'Comedy', difficulty: 'elementary' },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const insertVideo = db.prepare(`
  INSERT OR IGNORE INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertClip = db.prepare(`
  INSERT INTO clips (video_id, start_time, end_time, status)
  VALUES (?, 0, 0, 'pending')
`);

const checkExists = db.prepare(`SELECT id FROM videos WHERE youtube_video_id = ?`);

let added = 0;
let skipped = 0;

for (const v of videos) {
  const existing = checkExists.get(v.youtubeId);
  if (existing) {
    skipped++;
    continue;
  }

  const id = slugify(`${v.show}-${v.title}`);
  insertVideo.run(id, v.youtubeId, v.title, v.show, v.genre, v.difficulty);
  insertClip.run(id);
  added++;
  console.log(`  ✅ ${v.show} — ${v.title}`);
}

console.log(`\nDone: ${added} added, ${skipped} skipped (already exist)`);
console.log(`Total videos in DB: ${db.prepare('SELECT COUNT(*) as c FROM videos').get()?.c}`);
