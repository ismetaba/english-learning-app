/**
 * Align existing dialogue lines with YouTube transcript timing.
 *
 * Usage:
 *   npx ts-node scripts/align-subtitles.ts
 *
 * Prerequisites:
 *   Run `npx ts-node scripts/fetch-youtube-transcripts.ts` first to
 *   download captions into data/scenes/youtube-transcripts.json.
 *
 * This script reads the raw transcripts and uses fuzzy matching to find
 * where each dialogue line occurs, then outputs aligned timing data to
 * data/scenes/aligned-timing.json for review before applying.
 */

import * as fs from 'fs';
import * as path from 'path';
import { scenes, DialogueLine } from '../data/scenes';

// ── Types ──────────────────────────────────────────────────────────────

interface YouTubeWord {
  text: string;
  startMs: number;
  durationMs: number;
}

interface YouTubeSegment {
  text: string;
  offsetMs: number;
  durationMs: number;
  words: YouTubeWord[];
}

interface TranscriptResult {
  videoId: string;
  language: string;
  segments: YouTubeSegment[];
  fetchedAt: string;
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
  originalStartTime?: number;
  originalEndTime?: number;
}

interface AlignedScene {
  sceneId: string;
  movieTitle: string;
  videoId: string;
  lines: AlignedLine[];
  avgConfidence: number;
  alignedAt: string;
}

// ── Text Matching Utilities ───────────────────────────────────────────

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

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
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

// ── Word Map Construction ─────────────────────────────────────────────

interface WordMapEntry {
  word: string;
  startMs: number;
  endMs: number;
}

