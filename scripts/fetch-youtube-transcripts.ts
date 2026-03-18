/**
 * Fetch YouTube auto-generated captions with word-level timing.
 *
 * Usage:
 *   npx ts-node scripts/fetch-youtube-transcripts.ts
 *
 * This fetches captions for every scene video, then uses fuzzy matching
 * to align our dialogue lines with YouTube's timing data. Results are
 * written to data/scenes/youtube-transcripts.json (raw captions) and
 * the scene data is updated with corrected timestamps.
 *
 * Requires network access — run locally, not in CI.
 */

import * as fs from 'fs';
import * as path from 'path';

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

// ── YouTube Transcript Fetcher ────────────────────────────────────────

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getCaptionTracks(videoId: string): Promise<any[]> {
  // Try InnerTube API first (more reliable)
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
      },
      body: JSON.stringify({
        context: {
          client: { clientName: 'ANDROID', clientVersion: '20.10.38' },
        },
        videoId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) return tracks;
    }
  } catch {}

  // Fallback: scrape the watch page
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': WEB_UA },
  });
  const html = await res.text();
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
  if (!match) throw new Error(`Could not parse player response for ${videoId}`);
  const data = JSON.parse(match[1]);
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error(`No caption tracks found for ${videoId}`);
  }
  return tracks;
}

async function fetchTranscript(videoId: string, lang = 'en'): Promise<TranscriptResult> {
  const tracks = await getCaptionTracks(videoId);
  const track = tracks.find((t: any) => t.languageCode === lang) || tracks[0];

  // Request json3 format which includes word-level timing
  const url = track.baseUrl + '&fmt=json3';
  const res = await fetch(url, {
    headers: { 'User-Agent': WEB_UA },
  });
  if (!res.ok) throw new Error(`Failed to fetch captions for ${videoId}: ${res.status}`);

  const json = await res.json();
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
        durationMs: seg.acAsrConf != null ? (event.dDurationMs || 0) : (event.dDurationMs || 0),
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

  return {
    videoId,
    language: track.languageCode,
    segments,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Fuzzy Matching ────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

/**
 * Compute longest common subsequence length between two word arrays.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  // Use 1D DP for memory efficiency
  const prev = new Array(n + 1).fill(0);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }
  return prev[n];
}

/**
 * Compute a similarity score (0-1) between two texts using LCS on words.
 */
function similarity(textA: string, textB: string): number {
  const wordsA = getWords(textA);
  const wordsB = getWords(textB);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const lcs = lcsLength(wordsA, wordsB);
  return (2 * lcs) / (wordsA.length + wordsB.length);
}

// ── Scene Line ↔ Transcript Alignment ─────────────────────────────────

interface DialogueLine {
  speaker: string;
  text: string;
  lineStartTime?: number;
  lineEndTime?: number;
}

interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}

interface AlignedLine {
  speaker: string;
  text: string;
  lineStartTime: number;
  lineEndTime: number;
  wordTimestamps: WordTimestamp[];
  confidence: number;
  source: 'youtube-auto' | 'manual';
}

/**
 * Build a combined transcript string with word-level timestamp tracking.
 * Returns { fullText, wordMap } where wordMap[i] = { word, startMs }
 */
function buildTranscriptWordMap(segments: YouTubeSegment[]): {
  fullText: string;
  wordMap: Array<{ word: string; startMs: number; endMs: number }>;
} {
  const wordMap: Array<{ word: string; startMs: number; endMs: number }> = [];

  for (const seg of segments) {
    for (const w of seg.words) {
      const cleaned = w.text.trim();
      if (!cleaned) continue;
      // Split multi-word segments
      const subWords = cleaned.split(/\s+/);
      const perWordDur = w.durationMs / Math.max(1, subWords.length);
      for (let i = 0; i < subWords.length; i++) {
        wordMap.push({
          word: subWords[i],
          startMs: w.startMs + i * perWordDur,
          endMs: w.startMs + (i + 1) * perWordDur,
        });
      }
    }
  }

  const fullText = wordMap.map(w => w.word).join(' ');
  return { fullText, wordMap };
}

/**
 * Find the best matching window in the transcript for a dialogue line.
 * Returns the aligned timestamps and per-word timing.
 */
function alignLine(
  line: DialogueLine,
  wordMap: Array<{ word: string; startMs: number; endMs: number }>,
  searchStartIdx: number = 0,
): { startIdx: number; endIdx: number; confidence: number; wordTimestamps: WordTimestamp[] } | null {
  const lineWords = getWords(line.text);
  if (lineWords.length === 0) return null;

  const windowSize = lineWords.length;
  // Search within a reasonable range (avoid matching too far away)
  const searchEnd = Math.min(wordMap.length, searchStartIdx + windowSize * 20);

  let bestScore = 0;
  let bestStart = -1;

  // Slide a window of varying sizes around the expected word count
  for (let size = Math.max(1, windowSize - 3); size <= windowSize + 5; size++) {
    for (let i = searchStartIdx; i <= searchEnd - size; i++) {
      const windowWords = wordMap.slice(i, i + size).map(w => normalizeText(w.word));
      const score = lcsLength(lineWords, windowWords);
      const normalizedScore = (2 * score) / (lineWords.length + windowWords.length);
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestStart = i;
      }
    }
  }

  if (bestScore < 0.4 || bestStart === -1) return null;

  // Determine end index
  const bestEnd = Math.min(wordMap.length - 1, bestStart + windowSize + 3);

  // Extract word-level timestamps
  const wordTimestamps: WordTimestamp[] = [];
  const matchedWords = wordMap.slice(bestStart, bestEnd + 1);

  // Map original words to transcript words
  let tIdx = 0;
  for (const originalWord of line.text.split(' ')) {
    const normalizedOrig = normalizeText(originalWord);
    // Find closest matching word in transcript window
    let found = false;
    for (let j = tIdx; j < matchedWords.length; j++) {
      if (normalizeText(matchedWords[j].word) === normalizedOrig) {
        wordTimestamps.push({
          word: originalWord,
          startTime: matchedWords[j].startMs / 1000,
          endTime: matchedWords[j].endMs / 1000,
        });
        tIdx = j + 1;
        found = true;
        break;
      }
    }
    if (!found && tIdx < matchedWords.length) {
      // Approximate: use current position
      wordTimestamps.push({
        word: originalWord,
        startTime: matchedWords[Math.min(tIdx, matchedWords.length - 1)].startMs / 1000,
        endTime: matchedWords[Math.min(tIdx, matchedWords.length - 1)].endMs / 1000,
      });
      tIdx++;
    }
  }

  return {
    startIdx: bestStart,
    endIdx: bestEnd,
    confidence: bestScore,
    wordTimestamps,
  };
}

