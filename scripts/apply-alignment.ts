/**
 * Apply aligned timing data to the scene source file.
 *
 * Usage:
 *   npx ts-node scripts/apply-alignment.ts [--min-confidence 0.5]
 *
 * Reads data/scenes/aligned-timing.json and updates data/scenes/index.ts
 * with corrected timestamps and word-level timing data.
 *
 * Only applies lines with confidence >= threshold (default 0.5).
 */

import * as fs from 'fs';
import * as path from 'path';

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

function main() {
  const args = process.argv.slice(2);
  let minConfidence = 0.5;
  const confIdx = args.indexOf('--min-confidence');
  if (confIdx !== -1 && args[confIdx + 1]) {
    minConfidence = parseFloat(args[confIdx + 1]);
  }

  const alignmentPath = path.resolve(__dirname, '../data/scenes/aligned-timing.json');
  if (!fs.existsSync(alignmentPath)) {
    console.error('❌ aligned-timing.json not found.');
    console.error('   Run: npx ts-node scripts/align-subtitles.ts');
    process.exit(1);
  }

  const alignments: AlignedScene[] = JSON.parse(
    fs.readFileSync(alignmentPath, 'utf-8'),
  );

  const scenesPath = path.resolve(__dirname, '../data/scenes/index.ts');
  let code = fs.readFileSync(scenesPath, 'utf-8');

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const scene of alignments) {
    console.log(`\n🎬 ${scene.movieTitle} (avg confidence: ${(scene.avgConfidence * 100).toFixed(0)}%)`);

    for (const line of scene.lines) {
      if (line.source !== 'youtube-auto' || line.confidence < minConfidence) {
        console.log(`   ⏭ Skipped: "${line.text.substring(0, 40)}..." (${line.source}, ${(line.confidence * 100).toFixed(0)}%)`);
        totalSkipped++;
        continue;
      }

      // Find and replace the line's timing in the source
      // Match the specific line by its text content
      const escapedText = line.text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

      // Build a regex to find this specific line object
      const linePattern = new RegExp(
        `(\\{[^}]*speaker:\\s*'${escapeRegex(line.speaker)}'[^}]*text:\\s*'${escapeRegex(escapedText)}'[^}]*lineStartTime:\\s*)\\d+(\\.\\d+)?(\\s*,\\s*lineEndTime:\\s*)\\d+(\\.\\d+)?(\\s*[,}])`,
      );

      // Also try with escaped quotes in the source
      const altPattern = new RegExp(
        `(\\{[^}]*speaker:\\s*'${escapeRegex(line.speaker)}'[^}]*text:\\s*["']${escapeRegex(line.text).replace(/'/g, "\\\\?'")}["'][^}]*lineStartTime:\\s*)\\d+(\\.\\d+)?(\\s*,\\s*lineEndTime:\\s*)\\d+(\\.\\d+)?(\\s*[,}])`,
      );

      const match = code.match(linePattern) || code.match(altPattern);
      if (match) {
        const oldStr = match[0];
        const newStr = oldStr
          .replace(
            /lineStartTime:\s*\d+(\.\d+)?/,
            `lineStartTime: ${line.lineStartTime}`,
          )
          .replace(
            /lineEndTime:\s*\d+(\.\d+)?/,
            `lineEndTime: ${line.lineEndTime}`,
          );

        if (oldStr !== newStr) {
          code = code.replace(oldStr, newStr);
          const drift = line.originalStartTime
            ? (line.lineStartTime - line.originalStartTime).toFixed(1)
            : '?';
          console.log(
            `   ✓ Updated: "${line.text.substring(0, 40)}..." ${line.lineStartTime}s-${line.lineEndTime}s (drift: ${drift}s)`,
          );
          totalUpdated++;
        }
      } else {
        console.log(`   ⚠ Could not find in source: "${line.text.substring(0, 40)}..."`);
        totalSkipped++;
      }
    }
  }

  // Write updated source file
  fs.writeFileSync(scenesPath, code);
  console.log(`\n✅ Updated ${totalUpdated} lines, skipped ${totalSkipped}`);

  // Also save the word-level timing as a separate data file
  // (used by the player for accurate word reveal)
  const wordTimingData: Record<string, Record<number, WordTimestamp[]>> = {};
  for (const scene of alignments) {
    wordTimingData[scene.sceneId] = {};
    scene.lines.forEach((line, idx) => {
      if (line.wordTimestamps.length > 0 && line.confidence >= minConfidence) {
        wordTimingData[scene.sceneId][idx] = line.wordTimestamps;
      }
    });
  }

  const wordTimingPath = path.resolve(__dirname, '../data/scenes/word-timing.json');
  fs.writeFileSync(wordTimingPath, JSON.stringify(wordTimingData, null, 2));
  console.log(`💾 Saved word-level timing to ${wordTimingPath}`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