function buildWordMap(segments: YouTubeSegment[]): WordMapEntry[] {
  const wordMap: WordMapEntry[] = [];

  for (const seg of segments) {
    if (seg.words.length > 0) {
      for (const w of seg.words) {
        const cleaned = w.text.trim();
        if (!cleaned) continue;
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
    } else {
      // Fallback: split segment text evenly
      const words = seg.text.split(/\s+/).filter(Boolean);
      const perWordDur = seg.durationMs / Math.max(1, words.length);
      for (let i = 0; i < words.length; i++) {
        wordMap.push({
          word: words[i],
          startMs: seg.offsetMs + i * perWordDur,
          endMs: seg.offsetMs + (i + 1) * perWordDur,
        });
      }
    }
  }

  return wordMap;
}

// ── Line Alignment ────────────────────────────────────────────────────

function alignLine(
  line: DialogueLine,
  wordMap: WordMapEntry[],
  searchFrom: number,
): { startIdx: number; endIdx: number; confidence: number; wordTimestamps: WordTimestamp[] } | null {
  const lineWords = getWords(line.text);
  if (lineWords.length === 0) return null;

  const windowSize = lineWords.length;
  // Search broadly but not infinitely
  const maxSearch = Math.min(wordMap.length, searchFrom + windowSize * 30);

  let bestScore = 0;
  let bestStart = -1;
  let bestSize = windowSize;

  // Slide windows of varying sizes
  const minSize = Math.max(1, windowSize - 3);
  const maxSize = windowSize + 5;

  for (let size = minSize; size <= maxSize; size++) {
    for (let i = Math.max(0, searchFrom - 10); i <= maxSearch - size; i++) {
      const windowWords = wordMap.slice(i, i + size).map(w => normalizeText(w.word));
      const lcs = lcsLength(lineWords, windowWords);
      const score = (2 * lcs) / (lineWords.length + windowWords.length);
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
        bestSize = size;
      }
    }
  }

  if (bestScore < 0.35 || bestStart === -1) return null;

  const matchedWords = wordMap.slice(bestStart, bestStart + bestSize);

  // Build per-word timestamps by mapping original words to matched words
  const wordTimestamps: WordTimestamp[] = [];
  let tIdx = 0;
  const originalWords = line.text.split(' ');

  for (const originalWord of originalWords) {
    const normalizedOrig = normalizeText(originalWord);
    let found = false;

    // Look for this word in the matched window
    for (let j = tIdx; j < matchedWords.length; j++) {
      if (normalizeText(matchedWords[j].word) === normalizedOrig) {
        wordTimestamps.push({
          word: originalWord,
          startTime: Math.round(matchedWords[j].startMs / 100) / 10,
          endTime: Math.round(matchedWords[j].endMs / 100) / 10,
        });
        tIdx = j + 1;
        found = true;
        break;
      }
    }

    if (!found) {
      // Approximate: interpolate from current position
      const pos = Math.min(tIdx, matchedWords.length - 1);
      if (pos >= 0 && matchedWords[pos]) {
        wordTimestamps.push({
          word: originalWord,
          startTime: Math.round(matchedWords[pos].startMs / 100) / 10,
          endTime: Math.round(matchedWords[pos].endMs / 100) / 10,
        });
      }
      tIdx++;
    }
  }

  return {
    startIdx: bestStart,
    endIdx: bestStart + bestSize - 1,
    confidence: Math.round(bestScore * 100) / 100,
    wordTimestamps,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const transcriptsPath = path.resolve(__dirname, '../data/scenes/youtube-transcripts.json');
  if (!fs.existsSync(transcriptsPath)) {
    console.error('❌ youtube-transcripts.json not found.');
    console.error('   Run: npx ts-node scripts/fetch-youtube-transcripts.ts');
    process.exit(1);
  }

  const transcripts: Record<string, TranscriptResult> = JSON.parse(
    fs.readFileSync(transcriptsPath, 'utf-8'),
  );

  const results: AlignedScene[] = [];

  for (const scene of scenes) {
    const transcript = transcripts[scene.id];
    if (!transcript) {
      console.log(`⏭  Skipping ${scene.id} — no transcript data`);
      continue;
    }

    console.log(`\n🎬 Aligning: ${scene.movieTitle} (${scene.id})`);

    const wordMap = buildWordMap(transcript.segments);
    console.log(`   Transcript: ${wordMap.length} words`);

    let searchFrom = 0;
    const alignedLines: AlignedLine[] = [];

    for (const line of scene.lines) {
      const match = alignLine(line, wordMap, searchFrom);

      if (match && match.confidence >= 0.4) {
        const startTime = wordMap[match.startIdx].startMs / 1000;
        const endTime = wordMap[match.endIdx].endMs / 1000;

        alignedLines.push({
          speaker: line.speaker,
          text: line.text,
          lineStartTime: Math.round(startTime * 10) / 10,
          lineEndTime: Math.round(endTime * 10) / 10,
          wordTimestamps: match.wordTimestamps,
          confidence: match.confidence,
          source: 'youtube-auto',
          originalStartTime: line.lineStartTime,
          originalEndTime: line.lineEndTime,
        });

        const drift = line.lineStartTime
          ? Math.round((startTime - line.lineStartTime) * 10) / 10
          : '?';
        console.log(
          `   ✓ [${match.confidence.toFixed(2)}] "${line.text.substring(0, 40)}..." → ${startTime.toFixed(1)}s (drift: ${drift}s)`,
        );

        searchFrom = match.startIdx + 1;
      } else {
        alignedLines.push({
          speaker: line.speaker,
          text: line.text,
          lineStartTime: line.lineStartTime || 0,
          lineEndTime: line.lineEndTime || 0,
          wordTimestamps: [],
          confidence: match?.confidence ?? 0,
          source: 'manual',
          originalStartTime: line.lineStartTime,
          originalEndTime: line.lineEndTime,
        });
        console.log(
          `   ⚠ [${(match?.confidence ?? 0).toFixed(2)}] "${line.text.substring(0, 40)}..." → kept original`,
        );
      }
    }

    const avgConfidence =
      alignedLines.reduce((sum, l) => sum + l.confidence, 0) / alignedLines.length;

    results.push({
      sceneId: scene.id,
      movieTitle: scene.movieTitle,
      videoId: scene.youtubeVideoId,
      lines: alignedLines,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      alignedAt: new Date().toISOString(),
    });

    console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(0)}%`);
  }

  // Save alignment results for review
  const outputPath = path.resolve(__dirname, '../data/scenes/aligned-timing.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved alignment results to ${outputPath}`);
  console.log('\n📋 Review the results, then run: npx ts-node scripts/apply-alignment.ts');
}

main();