/**
 * Align all dialogue lines for a scene against the YouTube transcript.
 */
function alignScene(
  lines: DialogueLine[],
  segments: YouTubeSegment[],
): AlignedLine[] {
  const { wordMap } = buildTranscriptWordMap(segments);
  const aligned: AlignedLine[] = [];
  let searchFrom = 0;

  for (const line of lines) {
    const match = alignLine(line, wordMap, searchFrom);

    if (match && match.confidence >= 0.5) {
      const startTime = wordMap[match.startIdx].startMs / 1000;
      const endTime = wordMap[match.endIdx].endMs / 1000;

      aligned.push({
        speaker: line.speaker,
        text: line.text,
        lineStartTime: Math.round(startTime * 10) / 10,
        lineEndTime: Math.round(endTime * 10) / 10,
        wordTimestamps: match.wordTimestamps.map(wt => ({
          word: wt.word,
          startTime: Math.round(wt.startTime * 10) / 10,
          endTime: Math.round(wt.endTime * 10) / 10,
        })),
        confidence: Math.round(match.confidence * 100) / 100,
        source: 'youtube-auto',
      });

      // Move search window forward
      searchFrom = match.startIdx + 1;
    } else {
      // Keep original timing if no good match
      aligned.push({
        speaker: line.speaker,
        text: line.text,
        lineStartTime: line.lineStartTime || 0,
        lineEndTime: line.lineEndTime || 0,
        wordTimestamps: [],
        confidence: 0,
        source: 'manual',
      });
      console.warn(`  ⚠ Low confidence for: "${line.text.substring(0, 50)}..." (${match?.confidence ?? 0})`);
    }
  }

  return aligned;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
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
  const alignments: Record<string, AlignedLine[]> = {};

  // Load existing scenes data for alignment
  // We need to dynamically evaluate the TS, but since it's simple exports,
  // we just parse the structure
  const linesRegex = /id:\s*'([^']+)'[\s\S]*?lines:\s*\[([\s\S]*?)\],\s*\n\s*vocabCoverage/g;

  for (const entry of sceneEntries) {
    console.log(`📡 Fetching transcript for ${entry.id} (${entry.videoId})...`);
    try {
      const transcript = await fetchTranscript(entry.videoId);
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

  // Now align each scene
  // For this we need to load the actual scene data
  // Since we can't import TS directly in a script context, we'll read the JSON output
  // and use the scenes module at runtime
  console.log('\n🔄 To align scenes, run: npx ts-node scripts/align-subtitles.ts');
  console.log('   (This reads youtube-transcripts.json and updates scene timing)');
}

main().catch(console.error);
