/**
 * Batch WhisperX processor for database videos.
 * Downloads audio, runs WhisperX, imports subtitle lines + word timestamps into DB.
 *
 * Usage: npx tsx scripts/batch-whisperx.ts [--limit N] [--show SHOW_NAME]
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { execSync, spawnSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(ROOT, '..');
const DB_PATH = path.join(ROOT, 'data.db');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'whisperx');
const VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');
const WHISPERX_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'whisperx_transcribe.py');

// Ensure ffmpeg/ffprobe are in PATH (Homebrew)
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;

// Find yt-dlp
function findYtDlp(): string {
  const candidates = [
    path.join(process.env.HOME || '', 'Library', 'Python', '3.14', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.13', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.12', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try { execSync('which yt-dlp', { stdio: 'pipe' }); return 'yt-dlp'; } catch {}
  throw new Error('yt-dlp not found');
}

const YT_DLP = findYtDlp();

// Parse args
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const showIdx = args.indexOf('--show');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 999;
const showFilter = showIdx >= 0 ? args[showIdx + 1] : null;

// Setup
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Find videos that have clips with no subtitle lines
let query = `
  SELECT DISTINCT v.id, v.youtube_video_id, v.title, v.movie_title, c.id as clip_id, c.end_time
  FROM videos v
  JOIN clips c ON c.video_id = v.id
  LEFT JOIN subtitle_lines sl ON sl.clip_id = c.id
  WHERE sl.id IS NULL
`;
if (showFilter) query += ` AND v.movie_title LIKE '%${showFilter}%'`;
query += ` LIMIT ${limit}`;

const videos = db.prepare(query).all() as any[];

console.log(`\n🎬 Found ${videos.length} videos without subtitles\n`);

const insertLine = db.prepare(`
  INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertWord = db.prepare(`
  INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time)
  VALUES (?, ?, ?, ?, ?)
`);

let processed = 0;
let failed = 0;

for (const video of videos) {
  const { youtube_video_id, title, movie_title, clip_id, end_time } = video;
  console.log(`\n━━━ [${processed + 1}/${videos.length}] ${movie_title} — ${title} ━━━`);
  console.log(`    YouTube: ${youtube_video_id}, Clip: ${clip_id}`);

  const wavPath = path.join(CACHE_DIR, `${youtube_video_id}.wav`);
  const jsonPath = path.join(CACHE_DIR, `${youtube_video_id}.whisperx.json`);

  try {
    // Step 1: Download audio (skip if cached and < 7 days old)
    const wavAge = fs.existsSync(wavPath) ? (Date.now() - fs.statSync(wavPath).mtimeMs) / 86400000 : 999;
    if (wavAge > 7) {
      console.log('  📥 Downloading audio...');
      const dlResult = spawnSync(YT_DLP, [
        '--js-runtimes', 'node', '--remote-components', 'ejs:github',
        '-x', '--audio-format', 'wav',
        '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
        '-o', wavPath,
        `https://www.youtube.com/watch?v=${youtube_video_id}`,
      ], { timeout: 120000, stdio: 'pipe' });

      if (dlResult.status !== 0) {
        const err = dlResult.stderr?.toString() || 'unknown error';
        console.error(`  ✗ Download failed: ${err.substring(0, 200)}`);
        failed++;
        continue;
      }

      if (!fs.existsSync(wavPath)) {
        console.error('  ✗ WAV file not created');
        failed++;
        continue;
      }
      console.log('  ✓ Audio downloaded');
    } else {
      console.log('  ♻ Using cached audio');
    }

    // Step 2: Run WhisperX (skip if cached JSON newer than WAV)
    const jsonAge = fs.existsSync(jsonPath) ? fs.statSync(jsonPath).mtimeMs : 0;
    const wavMtime = fs.existsSync(wavPath) ? fs.statSync(wavPath).mtimeMs : 0;
    if (jsonAge < wavMtime || !fs.existsSync(jsonPath)) {
      console.log('  🧠 Running WhisperX...');
      const wxResult = spawnSync(VENV_PYTHON, [
        WHISPERX_SCRIPT, wavPath, jsonPath,
        '--model', 'base.en', '--language', 'en',
      ], { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] });

      const stdout = wxResult.stdout?.toString() || '';
      const stderr = wxResult.stderr?.toString() || '';
      if (stdout) console.log(stdout.trim().split('\n').map(l => `    ${l}`).join('\n'));

      if (wxResult.status !== 0) {
        console.error(`  ✗ WhisperX failed: ${stderr.substring(0, 300)}`);
        failed++;
        continue;
      }
      console.log('  ✓ WhisperX done');
    } else {
      console.log('  ♻ Using cached WhisperX output');
    }

    // Step 3: Parse and import into database
    if (!fs.existsSync(jsonPath)) {
      console.error('  ✗ WhisperX JSON not found');
      failed++;
      continue;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const segments = data.segments || [];

    const insertAll = db.transaction(() => {
      let lineIdx = 0;
      for (const seg of segments) {
        const text = seg.text?.trim();
        if (!text || text.length < 2) continue;

        // Insert subtitle line
        const lineResult = insertLine.run(clip_id, lineIdx, 'Speaker', text, seg.start, seg.end);
        const lineId = lineResult.lastInsertRowid as number;

        // Insert word timestamps
        const words = seg.words || [];
        for (let wi = 0; wi < words.length; wi++) {
          const w = words[wi];
          if (w.word && w.start != null && w.end != null) {
            insertWord.run(lineId, wi, w.word, w.start, w.end);
          }
        }
        lineIdx++;
      }
      return lineIdx;
    });

    const lineCount = insertAll();
    const wordCount = segments.reduce((sum: number, s: any) => sum + (s.words?.length || 0), 0);
    console.log(`  ✅ Imported: ${lineCount} lines, ${wordCount} words`);
    processed++;

  } catch (err: any) {
    console.error(`  ✗ Error: ${err.message}`);
    failed++;
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`✅ Processed: ${processed}/${videos.length}`);
if (failed) console.log(`✗ Failed: ${failed}`);
console.log(`Total subtitle lines in DB: ${(db.prepare('SELECT COUNT(*) as c FROM subtitle_lines').get() as any).c}`);
console.log(`Total word timestamps in DB: ${(db.prepare('SELECT COUNT(*) as c FROM word_timestamps').get() as any).c}`);

db.close();
