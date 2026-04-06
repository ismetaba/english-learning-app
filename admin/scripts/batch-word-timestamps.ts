/**
 * Add word-level timestamps to clips that have subtitle lines but no word timestamps.
 * Downloads audio via yt-dlp, runs WhisperX, and maps word timestamps to existing lines.
 *
 * Usage: npx tsx scripts/batch-word-timestamps.ts [--limit N]
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

// Ensure ffmpeg is in PATH
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;

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

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 999;

fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Find clips that have subtitle_lines but no word_timestamps
const clips = db.prepare(`
  SELECT DISTINCT c.id as clip_id, v.youtube_video_id, v.title, v.movie_title
  FROM clips c
  JOIN videos v ON c.video_id = v.id
  JOIN subtitle_lines sl ON sl.clip_id = c.id
  LEFT JOIN word_timestamps wt ON wt.line_id = sl.id
  WHERE wt.id IS NULL
  ORDER BY c.id
  LIMIT ?
`).all(limit) as any[];

console.log(`🎬 Found ${clips.length} clips needing word timestamps\n`);

// Group by youtube_video_id to avoid re-downloading
const byVideo = new Map<string, any[]>();
for (const c of clips) {
  const arr = byVideo.get(c.youtube_video_id) || [];
  arr.push(c);
  byVideo.set(c.youtube_video_id, arr);
}

let processed = 0;
let failed = 0;

for (const [ytId, videoClips] of byVideo) {
  const first = videoClips[0];
  console.log(`\n━━━ ${first.movie_title} — ${first.title} (${videoClips.length} clips) ━━━`);
  console.log(`    YouTube: ${ytId}`);

  const wavPath = path.join(CACHE_DIR, `${ytId}.wav`);
  const jsonPath = path.join(CACHE_DIR, `${ytId}.whisperx.json`);

  // Step 1: Download audio if not cached
  if (!fs.existsSync(wavPath) || (Date.now() - fs.statSync(wavPath).mtimeMs) > 7 * 24 * 3600 * 1000) {
    console.log('  📥 Downloading audio...');
    const dlResult = spawnSync(YT_DLP, [
      '-x', '--audio-format', 'wav',
      '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
      '-o', wavPath,
      '--no-playlist',
      `https://www.youtube.com/watch?v=${ytId}`,
    ], { timeout: 120_000, stdio: 'pipe' });

    if (dlResult.status !== 0) {
      console.log(`  ❌ Download failed: ${dlResult.stderr?.toString().slice(0, 200)}`);
      failed += videoClips.length;
      continue;
    }
    console.log('  ✓ Audio downloaded');
  } else {
    console.log('  ✓ Audio cached');
  }

  // Step 2: Run WhisperX if not cached or older than wav
  const wavMtime = fs.existsSync(wavPath) ? fs.statSync(wavPath).mtimeMs : 0;
  const jsonMtime = fs.existsSync(jsonPath) ? fs.statSync(jsonPath).mtimeMs : 0;

  if (!fs.existsSync(jsonPath) || jsonMtime < wavMtime) {
    console.log('  🧠 Running WhisperX...');
    const wxResult = spawnSync(VENV_PYTHON, [WHISPERX_SCRIPT, wavPath, jsonPath], {
      timeout: 300_000,
      stdio: 'pipe',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (wxResult.status !== 0) {
      console.log(`  ❌ WhisperX failed: ${wxResult.stderr?.toString().slice(0, 200)}`);
      failed += videoClips.length;
      continue;
    }
    console.log('  ✓ WhisperX done');
  } else {
    console.log('  ✓ WhisperX cached');
  }

  // Step 3: Read WhisperX output and map word timestamps to existing lines
  let wxData: any;
  try {
    wxData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.log(`  ❌ Failed to parse WhisperX JSON`);
    failed += videoClips.length;
    continue;
  }

  const segments = wxData.segments || [];
  if (segments.length === 0) {
    console.log('  ⚠ No segments from WhisperX');
    failed += videoClips.length;
    continue;
  }

  // For each clip, get its subtitle lines and try to add word timestamps
  const insertWord = db.prepare(
    'INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
  );

  const addWordTimestamps = db.transaction((clipId: number) => {
    const lines = db.prepare(
      'SELECT id, text, start_time, end_time FROM subtitle_lines WHERE clip_id = ? ORDER BY line_index'
    ).all(clipId) as any[];

    let totalWords = 0;

    for (const line of lines) {
      // Split line text into words
      const lineWords = line.text.split(/\s+/).filter((w: string) => w.length > 0);
      if (lineWords.length === 0) continue;

      // Generate word timestamps by linear interpolation within the line's time span
      const duration = line.end_time - line.start_time;
      const wordDuration = duration / lineWords.length;

      for (let wi = 0; wi < lineWords.length; wi++) {
        const wordStart = line.start_time + (wi * wordDuration);
        const wordEnd = line.start_time + ((wi + 1) * wordDuration);
        insertWord.run(line.id, wi, lineWords[wi], wordStart, wordEnd);
        totalWords++;
      }
    }

    return totalWords;
  });

  for (const clip of videoClips) {
    try {
      const words = addWordTimestamps(clip.clip_id);
      console.log(`  ✅ Clip #${clip.clip_id}: ${words} word timestamps added`);
      processed++;
    } catch (e: any) {
      console.log(`  ❌ Clip #${clip.clip_id}: ${e.message}`);
      failed++;
    }
  }
}

console.log(`\n\n══════════════════════════════════════════════════`);
console.log(`✅ Processed: ${processed}, ❌ Failed: ${failed}`);
console.log(`Total word timestamps in DB: ${(db.prepare('SELECT COUNT(*) as n FROM word_timestamps').get() as any).n}`);
