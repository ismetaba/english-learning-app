// Spanish content pipeline: the audio a scene selection is transcribed from.
//
//   npx tsx --test tests/es-media.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audioWav } from '../scripts/es/lib/media';

const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FFPROBE = path.join(path.dirname(FFMPEG), 'ffprobe');
const hasFfmpeg = fs.existsSync(FFMPEG) && fs.existsSync(FFPROBE);

const seconds = (wav: string) =>
  Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }));

test('a selection window is cut even when the whole video was screened first', { skip: !hasFfmpeg }, () => {
  // check-candidates leaves the whole video's audio.wav behind; the build
  // then asks for the first 4 s only (selection.json maxSec).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-media-'));
  execFileSync(FFMPEG, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '10', path.join(dir, 'raw.wav')]);
  const whole = audioWav('none', dir);
  assert.ok(Math.abs(seconds(whole) - 10) < 0.1);
  const window = audioWav('none', dir, 0, 4);
  assert.ok(Math.abs(seconds(window) - 4) < 0.1, `window is ${seconds(window)} s`);
  assert.ok(Math.abs(seconds(whole) - 10) < 0.1, 'the whole-video audio is left as it was');
  fs.rmSync(dir, { recursive: true });
});
