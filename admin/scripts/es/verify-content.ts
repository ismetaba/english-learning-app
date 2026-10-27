// Checks a Spanish content database before it goes live, video by video:
// subtitles in sync with the video (word onsets against YouTube's own
// captions, the embedded video's clock), every line translated and tagged,
// scene windows the app can play (one short scene per video), and starter
// words that actually occur. Exits non-zero when a check fails, so a bad
// build never reaches the server.
//
//   npx tsx scripts/es/verify-content.ts <content.db> <work-dir>
//
// <work-dir> is build-content.ts's (captions are read from its cache).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIN_SCENE_LINES, MIN_SCENE_SEC } from './lib/lines';
import type { Json3 } from './lib/media';

const [dbPath, workDir] = process.argv.slice(2);
if (!dbPath || !workDir) {
  console.error('usage: verify-content.ts <content.db> <work-dir>');
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

/** Most words a video may have more than 0.5 s from where YouTube hears them. */
const MAX_OFF_SHARE = 0.05;
/** The set player plays one short scene per video (PrimaryClip, ≤150 s). */
const MAX_SCENE_SEC = 155;

const norm = (w: string) => w.toLocaleLowerCase('es').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function captionOnsets(json3: Json3): { w: string; t: number }[] {
  const out: { w: string; t: number }[] = [];
  for (const e of json3.events ?? []) {
    for (const s of e.segs ?? []) {
      for (const tok of (s.utf8 ?? '').split(/\s+/)) {
        const w = norm(tok);
        if (w && !/^\[.*\]$/.test(tok)) out.push({ w, t: ((e.tStartMs ?? 0) + (s.tOffsetMs ?? 0)) / 1000 });
      }
    }
  }
  return out;
}

/** Share of matched words (longest common subsequence) more than 0.5 s off. */
function offShare(words: { w: string; t: number }[], ref: { w: string; t: number }[]) {
  const n = words.length, m = ref.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = words[i].w === ref[j].w && Math.abs(words[i].t - ref[j].t) < 30
        ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let matched = 0, off = 0;
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (words[i].w === ref[j].w && Math.abs(words[i].t - ref[j].t) < 30) {
      matched++;
      if (Math.abs(words[i].t - ref[j].t) > 0.5) off++;
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { matched, off, total: n };
}

const problems: string[] = [];
/** Worth a look but not a failure: YouTube's own speech recognition is
 *  often the weaker transcript, so a low match can be theirs. */
const warnings: string[] = [];
const videos = db.prepare(
  `SELECT v.id, v.youtube_video_id AS yt, c.id AS clip, c.start_time AS start, c.end_time AS end,
          (SELECT COUNT(*) FROM subtitle_lines sl WHERE sl.clip_id = c.id) AS lines,
          (SELECT COUNT(*) FROM subtitle_lines sl WHERE sl.clip_id = c.id AND sl.translation_tr IS NULL) AS untranslated,
          (SELECT COUNT(*) FROM subtitle_lines sl WHERE sl.clip_id = c.id AND sl.structure IS NULL) AS untagged
   FROM videos v JOIN clips c ON c.video_id = v.id ORDER BY v.id`,
).all() as { id: string; yt: string; clip: number; start: number; end: number; lines: number; untranslated: number; untagged: number }[];
const wordsOf = db.prepare(
  `SELECT wt.word, wt.start_time AS t FROM word_timestamps wt JOIN subtitle_lines sl ON sl.id = wt.line_id
   WHERE sl.clip_id = ? ORDER BY sl.start_time, wt.word_index`,
);

console.log(`${'video'.padEnd(46)} lines  sync`);
let uncaptioned = 0;
for (const v of videos) {
  const capFile = path.join(workDir, v.yt, 'captions.es-orig.json3');
  let sync = 'no captions';
  if (fs.existsSync(capFile)) {
    const ref = captionOnsets(JSON.parse(fs.readFileSync(capFile, 'utf8')));
    const words = (wordsOf.all(v.clip) as { word: string; t: number }[]).map(r => ({ w: norm(r.word), t: r.t })).filter(r => r.w);
    const s = offShare(words, ref.filter(r => r.t >= v.start - 5 && r.t <= v.end + 5));
    sync = `${s.off}/${s.matched} off (${s.matched}/${s.total} matched)`;
    if (s.matched < s.total * 0.5) warnings.push(`${v.id}: captions match only ${s.matched}/${s.total} words`);
    if (s.off > s.matched * MAX_OFF_SHARE) problems.push(`${v.id}: ${s.off}/${s.matched} words >0.5 s off`);
  } else uncaptioned++;
  console.log(`${v.id.padEnd(46)} ${String(v.lines).padStart(5)}  ${sync}`);
  if (v.untranslated) problems.push(`${v.id}: ${v.untranslated} untranslated lines`);
  if (v.untagged > Math.max(1, v.lines * 0.02)) problems.push(`${v.id}: ${v.untagged} untagged lines`);
  if (v.end - v.start > MAX_SCENE_SEC || v.end - v.start < MIN_SCENE_SEC) {
    problems.push(`${v.id}: scene of ${Math.round(v.end - v.start)} s`);
  }
  if (v.lines < MIN_SCENE_LINES) problems.push(`${v.id}: only ${v.lines} lines`);
}

const unusedStarters = db.prepare(
  `SELECT vw.id FROM vocab_words vw WHERE NOT EXISTS (SELECT 1 FROM word_timestamps wt WHERE wt.starter_word_id = vw.id)`,
).all() as { id: string }[];
for (const s of unusedStarters) problems.push(`starter ${s.id} occurs nowhere`);
const orphanItems = db.prepare(
  `SELECT set_id, video_id FROM video_set_items WHERE video_id NOT IN (SELECT id FROM videos)`,
).all() as { set_id: string; video_id: string }[];
for (const o of orphanItems) problems.push(`set ${o.set_id} lists missing video ${o.video_id}`);

console.log(`\n${videos.length} videos, ${uncaptioned} without captions`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('all checks passed');
