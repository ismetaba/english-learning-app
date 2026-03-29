/**
 * Fetch full YouTube auto-captions for all videos in the DB and store
 * them as subtitle_lines + word_timestamps.
 *
 * Usage:
 *   npx tsx scripts/fetch-video-subtitles.ts [videoId...]
 *
 * Without args: processes ALL videos. With args: only those video IDs.
 *
 * Prerequisites:
 *   pip3 install --user yt-dlp
 *
 * What it does:
 * 1. For each video in the `videos` table, downloads YouTube auto-captions (json3 format)
 * 2. Parses them into segments with word-level timing
 * 3. For each clip linked to that video:
 *    - Deletes existing subtitle_lines (and cascading word_timestamps)
 *    - Inserts new lines that fall within the clip's start_time..end_time
 *    - Inserts word_timestamps for each word in each line
 * 4. Also stores the FULL transcript in a new `video_transcripts` table for future use
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../lib/db';

// ── Types ──────────────────────────────────────────────────────────

interface Word {
  text: string;
  startMs: number;
  durationMs: number;
}

interface Segment {
  text: string;
  offsetMs: number;
  durationMs: number;
  words: Word[];
}

// ── yt-dlp ─────────────────────────────────────────────────────────

function findYtDlp(): string {
  const candidates = [
    'yt-dlp',
    path.join(process.env.HOME || '', 'Library/Python/3.14/bin/yt-dlp'),
    path.join(process.env.HOME || '', 'Library/Python/3.13/bin/yt-dlp'),
    path.join(process.env.HOME || '', 'Library/Python/3.12/bin/yt-dlp'),
    path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
    '/opt/homebrew/bin/yt-dlp',
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: 'pipe' });
      return cmd;
    } catch {}
  }
  throw new Error('yt-dlp not found. Install: pip3 install --user yt-dlp');
}

function parseJson3(json: any): Segment[] {
  const events: any[] = json.events || [];
  const segments: Segment[] = [];

  for (const event of events) {
    if (!event.segs) continue;

    const words: Word[] = [];
    let fullText = '';

    for (const seg of event.segs) {
      const text = (seg.utf8 || '').replace(/\n/g, ' ').trim();
      if (!text) continue;
      words.push({
        text,
        startMs: (event.tStartMs || 0) + (seg.tOffsetMs || 0),
        durationMs: seg.tOffsetMs !== undefined ? 0 : (event.dDurationMs || 0),
      });
      fullText += (fullText ? ' ' : '') + text;
    }

    if (fullText.trim()) {
      segments.push({
        text: fullText.trim(),
        offsetMs: event.tStartMs || 0,
        durationMs: event.dDurationMs || 0,
        words,
      });
    }
  }

  return segments;
}

async function fetchSubtitles(ytVideoId: string, ytDlpPath: string, tmpDir: string): Promise<Segment[]> {
  const outTemplate = path.join(tmpDir, ytVideoId);
  const subFile = path.join(tmpDir, `${ytVideoId}.en.json3`);

  try { fs.unlinkSync(subFile); } catch {}

  const cmd = [
    `"${ytDlpPath}"`,
    '--write-auto-sub',
    '--sub-lang en',
    '--sub-format json3',
    '--skip-download',
    '-o', `"${outTemplate}"`,
    `"https://www.youtube.com/watch?v=${ytVideoId}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`yt-dlp failed: ${stderr.split('\n').slice(-3).join(' ')}`);
  }

  if (!fs.existsSync(subFile)) {
    throw new Error(`No subtitles produced for ${ytVideoId}`);
  }

  const raw = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
  return parseJson3(raw);
}

// ── DB operations ──────────────────────────────────────────────────

function ensureTranscriptsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      transcript_json TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      fetched_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function storeFullTranscript(videoId: string, segments: Segment[]): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO video_transcripts (video_id, transcript_json, language)
    VALUES (?, ?, 'en')
  `).run(videoId, JSON.stringify(segments));
}

function updateClipSubtitles(clipId: number, clipStart: number, clipEnd: number, segments: Segment[]): number {
  const db = getDb();

  // Delete existing lines (word_timestamps cascade-deleted)
  db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(clipId);

  const clipStartMs = clipStart * 1000;
  const clipEndMs = clipEnd * 1000;

  // Filter segments that overlap with the clip's time range
  const relevant = segments.filter(s => {
    const segEnd = s.offsetMs + s.durationMs;
    return s.offsetMs < clipEndMs && segEnd > clipStartMs;
  });

  const insertLine = db.prepare(
    'INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertWord = db.prepare(
    'INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
  );

  let lineCount = 0;
  for (let i = 0; i < relevant.length; i++) {
    const seg = relevant[i];
    // Convert from absolute ms to seconds relative to clip start
    const lineStart = (seg.offsetMs - clipStartMs) / 1000;
    const lineEnd = (seg.offsetMs + seg.durationMs - clipStartMs) / 1000;

    const result = insertLine.run(clipId, i, 'Speaker', seg.text, Math.max(0, lineStart), lineEnd);
    const lineId = result.lastInsertRowid;

    // Insert word timestamps
    for (let wi = 0; wi < seg.words.length; wi++) {
      const w = seg.words[wi];
      const wordStart = (w.startMs - clipStartMs) / 1000;
      const wordEnd = wordStart + (w.durationMs / 1000) + 0.3; // add small buffer
      insertWord.run(lineId, wi, w.text, Math.max(0, wordStart), wordEnd);
    }

    lineCount++;
  }

  return lineCount;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const ytDlpPath = findYtDlp();
  console.log(`Using yt-dlp: ${ytDlpPath}\n`);

  const db = getDb();
  ensureTranscriptsTable();

  const tmpDir = path.join(__dirname, '../../.cache/yt-subs');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Get videos to process
  const filterIds = process.argv.slice(2);
  let videos: { id: string; youtube_video_id: string; title: string }[];

  if (filterIds.length > 0) {
    videos = filterIds.map(id => {
      const v = db.prepare('SELECT id, youtube_video_id, title FROM videos WHERE id = ?').get(id) as any;
      if (!v) { console.error(`Video not found: ${id}`); process.exit(1); }
      return v;
    });
  } else {
    videos = db.prepare('SELECT id, youtube_video_id, title FROM videos ORDER BY id').all() as any[];
  }

  console.log(`Processing ${videos.length} videos...\n`);

  let successCount = 0;
  let totalClips = 0;
  let totalLines = 0;

  for (const video of videos) {
    console.log(`📡 ${video.id} (${video.youtube_video_id}) — ${video.title}`);

    try {
      const segments = await fetchSubtitles(video.youtube_video_id, ytDlpPath, tmpDir);
      console.log(`   Got ${segments.length} segments`);

      // Store full transcript
      storeFullTranscript(video.id, segments);

      // Update clips linked to this video
      const clips = db.prepare('SELECT id, start_time, end_time FROM clips WHERE video_id = ?').all(video.id) as any[];

      for (const clip of clips) {
        const lineCount = updateClipSubtitles(clip.id, clip.start_time, clip.end_time, segments);
        console.log(`   Clip #${clip.id} (${clip.start_time}s-${clip.end_time}s): ${lineCount} lines`);
        totalClips++;
        totalLines += lineCount;
      }

      successCount++;
    } catch (err: any) {
      console.error(`   ✗ Failed: ${err.message}`);
    }

    console.log();
  }

  console.log(`\n✅ Done! ${successCount}/${videos.length} videos processed.`);
  console.log(`   ${totalClips} clips updated with ${totalLines} subtitle lines.`);
  console.log(`   Full transcripts stored in video_transcripts table.`);
}

main().catch(console.error);
