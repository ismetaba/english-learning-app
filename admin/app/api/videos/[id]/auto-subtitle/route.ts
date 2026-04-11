import { NextRequest, NextResponse } from 'next/server';
import { getVideo, createClip, createSubtitleLine, createWordTimestamp, deleteAllLinesForClip, deleteClip, getClipsForVideo } from '@/lib/db';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.join(process.cwd(), '..');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'whisperx');
const VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');
const WHISPERX_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'whisperx_transcribe.py');

// Ensure ffmpeg/ffprobe are in PATH (Homebrew)
const ENV_WITH_PATH = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
};

function findYtDlp(): string {
  const candidates = [
    path.join(process.env.HOME || '', 'Library', 'Python', '3.14', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.13', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.12', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.11', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.10', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.9', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp'),
    '/opt/homebrew/bin/yt-dlp',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'yt-dlp';
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

  const existingClips = getClipsForVideo(id);
  for (const clip of existingClips) {
    deleteAllLinesForClip(clip.id);
    deleteClip(clip.id);
  }
  return NextResponse.json({ message: `Cleared ${existingClips.length} clips` });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const wavPath = path.join(CACHE_DIR, `${video.youtube_video_id}.wav`);
  const jsonPath = path.join(CACHE_DIR, `${video.youtube_video_id}.whisperx.json`);

  try {
    // Step 1: Download audio via yt-dlp (skip if cached)
    const wavAge = fs.existsSync(wavPath) ? (Date.now() - fs.statSync(wavPath).mtimeMs) / 86400000 : 999;
    if (wavAge > 7) {
      const ytDlp = findYtDlp();
      const dlResult = spawnSync(ytDlp, [
        '--js-runtimes', 'node', '--remote-components', 'ejs:github',
        '-x', '--audio-format', 'wav',
        '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
        '-o', wavPath,
        `https://www.youtube.com/watch?v=${video.youtube_video_id}`,
      ], { timeout: 120000, stdio: 'pipe', env: ENV_WITH_PATH });

      if (dlResult.status !== 0) {
        const err = dlResult.stderr?.toString() || 'unknown error';
        return NextResponse.json({ error: `Download failed: ${err.substring(0, 300)}` }, { status: 500 });
      }
      if (!fs.existsSync(wavPath)) {
        return NextResponse.json({ error: 'WAV file not created' }, { status: 500 });
      }
    }

    // Step 2: Run WhisperX (skip if cached JSON newer than WAV)
    const jsonMtime = fs.existsSync(jsonPath) ? fs.statSync(jsonPath).mtimeMs : 0;
    const wavMtime = fs.existsSync(wavPath) ? fs.statSync(wavPath).mtimeMs : 0;
    if (jsonMtime < wavMtime || !fs.existsSync(jsonPath)) {
      const wxResult = spawnSync(VENV_PYTHON, [
        WHISPERX_SCRIPT, wavPath, jsonPath,
        '--model', 'base.en', '--language', 'en',
      ], { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'], env: ENV_WITH_PATH });

      if (wxResult.status !== 0) {
        const err = wxResult.stderr?.toString() || 'unknown error';
        return NextResponse.json({ error: `WhisperX failed: ${err.substring(0, 300)}` }, { status: 500 });
      }
    }

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ error: 'WhisperX output not found' }, { status: 500 });
    }

    // Step 3: Parse WhisperX output and import into DB
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const segments = data.segments || [];

    if (segments.length === 0) {
      return NextResponse.json({ error: 'No segments found in transcription' }, { status: 404 });
    }

    // Remove existing clips for this video
    const existingClips = getClipsForVideo(id);
    for (const clip of existingClips) {
      deleteAllLinesForClip(clip.id);
      deleteClip(clip.id);
    }

    // Create a single clip spanning the entire video
    const totalStart = segments[0].start;
    const totalEnd = segments[segments.length - 1].end;
    const clipId = createClip(id, totalStart, totalEnd);

    // Insert subtitle lines and word timestamps
    let lineCount = 0;
    let wordCount = 0;
    for (const seg of segments) {
      const text = seg.text?.trim();
      if (!text || text.length < 2) continue;

      const lineId = createSubtitleLine(clipId, lineCount, 'Speaker', text, seg.start, seg.end);

      const words = seg.words || [];
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        if (w.word && w.start != null && w.end != null) {
          createWordTimestamp(lineId, wi, w.word, w.start, w.end);
          wordCount++;
        }
      }
      lineCount++;
    }

    return NextResponse.json({
      message: `Imported ${lineCount} subtitle lines with ${wordCount} word timestamps (WhisperX)`,
      clip_id: clipId,
      lines: lineCount,
      words: wordCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to process subtitles' }, { status: 500 });
  }
}
