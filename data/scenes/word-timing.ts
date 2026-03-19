/**
 * Word-level timing data for accurate word-by-word subtitle reveal.
 *
 * This is populated by running the alignment scripts:
 *   1. npx ts-node scripts/fetch-youtube-transcripts.ts
 *   2. npx ts-node scripts/align-subtitles.ts
 *   3. npx ts-node scripts/apply-alignment.ts
 *
 * Until the scripts are run, this defaults to empty (the player
 * falls back to linear interpolation).
 */

import { WordTimestamp } from './index';

// Word timing keyed by sceneId → lineIndex → word timestamps
// This will be populated from word-timing.json after alignment
let wordTimingData: Record<string, Record<number, WordTimestamp[]>> = {};

try {
  // Try to load word-timing.json if it exists
  wordTimingData = require('./word-timing.json');
} catch {
  // File doesn't exist yet — that's fine, alignment hasn't been run
}

/**
 * Get word-level timestamps for a specific line in a scene.
 * Returns undefined if no word-level data is available.
 */
export function getWordTimestamps(
  sceneId: string,
  lineIndex: number,
): WordTimestamp[] | undefined {
  return wordTimingData[sceneId]?.[lineIndex];
}

/**
 * Check if word-level timing data is available for a scene.
 */
export function hasWordTiming(sceneId: string): boolean {
  return sceneId in wordTimingData;
}
