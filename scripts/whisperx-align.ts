/**
 * WhisperX-based word-level timestamp alignment.
 *
 * Usage:
 *   npx ts-node scripts/whisperx-align.ts [--scene <sceneId>] [--generate]
 *
 * Modes:
 *   (default)   Fuzzy-match curated dialogue to WhisperX output → aligned-timing.json
 *   --generate  Auto-generate dialogue lines from WhisperX → updates index.ts + word-timing.json directly
 *
 * Prerequisites:
 *   brew install ffmpeg
 *   pip3 install --user --break-system-packages whisperx torch torchaudio
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { scenes, DialogueLine } from '../data/scenes';

// ── Types ──────────────────────────────────────────────────────────────

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
  source: 'whisperx' | 'manual';
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

interface WhisperXWord {
  word: string;
  start: number;
  end: number;
  score: number;
}

interface WhisperXSegment {
  text: string;
  start: number;
  end: number;
  words: WhisperXWord[];
}

interface WhisperXResult {
  segments: WhisperXSegment[];
}

interface WordMapEntry {
  word: string;
  startMs: number;
  endMs: number;
}

// ── Text Matching (same logic as align-subtitles.ts) ─────────────────

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

// ── WhisperX Word Map ────────────────────────────────────────────────

function buildWhisperXWordMap(segments: WhisperXSegment[]): WordMapEntry[] {
  const wordMap: WordMapEntry[] = [];
  for (const seg of segments) {
    for (const w of seg.words) {
      const cleaned = w.word.trim();
      if (!cleaned) continue;
      wordMap.push({
        word: cleaned,
        startMs: w.start * 1000,
        endMs: w.end * 1000,
      });
    }
  }
  return wordMap;
}

// ── Line Alignment ──────────────────────────────────────────────────

function alignLine(
  line: DialogueLine,
  wordMap: WordMapEntry[],
  searchFrom: number,
): { startIdx: number; endIdx: number; confidence: number; wordTimestamps: WordTimestamp[] } | null {
  const lineWords = getWords(line.text);
  if (lineWords.length === 0) return null;

  const windowSize = lineWords.length;
  const maxSearch = Math.min(wordMap.length, searchFrom + windowSize * 30);

  let bestScore = 0;
  let bestStart = -1;
  let bestSize = windowSize;

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

  // Build per-word timestamps by mapping original words to matched WhisperX words
  const wordTimestamps: WordTimestamp[] = [];
  let tIdx = 0;
  const originalWords = line.text.split(' ');

  for (const originalWord of originalWords) {
    const normalizedOrig = normalizeText(originalWord);
    let found = false;

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

// ── Prerequisites ───────────────────────────────────────────────────

function findYtDlp(): string {
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
  throw new Error('yt-dlp not found. Install: pip3 install --user --break-system-packages yt-dlp');
}

function findPython(): string {
  // Prefer the project venv (has whisperx installed)
  const venvPython = path.resolve(__dirname, '../.venv/bin/python3');
  if (fs.existsSync(venvPython)) {
    try {
      execSync(`"${venvPython}" -c "import whisperx"`, { stdio: 'pipe' });
      return venvPython;
    } catch {}
  }

  // Try system python versions (3.13, 3.12 are compatible with whisperx)
  const candidates = ['python3', 'python3.13', 'python3.12', 'python3.11'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} -c "import whisperx"`, { stdio: 'pipe' });
      return cmd;
    } catch {}
  }

  throw new Error(
    'WhisperX not found. Set up a venv:\n' +
    '   python3.13 -m venv .venv\n' +
    '   .venv/bin/pip install whisperx torch torchaudio'
  );
}

function checkPrerequisites(): { ytDlp: string; python: string } {
  // Check ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    console.error('❌ ffmpeg not found. Install: brew install ffmpeg');
    process.exit(1);
  }

  const python = findPython();
  const ytDlp = findYtDlp();
  return { ytDlp, python };
}

// ── Audio Extraction ────────────────────────────────────────────────

function extractAudio(
  videoId: string,
  ytDlp: string,
  cacheDir: string,
): string {
  const wavPath = path.join(cacheDir, `${videoId}.wav`);

  // Check cache: skip if file exists and is < 7 days old
  if (fs.existsSync(wavPath)) {
    const age = Date.now() - fs.statSync(wavPath).mtimeMs;
    if (age < 7 * 24 * 60 * 60 * 1000) {
      console.log(`   ♻ Using cached audio: ${videoId}.wav`);
      return wavPath;
    }
  }

  console.log(`   🔊 Extracting audio...`);
  const cmd = [
    `"${ytDlp}"`,
    '--js-runtimes node',
    '--remote-components ejs:github',
    '-x',
    '--audio-format wav',
    '--postprocessor-args "ffmpeg:-ar 16000 -ac 1"',
    '-o', `"${wavPath}"`,
    `"https://www.youtube.com/watch?v=${videoId}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`Audio extraction failed: ${stderr.split('\n').filter(Boolean).pop()}`);
  }

  if (!fs.existsSync(wavPath)) {
    throw new Error(`Audio file not produced for ${videoId}`);
  }

  return wavPath;
}

// ── WhisperX Transcription ──────────────────────────────────────────

function runWhisperX(
  wavPath: string,
  videoId: string,
  python: string,
  cacheDir: string,
): WhisperXResult {
  const jsonPath = path.join(cacheDir, `${videoId}.whisperx.json`);

  // Check cache: skip if JSON is newer than WAV
  if (fs.existsSync(jsonPath) && fs.existsSync(wavPath)) {
    const jsonTime = fs.statSync(jsonPath).mtimeMs;
    const wavTime = fs.statSync(wavPath).mtimeMs;
    if (jsonTime > wavTime) {
      console.log(`   ♻ Using cached WhisperX output`);
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    }
  }

  console.log(`   🧠 Running WhisperX transcription...`);
  const scriptPath = path.resolve(__dirname, 'whisperx_transcribe.py');
  const cmd = `${python} "${scriptPath}" "${wavPath}" "${jsonPath}"`;

  try {
    const output = execSync(cmd, { stdio: 'pipe', timeout: 300_000 });
    console.log(output.toString().trim().split('\n').map(l => `   ${l}`).join('\n'));
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`WhisperX failed: ${stderr.split('\n').filter(Boolean).pop()}`);
  }

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`WhisperX output not produced for ${videoId}`);
  }

  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

// ── Generate Mode: auto-create lines from WhisperX ──────────────────

function isNonSpeech(text: string): boolean {
  const cleaned = text.trim();
  // Filter [Music], [Applause], etc. and very short noise
  return /^\[.*\]$/.test(cleaned) || cleaned.length < 2;
}

interface GeneratedLine {
  speaker: string;
  text: string;
  lineStartTime: number;
  lineEndTime: number;
  wordTimestamps: WordTimestamp[];
}

function generateLinesFromWhisperX(
  whisperResult: WhisperXResult,
  startTime: number,
  endTime: number,
): GeneratedLine[] {
  const lines: GeneratedLine[] = [];

  for (const seg of whisperResult.segments) {
    // Filter out segments outside scene range
    if (seg.end < startTime || seg.start > endTime) continue;

    // Filter non-speech
    if (isNonSpeech(seg.text)) continue;

    // Filter segments with no aligned words
    if (seg.words.length === 0) continue;

    const wordTimestamps: WordTimestamp[] = seg.words
      .filter(w => w.word.trim())
      .map(w => ({
        word: w.word.trim(),
        startTime: Math.round(w.start * 10) / 10,
        endTime: Math.round(w.end * 10) / 10,
      }));

    if (wordTimestamps.length === 0) continue;

    lines.push({
      speaker: 'Speaker',
      text: seg.text.trim(),
      lineStartTime: Math.round(seg.start * 10) / 10,
      lineEndTime: Math.round(seg.end * 10) / 10,
      wordTimestamps,
    });

    console.log(
      `   ✓ "${seg.text.trim().substring(0, 50)}..." → ${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s (${wordTimestamps.length} words)`,
    );
  }

  return lines;
}

function escapeForTs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function updateSceneSource(
  sceneId: string,
  lines: GeneratedLine[],
): void {
  const scenesPath = path.resolve(__dirname, '../data/scenes/index.ts');
  let source = fs.readFileSync(scenesPath, 'utf-8');

  // Build the new lines array string
  const linesStr = lines.map(l =>
    `      { speaker: '${escapeForTs(l.speaker)}', text: '${escapeForTs(l.text)}', lineStartTime: ${l.lineStartTime}, lineEndTime: ${l.lineEndTime} },`
  ).join('\n');

  // Replace the lines array for this scene using regex
  // Match: id: 'sceneId', ... lines: [ ... ], vocabCoverage
  const scenePattern = new RegExp(
    `(id:\\s*'${sceneId}'[\\s\\S]*?lines:\\s*\\[)([\\s\\S]*?)(\\],\\s*\\n\\s*vocabCoverage)`,
  );

  const match = source.match(scenePattern);
  if (!match) {
    console.error(`   ⚠ Could not find lines array for scene ${sceneId} in source`);
    return;
  }

  source = source.replace(scenePattern, `$1\n${linesStr}\n    $3`);

  // Set subtitleStatus: 'approved'
  const statusPattern = new RegExp(
    `(id:\\s*'${sceneId}'[\\s\\S]*?)subtitleStatus:\\s*'[^']*'`,
  );
  if (statusPattern.test(source)) {
    source = source.replace(statusPattern, `$1subtitleStatus: 'approved'`);
  }

  fs.writeFileSync(scenesPath, source);
}

function updateWordTiming(
  sceneId: string,
  lines: GeneratedLine[],
): void {
  const timingPath = path.resolve(__dirname, '../data/scenes/word-timing.json');
  let allTiming: Record<string, Record<string, WordTimestamp[]>> = {};

  if (fs.existsSync(timingPath)) {
    allTiming = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
  }

  const sceneTiming: Record<string, WordTimestamp[]> = {};
  lines.forEach((line, idx) => {
    sceneTiming[String(idx)] = line.wordTimestamps;
  });

  allTiming[sceneId] = sceneTiming;
  fs.writeFileSync(timingPath, JSON.stringify(allTiming, null, 2));
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  // Parse args
  const args = process.argv.slice(2);
  const sceneFilter = args.indexOf('--scene') >= 0
    ? args[args.indexOf('--scene') + 1]
    : null;
  const generateMode = args.includes('--generate');

  console.log(`🎙  WhisperX ${generateMode ? 'Auto-Generate' : 'Alignment'}\n`);

  // Check prerequisites
  const { ytDlp, python } = checkPrerequisites();
  console.log(`   yt-dlp: ${ytDlp}`);
  console.log(`   python: ${python}\n`);

  // Setup cache directory
  const cacheDir = path.resolve(__dirname, '../.cache/whisperx');
  fs.mkdirSync(cacheDir, { recursive: true });

  // Filter scenes
  const targetScenes = sceneFilter
    ? scenes.filter(s => s.id === sceneFilter)
    : scenes;

  if (targetScenes.length === 0) {
    console.error(`❌ Scene not found: ${sceneFilter}`);
    console.error(`   Available: ${scenes.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`Processing ${targetScenes.length} scene(s)...\n`);

  if (generateMode) {
    // ── Generate mode: create lines directly from WhisperX ──
    let totalLines = 0;

    for (const scene of targetScenes) {
      console.log(`🎬 ${scene.movieTitle} (${scene.id})`);

      try {
        const wavPath = extractAudio(scene.youtubeVideoId, ytDlp, cacheDir);
        const whisperResult = runWhisperX(wavPath, scene.youtubeVideoId, python, cacheDir);

        console.log(`   📝 WhisperX: ${whisperResult.segments.length} segments`);

        const lines = generateLinesFromWhisperX(whisperResult, scene.startTime, scene.endTime);
        console.log(`   ✅ Generated ${lines.length} dialogue lines`);

        // Write to source files
        updateSceneSource(scene.id, lines);
        updateWordTiming(scene.id, lines);
        totalLines += lines.length;

        console.log(`   💾 Updated index.ts + word-timing.json\n`);
      } catch (err: any) {
        console.error(`   ✗ Failed: ${err.message}\n`);
      }
    }

    console.log(`✅ Generated ${totalLines} total lines for ${targetScenes.length} scene(s).`);
    return;
  }

  // ── Align mode (default): match curated lines to WhisperX ──
  const results: AlignedScene[] = [];

  for (const scene of targetScenes) {
    console.log(`🎬 ${scene.movieTitle} (${scene.id})`);

    try {
      const wavPath = extractAudio(scene.youtubeVideoId, ytDlp, cacheDir);
      const whisperResult = runWhisperX(wavPath, scene.youtubeVideoId, python, cacheDir);
      const wordMap = buildWhisperXWordMap(whisperResult.segments);
      console.log(`   📝 WhisperX: ${whisperResult.segments.length} segments, ${wordMap.length} words`);

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
            source: 'whisperx',
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

      console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(0)}%\n`);
    } catch (err: any) {
      console.error(`   ✗ Failed: ${err.message}\n`);
    }
  }

  const outputPath = path.resolve(__dirname, '../data/scenes/aligned-timing.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`💾 Saved alignment results to ${outputPath}`);

  const successCount = results.filter(r => r.avgConfidence > 0.5).length;
  console.log(`\n✅ ${successCount}/${targetScenes.length} scenes aligned successfully.`);
  console.log('\n🔄 Next: npm run subtitles:review -- --auto-approve 0.9');
}

main();
