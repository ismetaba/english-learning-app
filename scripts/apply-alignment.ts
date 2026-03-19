/**
 * Apply aligned timing data to the scene source file.
 *
 * Usage:
 *   npx ts-node scripts/apply-alignment.ts [--min-confidence 0.5] [--skip-review]
 *
 * Reads data/scenes/aligned-timing.json and data/scenes/alignment-review.json,
 * then updates data/scenes/index.ts with corrected timestamps, word-level
 * timing data, and subtitleStatus for approved scenes.
 *
 * Only scenes marked 'approved' in alignment-review.json are applied.
 * Use --skip-review to bypass the review check (not recommended).
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
  source: 'youtube-auto' | 'whisperx' | 'manual';
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

interface SceneReview {
  sceneId: string;
  decision: 'approved' | 'rejected' | 'pending';
}

interface AlignmentReview {
  scenes: SceneReview[];
}

function main() {
  const args = process.argv.slice(2);
  let minConfidence = 0.5;
  const confIdx = args.indexOf('--min-confidence');
  if (confIdx !== -1 && args[confIdx + 1]) {
    minConfidence = parseFloat(args[confIdx + 1]);
  }
  const skipReview = args.includes('--skip-review');

  const alignmentPath = path.resolve(__dirname, '../data/scenes/aligned-timing.json');
  if (!fs.existsSync(alignmentPath)) {
    console.error('❌ aligned-timing.json not found.');
    console.error('   Run: npm run subtitles:align');
    process.exit(1);
  }

  const alignments: AlignedScene[] = JSON.parse(
    fs.readFileSync(alignmentPath, 'utf-8'),
  );

  // Load review decisions
  const reviewPath = path.resolve(__dirname, '../data/scenes/alignment-review.json');
  let approvedSceneIds: Set<string>;

  if (skipReview) {
    console.log('⚠️  Skipping review check (--skip-review). All scenes will be applied.');
    approvedSceneIds = new Set(alignments.map(s => s.sceneId));
  } else {
    if (!fs.existsSync(reviewPath)) {
      console.error('❌ alignment-review.json not found.');
      console.error('   Run: npm run subtitles:review');
      console.error('   Or use --skip-review to bypass (not recommended).');
      process.exit(1);
    }

    const review: AlignmentReview = JSON.parse(
      fs.readFileSync(reviewPath, 'utf-8'),
    );

    approvedSceneIds = new Set(
      review.scenes
        .filter(s => s.decision === 'approved')
        .map(s => s.sceneId),
    );

    if (approvedSceneIds.size === 0) {
      console.log('⚠️  No scenes approved yet. Run: npm run subtitles:review');
      process.exit(0);
    }

    console.log(`📋 ${approvedSceneIds.size} scene(s) approved for application`);
  }

  const scenesPath = path.resolve(__dirname, '../data/scenes/index.ts');
  let code = fs.readFileSync(scenesPath, 'utf-8');

  let totalUpdated = 0;
  let totalSkipped = 0;
  const appliedSceneIds: string[] = [];

  for (const scene of alignments) {
    if (!approvedSceneIds.has(scene.sceneId)) {
      console.log(`\n⏭ Skipping ${scene.movieTitle} — not approved`);
      totalSkipped += scene.lines.length;
      continue;
    }

    console.log(`\n🎬 ${scene.movieTitle} (avg confidence: ${(scene.avgConfidence * 100).toFixed(0)}%)`);

    let sceneUpdated = false;
    for (const line of scene.lines) {
      if ((line.source !== 'youtube-auto' && line.source !== 'whisperx') || line.confidence < minConfidence) {
        console.log(`   ⏭ Skipped: "${line.text.substring(0, 40)}..." (${line.source}, ${(line.confidence * 100).toFixed(0)}%)`);
        totalSkipped++;
        continue;
      }

      // Find and replace the line's timing in the source
      const escapedText = line.text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

      const linePattern = new RegExp(
        `(\\{[^}]*speaker:\\s*'${escapeRegex(line.speaker)}'[^}]*text:\\s*'${escapeRegex(escapedText)}'[^}]*lineStartTime:\\s*)\\d+(\\.\\d+)?(\\s*,\\s*lineEndTime:\\s*)\\d+(\\.\\d+)?(\\s*[,}])`,
      );

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
          sceneUpdated = true;
        }
      } else {
        console.log(`   ⚠ Could not find in source: "${line.text.substring(0, 40)}..."`);
        totalSkipped++;
      }
    }

    if (sceneUpdated) {
      appliedSceneIds.push(scene.sceneId);
    }
  }

  // Set subtitleStatus: 'approved' for applied scenes
  for (const sceneId of appliedSceneIds) {
    // Find the scene object in the source and add/update subtitleStatus
    const sceneBlockPattern = new RegExp(
      `(id:\\s*'${escapeRegex(sceneId)}'[\\s\\S]*?description:\\s*'[^']*')`,
    );
    const sceneMatch = code.match(sceneBlockPattern);
    if (sceneMatch) {
      const block = sceneMatch[0];
      if (block.includes('subtitleStatus')) {
        // Update existing
        code = code.replace(
          new RegExp(`(id:\\s*'${escapeRegex(sceneId)}'[\\s\\S]*?)subtitleStatus:\\s*'[^']*'`),
          `$1subtitleStatus: 'approved'`,
        );
      } else {
        // Add after description
        code = code.replace(
          new RegExp(`(id:\\s*'${escapeRegex(sceneId)}'[\\s\\S]*?description:\\s*'[^']*',?)`),
          `$1\n    subtitleStatus: 'approved',`,
        );
      }
      console.log(`   🏷 Set subtitleStatus: 'approved' for ${sceneId}`);
    }
  }

  // Write updated source file
  fs.writeFileSync(scenesPath, code);
  console.log(`\n✅ Updated ${totalUpdated} lines, skipped ${totalSkipped}`);

  // Save word-level timing only for approved scenes
  const wordTimingData: Record<string, Record<number, WordTimestamp[]>> = {};
  for (const scene of alignments) {
    if (!approvedSceneIds.has(scene.sceneId)) continue;
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
