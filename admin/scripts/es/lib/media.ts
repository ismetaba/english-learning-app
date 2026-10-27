// YouTube audio → WhisperX transcript, shared by the Spanish content
// scripts. Every step caches its output under the given work dir, so
// re-running a script only redoes what is missing.
//
// Tools: yt-dlp, ffmpeg (Homebrew's — the ComfyUI build earlier on PATH
// is too old for yt-dlp), and the uv-installed WhisperX Python
// (override with WHISPERX_PYTHON).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const WHISPERX_PYTHON =
  process.env.WHISPERX_PYTHON ?? path.join(os.homedir(), '.local/share/uv/tools/whisperx/bin/python');
export const WHISPER_MODEL = 'large-v3-turbo';

export interface VideoMeta {
  title: string;
  channel: string;
  duration: number;
  playableInEmbed: boolean;
  availability: string | null;
  ageLimit: number;
  description: string;
}

export function fetchMeta(youtubeId: string): VideoMeta {
  const raw = execFileSync(
    'yt-dlp',
    ['-J', '--no-warnings', '--skip-download', `https://www.youtube.com/watch?v=${youtubeId}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const j = JSON.parse(raw);
  return {
    title: j.title,
    channel: j.channel ?? j.uploader ?? '',
    duration: j.duration ?? 0,
    playableInEmbed: j.playable_in_embed !== false,
    availability: j.availability ?? null,
    ageLimit: j.age_limit ?? 0,
    description: j.description ?? '',
  };
}

/** Whether YouTube's public oEmbed answers for the video (the same check
 *  scripts/validate-videos.ts uses for the English library). */
export async function oembedOk(youtubeId: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${youtubeId}`,
  )}`;
  const res = await fetch(url);
  return res.ok;
}

/** 16 kHz mono WAV of [startSec, startSec + maxSec) of the video's audio. */
export function audioWav(youtubeId: string, dir: string, startSec = 0, maxSec?: number): string {
  fs.mkdirSync(dir, { recursive: true });
  // One file per window: screening leaves the whole video's audio behind,
  // and a selection's window must not be served that.
  const window = startSec || maxSec ? `-${startSec}-${maxSec ?? 'end'}` : '';
  const wav = path.join(dir, `audio${window}.wav`);
  if (fs.existsSync(wav)) return wav;
  let raw = fs.readdirSync(dir).find(f => f.startsWith('raw.'));
  if (!raw) {
    execFileSync(
      'yt-dlp',
      ['-q', '--no-warnings', '--ffmpeg-location', FFMPEG, '-f', 'bestaudio',
        '-o', path.join(dir, 'raw.%(ext)s'), `https://www.youtube.com/watch?v=${youtubeId}`],
      { stdio: 'inherit' },
    );
    raw = fs.readdirSync(dir).find(f => f.startsWith('raw.'));
    if (!raw) throw new Error(`${youtubeId}: yt-dlp produced no audio`);
  }
  const cut = ['-ss', String(startSec), ...(maxSec ? ['-t', String(maxSec)] : [])];
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...cut, '-i', path.join(dir, raw),
    '-ar', '16000', '-ac', '1', wav]);
  return wav;
}

export interface WhisperWord {
  word: string;
  start: number | null;
  end: number | null;
  score: number;
}
export interface WhisperSegment {
  text: string;
  start: number;
  end: number;
  words: WhisperWord[];
}

/** YouTube's timed text as yt-dlp writes it for --sub-format json3. In the
 *  auto captions each seg is one word, heard at tStartMs + tOffsetMs. */
export interface Json3 {
  events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[];
}

/** Seconds to wait before each retry when YouTube answers a caption
 *  request with HTTP 429 (it does after a burst of them). */
const CAPTION_RETRY_SEC = [20, 60];

/** YouTube's own Spanish auto captions (es-orig, the speech recognizer's
 *  track, with word onsets), or null when the video has none or YouTube
 *  keeps refusing. Times are video time. Cached next to the audio; a
 *  video without them is remembered too, a refusal is not. */
export function autoCaptions(youtubeId: string, dir: string): Json3 | null {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'captions.es-orig.json3');
  const none = path.join(dir, 'captions.none');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (fs.existsSync(none)) return null;
  for (let attempt = 0; ; attempt++) {
    try {
      execFileSync(
        'yt-dlp',
        ['-q', '--no-warnings', '--skip-download', '--write-auto-subs', '--sub-langs', 'es-orig',
          '--sub-format', 'json3', '-o', path.join(dir, 'captions.%(ext)s'),
          `https://www.youtube.com/watch?v=${youtubeId}`],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } catch (e) {
      const stderr = String((e as { stderr?: Buffer }).stderr ?? e);
      if (!/429/.test(stderr) || attempt >= CAPTION_RETRY_SEC.length) {
        console.warn(`${youtubeId}: no captions (${stderr.trim().split('\n').pop()})`);
        return null;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, CAPTION_RETRY_SEC[attempt] * 1000);
      continue;
    }
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(none, '');
    return null;
  }
}

/** WhisperX segments with aligned words. Times are relative to the WAV,
 *  so callers add the window's startSec to get video time. */
export function transcribe(wav: string, threads = 8): WhisperSegment[] {
  // Named after the audio's window, as audioWav names the audio.
  const window = path.basename(wav, '.wav').replace(/^audio/, '');
  const out = path.join(path.dirname(wav), `whisper-${WHISPER_MODEL}${window}.json`);
  if (!fs.existsSync(out)) {
    execFileSync(
      WHISPERX_PYTHON,
      [path.join(REPO_ROOT, 'scripts/whisperx_transcribe.py'), wav, out,
        '--model', WHISPER_MODEL, '--language', 'es', '--keep-untimed', '--threads', String(threads)],
      { stdio: ['ignore', 'inherit', 'ignore'] },
    );
  }
  return JSON.parse(fs.readFileSync(out, 'utf8')).segments;
}
