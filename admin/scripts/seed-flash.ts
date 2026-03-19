import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schemaPath = path.join(__dirname, '..', 'lib', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf-8'));

function makeId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

const insertVideo = db.prepare(`INSERT OR IGNORE INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertClip = db.prepare(`INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, ?, 'draft')`);

function addVideo(ytId: string, title: string, dur: number, diff = 'intermediate') {
  const id = makeId(title);
  try {
    insertVideo.run(id, ytId, title, 'The Flash', 'Sci-Fi/Action', diff, dur);
    insertClip.run(id, dur);
    console.log(`✓ ${title}`);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) console.log(`⊘ Already exists: ${title}`);
    else console.error(`✗ ${title}: ${e.message}`);
  }
}

console.log('\n⚡ Adding The Flash scenes...');
addVideo('x28nyMvnTMo', 'Barry Learns to Phase', 157);
addVideo('hWRrwQWcZfg', 'Barry Shows Off His Speed to Felicity', 104);
addVideo('iIaYQMX35YE', 'Wells Reveals Himself as Eobard Thawne and Kills Cisco', 226, 'advanced');
addVideo('XI4POW4-VE4', 'Wells Reveals Himself to Team Flash', 146);
addVideo('UBIRdf1KcGY', 'Flash vs Zoom Look at Your Hero', 217);
addVideo('NN98Jg7MVeM', 'Barry Time Travels for the First Time', 193);
addVideo('m9vmcmpOAg8', 'Barry Returns from the Speed Force and Rescues Iris', 188);
addVideo('PAK4GPuSbXk', 'Joe Tells Barry About His Moms Murder', 139);
addVideo('32HEgK1449k', 'Joe West Finds Out About the Red Streak', 219);
addVideo('zrodFfu_u2w', 'Nash Wells Sacrifice for Barrys Speed', 187);
addVideo('T4S-OaBR2us', 'Barry Gets 4x Faster with the Tachyon Device', 193);
addVideo('D5ZXnqbM244', 'Thawne Talks to Barry About Flashpoint', 102, 'advanced');
addVideo('ThlRVaivNRU', 'Barry Visits Thawne in Argus Prison', 129, 'advanced');
addVideo('m7hIs-O2Sl8', 'Barry Stops Thawne From Killing Young Barry', 217);

console.log(`\n✅ Done! Total videos: ${(db.prepare('SELECT COUNT(*) as c FROM videos').get() as any).c}`);
console.log(`   Total clips: ${(db.prepare('SELECT COUNT(*) as c FROM clips').get() as any).c}`);
db.close();
