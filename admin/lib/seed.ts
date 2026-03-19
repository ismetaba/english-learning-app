/**
 * Seed the database from existing scene data.
 * Run: npx tsx lib/seed.ts
 */
import { getDb, createVideo, createClip, createSubtitleLine, createWordTimestamp, updateClipStatus } from './db';
import path from 'path';
import fs from 'fs';

// Read existing scene data
const scenesPath = path.resolve(__dirname, '../../data/scenes/index.ts');
const scenesCode = fs.readFileSync(scenesPath, 'utf-8');

// Read word timing data
const wordTimingPath = path.resolve(__dirname, '../../data/scenes/word-timing.json');
let wordTiming: Record<string, Record<string, Array<{ word: string; startTime: number; endTime: number }>>> = {};
if (fs.existsSync(wordTimingPath)) {
  wordTiming = JSON.parse(fs.readFileSync(wordTimingPath, 'utf-8'));
}

// Parse scenes from TypeScript source
interface ParsedScene {
  id: string;
  vocabSetId: string;
  movieTitle: string;
  youtubeVideoId: string;
  startTime: number;
  endTime: number;
  difficulty: string;
  genre: string;
  description: string;
  subtitleStatus?: string;
  lines: Array<{
    speaker: string;
    text: string;
    lineStartTime?: number;
    lineEndTime?: number;
  }>;
}

function parseScenes(): ParsedScene[] {
  const scenes: ParsedScene[] = [];

  // Match each scene block
  const sceneRegex = /\{[^{}]*id:\s*'([^']+)'[\s\S]*?(?=\n  \{|\n\];)/g;
  let match;

  while ((match = sceneRegex.exec(scenesCode)) !== null) {
    const block = match[0];
    const id = match[1];

    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}:\\s*'([^']*)'`));
      return m ? m[1] : '';
    };
    const getNum = (key: string) => {
      const m = block.match(new RegExp(`${key}:\\s*(\\d+\\.?\\d*)`));
      return m ? parseFloat(m[1]) : 0;
    };

    // Parse lines
    const lines: ParsedScene['lines'] = [];
    const lineRegex = /\{\s*speaker:\s*'([^']*)',\s*text:\s*'((?:[^'\\]|\\.)*)'/g;
    let lm;
    while ((lm = lineRegex.exec(block)) !== null) {
      const lineStr = block.substring(lm.index);
      const startMatch = lineStr.match(/lineStartTime:\s*([\d.]+)/);
      const endMatch = lineStr.match(/lineEndTime:\s*([\d.]+)/);
      lines.push({
        speaker: lm[1],
        text: lm[2].replace(/\\'/g, "'"),
        lineStartTime: startMatch ? parseFloat(startMatch[1]) : undefined,
        lineEndTime: endMatch ? parseFloat(endMatch[1]) : undefined,
      });
    }

    scenes.push({
      id,
      vocabSetId: get('vocabSetId'),
      movieTitle: get('movieTitle'),
      youtubeVideoId: get('youtubeVideoId'),
      startTime: getNum('startTime'),
      endTime: getNum('endTime'),
      difficulty: get('difficulty'),
      genre: get('genre'),
      description: get('description'),
      subtitleStatus: get('subtitleStatus') || undefined,
      lines,
    });
  }

  return scenes;
}

function seed() {
  const db = getDb();
  const scenes = parseScenes();

  console.log(`Found ${scenes.length} scenes to seed.\n`);

  // Use a transaction for speed
  const seedAll = db.transaction(() => {
    for (const scene of scenes) {
      console.log(`Seeding: ${scene.movieTitle} (${scene.id})`);

      // Create video
      const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(scene.id);
      if (existing) {
        console.log(`  Skipping (already exists)`);
        continue;
      }

      createVideo({
        id: scene.id,
        youtube_video_id: scene.youtubeVideoId,
        title: `${scene.movieTitle} Trailer`,
        movie_title: scene.movieTitle,
        genre: scene.genre || null,
        difficulty: scene.difficulty,
        duration_seconds: scene.endTime - scene.startTime,
      });

      // Create a single clip for the whole scene
      const clipId = createClip(scene.id, scene.startTime, scene.endTime);
      if (scene.subtitleStatus === 'approved') {
        updateClipStatus(clipId, 'approved');
      }

      // Create subtitle lines
      const sceneWordTiming = wordTiming[scene.id] || {};

      for (let i = 0; i < scene.lines.length; i++) {
        const line = scene.lines[i];
        if (!line.lineStartTime || !line.lineEndTime) continue;

        const lineId = createSubtitleLine(
          clipId, i, line.speaker, line.text,
          line.lineStartTime, line.lineEndTime,
        );

        // Add word timestamps if available
        const wts = sceneWordTiming[String(i)];
        if (wts) {
          for (let w = 0; w < wts.length; w++) {
            createWordTimestamp(lineId, w, wts[w].word, wts[w].startTime, wts[w].endTime);
          }
        }
      }

      console.log(`  ✓ ${scene.lines.length} lines, clip ${clipId}`);
    }
  });

  seedAll();

  const stats = db.prepare('SELECT COUNT(*) as n FROM videos').get() as any;
  const clipStats = db.prepare('SELECT COUNT(*) as n FROM clips').get() as any;
  const lineStats = db.prepare('SELECT COUNT(*) as n FROM subtitle_lines').get() as any;
  console.log(`\nDone! ${stats.n} videos, ${clipStats.n} clips, ${lineStats.n} subtitle lines.`);
}

seed();
