/**
 * Fetch YouTube auto-generated captions with word-level timing.
 *
 * Usage:
 *   npx ts-node scripts/fetch-youtube-transcripts.ts
 *
 * This fetches captions for every scene video using yt-dlp, then writes
 * results to data/scenes/youtube-transcripts.json (raw captions).
 *
 * Prerequisites:
 *   pip3 install yt-dlp
 *
 * Requires network access — run locally, not in CI.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ── Types ──────────────────────────────────────────────────────────────

interface YouTubeWord {
  text: string;
  /** Start time in milliseconds */
  startMs: number;
  /** Duration in milliseconds */
  durationMs: number;
}

interface YouTubeSegment {
  text: string;
  /** Offset in milliseconds */
  offsetMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  words: YouTubeWord[];
}

interface TranscriptResult {
  videoId: string;
  language: string;
  segments: YouTubeSegment[];
  fetchedAt: string;
}

// ── yt-dlp based fetcher ─────────────────────────────────────────────

function findYtDlp(): string {
  // Check common locations
  const candidates = [
    'yt-dlp',
    path.join(process.env.HOME || '', 'Library/Python/3.14/bin/yt-dlp'),
    path.join(process.env.HOME || '', 'Library/Python/3.13/bin/yt-dlp'),
    path.join(process.env.HOME || '', 'Library/Python/3.12/bin/yt-dlp'),
    path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: 'pipe' });
      return cmd;
    } catch {}
  }
  throw new Error(
    'yt-dlp not found. Install it with: pip3 install --user --break-system-packages yt-dlp'
  );
}

function parseJson3Events(json: any): YouTubeSegment[] {
  const events: any[] = json.events || [];
  const segments: YouTubeSegment[] = [];

  for (const event of events) {
    if (!event.segs) continue;

    const words: YouTubeWord[] = [];
    let fullText = '';

    for (const seg of event.segs) {
      const text = (seg.utf8 || '').replace(/\n/g, ' ').trim();
      if (!text) continue;
      words.push({
        text,
        startMs: (event.tStartMs || 0) + (seg.tOffsetMs || 0),
        durationMs: event.dDurationMs || 0,
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

async function fetchTranscript(
  videoId: string,
  ytDlpPath: string,
  tmpDir: string,
  lang = 'en',
): Promise<TranscriptResult> {
  const outTemplate = path.join(tmpDir, `${videoId}`);
  const subFile = path.join(tmpDir, `${videoId}.${lang}.json3`);

  // Clean up any previous attempt
  try { fs.unlinkSync(subFile); } catch {}

  // Use yt-dlp to download subtitles in json3 format
  const cmd = [
    `"${ytDlpPath}"`,
    '--js-runtimes node',
    '--remote-components ejs:github',
    '--write-auto-sub',
    `--sub-lang ${lang}`,
    '--sub-format json3',
    '--skip-download',
    '-o', `"${outTemplate}"`,
    `"https://www.youtube.com/watch?v=${videoId}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 60_000 });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`yt-dlp failed: ${stderr.split('\n').pop()}`);
  }

  if (!fs.existsSync(subFile)) {
    throw new Error(`No subtitles file produced for ${videoId}`);
  }

  const json = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
  const segments = parseJson3Events(json);

  return {
    videoId,
    language: lang,
    segments,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const ytDlpPath = findYtDlp();
  console.log(`Using yt-dlp: ${ytDlpPath}\n`);

  // Create temp directory for subtitle downloads
  const tmpDir = path.join(__dirname, '../.cache/yt-subs');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Import scene data
  const scenesPath = path.resolve(__dirname, '../data/scenes/index.ts');
  const scenesCode = fs.readFileSync(scenesPath, 'utf-8');

  // Parse scene video IDs from the source
  const sceneRegex = /id:\s*'([^']+)'[\s\S]*?youtubeVideoId:\s*'([^']+)'/g;
  const sceneEntries: Array<{ id: string; videoId: string }> = [];
  let m;
  while ((m = sceneRegex.exec(scenesCode)) !== null) {
    sceneEntries.push({ id: m[1], videoId: m[2] });
  }

  console.log(`Found ${sceneEntries.length} scenes to process.\n`);

  const outputDir = path.resolve(__dirname, '../data/scenes');
  const transcripts: Record<string, TranscriptResult> = {};

  for (const entry of sceneEntries) {
    console.log(`📡 Fetching transcript for ${entry.id} (${entry.videoId})...`);
    try {
      const transcript = await fetchTranscript(entry.videoId, ytDlpPath, tmpDir);
      transcripts[entry.id] = transcript;
      console.log(`   ✓ Got ${transcript.segments.length} segments`);
    } catch (err: any) {
      console.error(`   ✗ Failed: ${err.message}`);
    }
  }

  // Save raw transcripts
  const transcriptsPath = path.join(outputDir, 'youtube-transcripts.json');
  fs.writeFileSync(transcriptsPath, JSON.stringify(transcripts, null, 2));
  console.log(`\n💾 Saved raw transcripts to ${transcriptsPath}`);

  const successCount = Object.values(transcripts).filter(t => t.segments.length > 0).length;
  console.log(`\n✅ ${successCount}/${sceneEntries.length} scenes fetched successfully.`);

  if (successCount > 0) {
    console.log('\n🔄 To align scenes, run: npm run subtitles:align');
  }
}

main().catch(console.error);
