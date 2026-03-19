/**
 * Seed script to batch-add videos from TV shows.
 * Run: npx tsx scripts/seed-videos.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema first
const schemaPath = path.join(__dirname, '..', 'lib', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

function makeId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

interface VideoEntry {
  youtube_video_id: string;
  title: string;
  movie_title: string;
  genre: string;
  difficulty: string;
  duration_seconds: number | null;
}

const insertVideo = db.prepare(`
  INSERT OR IGNORE INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertClip = db.prepare(`
  INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, ?, 'draft')
`);

function addVideo(v: VideoEntry) {
  const id = makeId(v.title);
  try {
    insertVideo.run(id, v.youtube_video_id, v.title, v.movie_title, v.genre, v.difficulty, v.duration_seconds);
    // Create a single clip spanning the whole video
    insertClip.run(id, v.duration_seconds || 300);
    console.log(`✓ ${v.movie_title} - ${v.title}`);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      console.log(`⊘ Already exists: ${v.title}`);
    } else {
      console.error(`✗ ${v.title}: ${e.message}`);
    }
  }
}

// ── THE BLACKLIST ──────────────────────────────────────────────

const blacklist: VideoEntry[] = [
  { youtube_video_id: 'OP3owF55TVI', title: 'Reddington Fools the FBI', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 320 },
  { youtube_video_id: 'lvskHa5cT94', title: 'Red Pushes The Stewmaker Into His Own Acid Bath', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 284 },
  { youtube_video_id: 'sYU4h1od9UA', title: 'Raymond Reddington vs The Bull', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 223 },
  { youtube_video_id: 'hcfFzwbfHrk', title: 'Red Defends His Immunity Deal In Court', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 314 },
  { youtube_video_id: 'z5PFCietj0E', title: 'Reds Prison Fight With Baldomero', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 316 },
  { youtube_video_id: 'R2K6d5uiUYQ', title: 'Liz Wakes Up From A Coma', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 207 },
  { youtube_video_id: 'QiFZKRtm3zI', title: 'Reddington Threatens To Nuke Mr Beaks', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 197 },
  { youtube_video_id: '0-vlbZaElac', title: 'Reddington Corners Scooter', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 128 },
  { youtube_video_id: '26MQE01zrQc', title: 'Police Station Shoot Out Part 1', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 158 },
  { youtube_video_id: 'QQ6qmZjUzeY', title: 'Police Station Shoot Out Part 2', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 178 },
  { youtube_video_id: 'IYZl6mj3C68', title: 'Liz Plants A Bomb In Reds Hospital Room', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 223 },
  { youtube_video_id: 'E1A_wxfj_ro', title: 'Reddington Shoots Lizs Mother', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 312 },
  { youtube_video_id: 'OzUKYGZWXao', title: 'Ressler and Red Talk About Liz', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 151 },
  { youtube_video_id: 'a1JzJSBPHBw', title: 'Reddington Talks To Marvin In The Courthouse', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 265 },
  { youtube_video_id: 'OWpvwOApjHg', title: 'Do You Know Who I Am', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 165 },
  { youtube_video_id: 'tWid25AAYoQ', title: 'Liz Makes A Deal With The Kings Of The Highway', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 188 },
  { youtube_video_id: 'u3_Odeg3TRo', title: 'Tom Holds Liz At Gunpoint', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 154 },
  { youtube_video_id: 'Qllk24sy0nU', title: 'Lizs Cover Is Blown', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 151 },
  { youtube_video_id: '_gwWea9LRcg', title: 'Red Figures Out Who Poisoned Him', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 237 },
  { youtube_video_id: 'EsPNguZ8q-k', title: 'Liz Questions Reds Motives', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 147 },
  { youtube_video_id: '-JEWvM9vJr8', title: 'Red Confronts Martin About His Betrayal', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 283 },
  { youtube_video_id: 'rJMT8c_rr-s', title: 'Red Wants To Represent Himself In Court', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'advanced', duration_seconds: 301 },
  { youtube_video_id: 'W-h2Fg5glYA', title: 'Reddington Agrees To Help The FBI', movie_title: 'The Blacklist', genre: 'Crime/Thriller', difficulty: 'intermediate', duration_seconds: 161 },
];

// ── SUITS ──────────────────────────────────────────────────────

const suits: VideoEntry[] = [
  { youtube_video_id: 'aGtZG23fz1Q', title: 'Mike and Rachels First Kiss', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 252 },
  { youtube_video_id: 'hTSfbakmLNU', title: 'Harvey Exposes Rachel For Cheating On Mike', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 262 },
  { youtube_video_id: 'ue_X8DskUN4', title: 'Louis Exposes How Much Money Harvey Earns', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 262 },
  { youtube_video_id: 'N_OW3qJOb1E', title: 'Your Going Away Present Be A Lawyer One Last Time', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'advanced', duration_seconds: 245 },
  { youtube_video_id: 'RSgxPJcrjjk', title: 'Youre Right I Was Using You', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 252 },
  { youtube_video_id: 'KGa6MwMj3BQ', title: 'Donna Shows Harvey How She Feels', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 256 },
  { youtube_video_id: 'ssC5lCEphkw', title: 'Introducing Donnas Replacement Gretchen', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 156 },
  { youtube_video_id: 'ImEnWAVRLU0', title: 'Mike Ross Interview with Harvey Specter', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'advanced', duration_seconds: 533 },
  { youtube_video_id: 'HAfmTwefzxQ', title: 'Dont Run From a Fight', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'intermediate', duration_seconds: 538 },
  { youtube_video_id: 'adRHR75CrrI', title: 'Ava Hessington Proves Her Innocence', movie_title: 'Suits', genre: 'Legal Drama', difficulty: 'advanced', duration_seconds: 549 },
];

// ── PRISON BREAK ───────────────────────────────────────────────

const prisonBreak: VideoEntry[] = [
  { youtube_video_id: 'dz4ho-lnTIY', title: 'Michael Meets T-Bag', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 318 },
  { youtube_video_id: 'Yr00SkPzjro', title: 'Poker Game T-Bag and C-Note Work Together', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 314 },
  { youtube_video_id: 'vpqwmhppp0s', title: 'FBI Agent Mahone Figures Out Scofields Bait', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'advanced', duration_seconds: 279 },
  { youtube_video_id: 'HQe0Phrxeuc', title: 'Lockdown in Fox River Cons Are Angry', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 320 },
  { youtube_video_id: '7fEHGfbs_Ak', title: 'Scofield Gave Up Fibonacci to Falzone', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 309 },
  { youtube_video_id: '4upxTWRfOtM', title: 'Scofield Wants to Get Rid of Haywire', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 275 },
  { youtube_video_id: 'jCXytX-OUOE', title: 'Fight in Fox River Bellick Beats Up Banks', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 311 },
  { youtube_video_id: 'Iz8tBQo8EDo', title: 'Scofield on the Roof English Fitz or Percy', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 300 },
  { youtube_video_id: 'T-Mt3SdrTNY', title: 'Scofield and Burrows Meet T-Bag in Utah', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 296 },
  { youtube_video_id: '8vF83K5nN94', title: 'Scofield Rescued Sara from Cons', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 259 },
  { youtube_video_id: 'tnrBtCBlzYs', title: 'Romance Between Sara and Michael', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 282 },
  { youtube_video_id: 'rGIFSeuYrHo', title: 'Scofield Keeps Outsmarting Gretchen', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'advanced', duration_seconds: 306 },
  { youtube_video_id: 'tT-hlc6X6bw', title: 'Escape on a Helicopter', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 308 },
  { youtube_video_id: 'yCh7YFiiVYg', title: 'The Stealing of Scylla', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'advanced', duration_seconds: 279 },
  { youtube_video_id: 'gCpJgbFTuXI', title: 'Breaking Out of Fox River', movie_title: 'Prison Break', genre: 'Action/Thriller', difficulty: 'intermediate', duration_seconds: 321 },
];

// ── INSERT ALL ──────────────────────────────────────────────────

console.log('\n📺 Adding The Blacklist scenes...');
blacklist.forEach(addVideo);

console.log('\n⚖️  Adding Suits scenes...');
suits.forEach(addVideo);

console.log('\n🔓 Adding Prison Break scenes...');
prisonBreak.forEach(addVideo);

console.log(`\n✅ Done! Total videos in DB: ${db.prepare('SELECT COUNT(*) as c FROM videos').get()?.c}`);
console.log(`   Total clips in DB: ${db.prepare('SELECT COUNT(*) as c FROM clips').get()?.c}`);

db.close();
