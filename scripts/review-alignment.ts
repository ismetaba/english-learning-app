/**
 * Interactive review of aligned subtitle timing.
 *
 * Usage:
 *   npx ts-node scripts/review-alignment.ts [--auto-approve <threshold>]
 *
 * Reads data/scenes/aligned-timing.json and presents each scene's alignment
 * for human review. Creates data/scenes/alignment-review.json with
 * approve/reject decisions per scene.
 *
 * Options:
 *   --auto-approve <threshold>  Auto-approve scenes with avgConfidence >= threshold (0-1)
 *                               Remaining scenes still require manual review.
 *
 * Interactive commands (when prompted per scene):
 *   y / yes  — approve the scene
 *   n / no   — reject the scene
 *   s / skip — skip (keep previous decision if any)
 *   q / quit — save decisions and exit
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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

export interface SceneReview {
  sceneId: string;
  movieTitle: string;
  decision: 'approved' | 'rejected' | 'pending';
  avgConfidence: number;
  reviewedAt: string;
  reviewedBy: 'human' | 'auto';
  rejectedLines?: number[];
}

export interface AlignmentReview {
  scenes: SceneReview[];
  reviewedAt: string;
}

const ALIGNMENT_PATH = path.resolve(__dirname, '../data/scenes/aligned-timing.json');
const REVIEW_PATH = path.resolve(__dirname, '../data/scenes/alignment-review.json');

export function loadAlignments(): AlignedScene[] {
  if (!fs.existsSync(ALIGNMENT_PATH)) {
    console.error('❌ aligned-timing.json not found.');
    console.error('   Run: npm run subtitles:align');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(ALIGNMENT_PATH, 'utf-8'));
}

export function loadExistingReview(): AlignmentReview | null {
  if (!fs.existsSync(REVIEW_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(REVIEW_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveReview(review: AlignmentReview): void {
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2));
}

/** Build a review with auto-approve for scenes above threshold. */
export function buildAutoReview(
  alignments: AlignedScene[],
  threshold: number,
  existing: AlignmentReview | null,
): AlignmentReview {
  const existingMap = new Map<string, SceneReview>();
  if (existing) {
    for (const s of existing.scenes) existingMap.set(s.sceneId, s);
  }

  const scenes: SceneReview[] = alignments.map((scene) => {
    const prev = existingMap.get(scene.sceneId);
    if (scene.avgConfidence >= threshold) {
      return {
        sceneId: scene.sceneId,
        movieTitle: scene.movieTitle,
        decision: 'approved' as const,
        avgConfidence: scene.avgConfidence,
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'auto' as const,
      };
    }
    // Keep previous decision if exists, otherwise pending
    if (prev && prev.decision !== 'pending') return prev;
    return {
      sceneId: scene.sceneId,
      movieTitle: scene.movieTitle,
      decision: 'pending' as const,
      avgConfidence: scene.avgConfidence,
      reviewedAt: '',
      reviewedBy: 'human' as const,
    };
  });

  return { scenes, reviewedAt: new Date().toISOString() };
}

function printSceneSummary(scene: AlignedScene): void {
  const confColor = scene.avgConfidence >= 0.7 ? '🟢' : scene.avgConfidence >= 0.5 ? '🟡' : '🔴';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎬 ${scene.movieTitle} (${scene.sceneId})`);
  console.log(`   ${confColor} Average confidence: ${(scene.avgConfidence * 100).toFixed(0)}%`);
  console.log(`   Lines: ${scene.lines.length}`);
  console.log(`${'─'.repeat(60)}`);

  for (let i = 0; i < scene.lines.length; i++) {
    const line = scene.lines[i];
    const confIcon = line.confidence >= 0.7 ? '✓' : line.confidence >= 0.5 ? '~' : '✗';
    const drift = line.originalStartTime != null
      ? `drift: ${(line.lineStartTime - line.originalStartTime).toFixed(1)}s`
      : '';
    console.log(
      `   ${confIcon} [${(line.confidence * 100).toFixed(0)}%] ${line.speaker}: "${line.text.substring(0, 50)}${line.text.length > 50 ? '...' : ''}"`,
    );
    console.log(
      `       ${line.lineStartTime}s → ${line.lineEndTime}s  (${line.source}) ${drift}`,
    );
  }
  console.log(`${'═'.repeat(60)}`);
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim().toLowerCase()));
  });
}

async function interactiveReview(
  alignments: AlignedScene[],
  existing: AlignmentReview | null,
): Promise<AlignmentReview> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const existingMap = new Map<string, SceneReview>();
  if (existing) {
    for (const s of existing.scenes) existingMap.set(s.sceneId, s);
  }

  const reviews: SceneReview[] = [];

  console.log('\n📋 Subtitle Alignment Review');
  console.log(`   ${alignments.length} scene(s) to review\n`);

  let quit = false;
  for (const scene of alignments) {
    if (quit) {
      // Keep previous decision or pending
      const prev = existingMap.get(scene.sceneId);
      reviews.push(prev || {
        sceneId: scene.sceneId,
        movieTitle: scene.movieTitle,
        decision: 'pending',
        avgConfidence: scene.avgConfidence,
        reviewedAt: '',
        reviewedBy: 'human',
      });
      continue;
    }

    const prev = existingMap.get(scene.sceneId);
    const prevLabel = prev ? ` [currently: ${prev.decision}]` : '';

    printSceneSummary(scene);

    const answer = await askQuestion(rl, `   Approve this scene? (y/n/s/q)${prevLabel}: `);

    switch (answer) {
      case 'y':
      case 'yes':
        reviews.push({
          sceneId: scene.sceneId,
          movieTitle: scene.movieTitle,
          decision: 'approved',
          avgConfidence: scene.avgConfidence,
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'human',
        });
        console.log('   ✅ Approved\n');
        break;
      case 'n':
      case 'no':
        reviews.push({
          sceneId: scene.sceneId,
          movieTitle: scene.movieTitle,
          decision: 'rejected',
          avgConfidence: scene.avgConfidence,
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'human',
        });
        console.log('   ❌ Rejected\n');
        break;
      case 'q':
      case 'quit':
        quit = true;
        reviews.push(prev || {
          sceneId: scene.sceneId,
          movieTitle: scene.movieTitle,
          decision: 'pending',
          avgConfidence: scene.avgConfidence,
          reviewedAt: '',
          reviewedBy: 'human',
        });
        console.log('   ⏹ Saving and exiting...\n');
        break;
      default: // skip
        reviews.push(prev || {
          sceneId: scene.sceneId,
          movieTitle: scene.movieTitle,
          decision: 'pending',
          avgConfidence: scene.avgConfidence,
          reviewedAt: '',
          reviewedBy: 'human',
        });
        console.log('   ⏭ Skipped\n');
        break;
    }
  }

  rl.close();

  const review: AlignmentReview = {
    scenes: reviews,
    reviewedAt: new Date().toISOString(),
  };

  return review;
}

async function main() {
  const args = process.argv.slice(2);
  const autoIdx = args.indexOf('--auto-approve');
  const autoThreshold = autoIdx !== -1 ? parseFloat(args[autoIdx + 1]) : undefined;

  const alignments = loadAlignments();
  const existing = loadExistingReview();

  let review: AlignmentReview;

  if (autoThreshold != null && !isNaN(autoThreshold)) {
    console.log(`🤖 Auto-approving scenes with confidence >= ${(autoThreshold * 100).toFixed(0)}%`);
    review = buildAutoReview(alignments, autoThreshold, existing);

    const approved = review.scenes.filter(s => s.decision === 'approved').length;
    const pending = review.scenes.filter(s => s.decision === 'pending').length;
    const rejected = review.scenes.filter(s => s.decision === 'rejected').length;
    console.log(`   ✅ ${approved} approved, ❌ ${rejected} rejected, ⏳ ${pending} pending`);
  } else {
    review = await interactiveReview(alignments, existing);
  }

  saveReview(review);

  // Summary
  const approved = review.scenes.filter(s => s.decision === 'approved');
  const rejected = review.scenes.filter(s => s.decision === 'rejected');
  const pending = review.scenes.filter(s => s.decision === 'pending');

  console.log('\n📊 Review Summary:');
  console.log(`   ✅ Approved: ${approved.length} scene(s)`);
  if (approved.length > 0) {
    approved.forEach(s => console.log(`      - ${s.movieTitle} (${(s.avgConfidence * 100).toFixed(0)}%)`));
  }
  console.log(`   ❌ Rejected: ${rejected.length} scene(s)`);
  if (rejected.length > 0) {
    rejected.forEach(s => console.log(`      - ${s.movieTitle} (${(s.avgConfidence * 100).toFixed(0)}%)`));
  }
  console.log(`   ⏳ Pending:  ${pending.length} scene(s)`);

  console.log(`\n💾 Saved review to ${REVIEW_PATH}`);
  if (approved.length > 0) {
    console.log('\n📋 Next step: npm run subtitles:apply');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
