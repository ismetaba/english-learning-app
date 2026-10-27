// WhisperX segments → subtitle lines → scenes. Pure functions (no I/O),
// covered by tests/es-lines.test.ts.
//
// A line is one sentence the learner reads (and repeats) at a time; its
// text is exactly its words joined by spaces, because structure tags
// index words by position. A scene is what one video row in the app
// plays: the set player shows one short scene per video (≤150 s, see
// PrimaryClip in the iOS app), so long sources are cut into several.
//
// Timing (tests/es-timing.test.ts): WhisperX decides the text and where
// lines break, but its word times drift: a line's edge word swallows the
// pause next to it, and around music whole lines land seconds away from
// their audio. YouTube's own auto captions are timed against the very
// video the app embeds, so when there are any their word onsets time the
// words.
import type { Json3, WhisperSegment, WhisperWord } from './media';

export interface Word {
  word: string;
  start: number;
  end: number;
  score: number;
}
export interface Line {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

/** Longest line before it is cut (at a comma if there is one). */
const MAX_WORDS = 14;
/** A silence this long between two words ends the line. */
const PAUSE_SEC = 1.5;
const SENTENCE_END = /[.?!…]["'»)\]]*$/;
/** Whisper's training-data residue: credits and outros it "hears" in silence. */
const HALLUCINATIONS = /amara\.org|subt[ií]tulos (realizados|por)|suscr[ií]bete/i;

/** How far from its audio WhisperX may put a line (around music in the
 *  Frozen clip it was 19 s off). Captions farther away are not paired. */
const MAX_DRIFT_SEC = 30;
/** A word paired on its own this much farther off than the pairs next to
 *  it is a coincidence, a common word said elsewhere ("¡Oh!" at the end of
 *  a 300 s window paired with an "oh" at 310 s), not drift. */
const MAX_JUMP_SEC = 5;
/** Below this share of words paired, the captions are of something else
 *  and WhisperX's times stay. */
const MIN_PAIRED = 0.3;
/** A word runs on to the next one across a gap this short. */
const JOIN_GAP_SEC = 0.3;
/** Shortest a word lasts when a pause follows it. */
const MIN_WORD_SEC = 0.1;

/** Lowercase, without the punctuation around it (¿¡ included). */
const normWord = (w: string) => w.toLocaleLowerCase('es').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
/** Longest a word plausibly lasts, generous for slow or drawn-out speech:
 *  a longer WhisperX word has swallowed a pause. */
const maxWordSec = (w: string) => Math.max(0.8, 0.12 * normWord(w).length);
/** The length such a word is cut back to. */
const typicalWordSec = (w: string) => Math.max(0.3, 0.1 * normWord(w).length);

export interface LineOptions {
  /** YouTube's auto captions for the video (media.ts autoCaptions). */
  captions?: Json3 | null;
  /** Where the transcribed audio starts in the video (the WAV window's
   *  startSec). WhisperX times are relative to the WAV, caption times are
   *  video time; lines come back in video time. */
  offset?: number;
}

/** Gives untimed words (digits, symbols the aligner skips) an even share
 *  of the gap between the timed words around them. */
function interpolate(words: (WhisperWord & { segStart: number; segEnd: number })[]): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length; ) {
    if (words[i].start != null && words[i].end != null) {
      out.push({ word: words[i].word, start: words[i].start!, end: words[i].end!, score: words[i].score });
      i++;
      continue;
    }
    let j = i;
    while (j < words.length && (words[j].start == null || words[j].end == null)) j++;
    const from = out.length ? out[out.length - 1].end : words[i].segStart;
    const to = j < words.length ? words[j].start! : words[j - 1].segEnd;
    const step = Math.max(0, to - from) / (j - i);
    for (let k = i; k < j; k++) {
      const s = from + step * (k - i);
      out.push({ word: words[k].word, start: +s.toFixed(3), end: +(s + step).toFixed(3), score: 0 });
    }
    i = j;
  }
  return out;
}

function makeLine(words: Word[]): Line {
  return {
    text: words.map(w => w.word).join(' '),
    start: words[0].start,
    end: words[words.length - 1].end,
    words,
  };
}

/** Cuts a too-long run at its last comma within MAX_WORDS (or at MAX_WORDS). */
function splitLong(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let rest = words;
  while (rest.length > MAX_WORDS) {
    let cut = -1;
    for (let k = MAX_WORDS - 1; k >= 3; k--) {
      if (/,$/.test(rest[k].word)) { cut = k; break; }
    }
    const at = cut >= 0 ? cut + 1 : MAX_WORDS;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest.length) out.push(rest);
  return out;
}

/** WhisperX stretches a line's edge word over the silence beside it: the
 *  first word back over the pause before it ("Ahora" 6.4-8.0 s, heard at
 *  7.8 s), the last on into the pause after it ("servirá." 63.1-65.5 s,
 *  heard at 63.0 s). Such a word is cut back to a typical length on that
 *  side. It keeps its start instead when the stretch carries on into the
 *  next word: then WhisperX lost the words after it, not the pause before
 *  ("La" 131.2-134.3 s, "escondí" 134.5-136.6 s; heard at 131.1, 131.2).
 *  A one-word line keeps its start too: of the eight stretched ones in the
 *  test fixtures, six were heard where they start ("¿Olaf?" 14.7-20.2 s,
 *  heard at 14.8 s) and two where they end ("¡Ay!" 3.0-5.0 s, at 4.8). */
function trimEdges(words: Word[]): Word[] {
  const out = words.map(w => ({ ...w }));
  const stretched = (w: Word) => w.end - w.start > maxWordSec(w.word);
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && stretched(first)) {
    if (stretched(out[1])) first.end = +(first.start + typicalWordSec(first.word)).toFixed(3);
    else first.start = +(first.end - typicalWordSec(first.word)).toFixed(3);
  }
  if (stretched(last)) last.end = +(last.start + typicalWordSec(last.word)).toFixed(3);
  return out;
}

interface CaptionWord {
  w: string;
  t: number;
}

/** The captions' words (normalized) with their onsets in WAV time. Sound
 *  tags ("[música]") and words before the window are left out. */
function captionWords(json3: Json3, offset: number): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const e of json3.events ?? []) {
    for (const s of e.segs ?? []) {
      const t = ((e.tStartMs ?? 0) + (s.tOffsetMs ?? 0)) / 1000 - offset;
      for (const tok of (s.utf8 ?? '').split(/\s+/)) {
        const w = normWord(tok);
        if (w && t >= 0 && !/^\[.*\]$/.test(tok)) out.push({ w, t });
      }
    }
  }
  return out;
}

/** Each word's caption word (index into caps), or -1: the longest common
 *  subsequence of the two normalized word streams, pairing only words
 *  within MAX_DRIFT_SEC of each other. A word paired on its own (neither
 *  neighbour paired with the caption word next to its own) that is more
 *  than MAX_JUMP_SEC farther off than the pairs around it is unpaired. */
function align(words: Word[], caps: CaptionWord[]): number[] {
  const ws = words.map(w => normWord(w.word));
  const n = ws.length;
  const m = caps.length;
  const same = (i: number, j: number) =>
    ws[i] !== '' && ws[i] === caps[j].w && Math.abs(caps[j].t - words[i].start) <= MAX_DRIFT_SEC;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = same(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pair = new Array<number>(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (same(i, j)) pair[i++] = j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  const paired = pair.flatMap((j, i) => (j >= 0 ? [i] : []));
  const off = (i: number) => caps[pair[i]].t - words[i].start;
  const lone = paired.filter((i, k) => {
    const prev = paired[k - 1];
    const next = paired[k + 1];
    if ((prev === i - 1 && pair[prev] === pair[i] - 1) || (next === i + 1 && pair[next] === pair[i] + 1)) return false;
    const jumps = [prev, next].filter(x => x !== undefined).map(x => Math.abs(off(x) - off(i)));
    return jumps.length > 0 && Math.min(...jumps) > MAX_JUMP_SEC;
  });
  for (const i of lone) pair[i] = -1;
  return pair;
}

/** Words timed by the captions: a paired word starts at its caption
 *  word's onset; the words between two paired ones keep their place
 *  between them (WhisperX's times mapped onto that stretch), and words
 *  before the first or after the last pair move with it. A word then lasts
 *  until the next one starts, or as long as WhisperX made it (at most
 *  maxWordSec) when a pause follows. */
function retime(words: Word[], caps: CaptionWord[]): Word[] {
  const pair = align(words, caps);
  const paired = pair.flatMap((j, i) => (j >= 0 ? [i] : []));
  if (paired.length < words.length * MIN_PAIRED) return words;

  const start = words.map((w, i) => (pair[i] >= 0 ? caps[pair[i]].t : NaN));
  for (let k = 0; k <= paired.length; k++) {
    const a = paired[k - 1];
    const b = paired[k];
    for (let i = a === undefined ? 0 : a + 1; i < (b === undefined ? words.length : b); i++) {
      if (a === undefined) start[i] = Math.max(0, words[i].start + start[b] - words[b].start);
      else if (b === undefined) start[i] = words[i].start + start[a] - words[a].start;
      else {
        const span = words[b].start - words[a].start;
        let f = span > 0 ? (words[i].start - words[a].start) / span : NaN;
        if (!(f > 0 && f < 1)) f = (i - a) / (b - a);
        start[i] = start[a] + f * (start[b] - start[a]);
      }
    }
  }

  return words.map((w, i) => {
    const next = i + 1 < words.length ? start[i + 1] : Infinity;
    const own = Math.min(maxWordSec(w.word), Math.max(MIN_WORD_SEC, w.end - w.start));
    const runsOn = next - (start[i] + own) <= JOIN_GAP_SEC;
    const end = Math.min(start[i] + maxWordSec(w.word), runsOn ? next : start[i] + own);
    return { ...w, start: +start[i].toFixed(3), end: +end.toFixed(3) };
  });
}

export function toLines(segments: WhisperSegment[], opts: LineOptions = {}): Line[] {
  const offset = opts.offset ?? 0;
  const flat = segments.flatMap((seg, si) =>
    seg.words.filter(w => w.word.trim()).map(w => ({ ...w, segStart: seg.start, segEnd: seg.end, si })),
  );
  const timed = interpolate(flat);

  const runs: Word[][] = [];
  let cur: Word[] = [];
  timed.forEach((w, i) => {
    cur.push(w);
    const next = timed[i + 1];
    const ends =
      !next ||
      SENTENCE_END.test(w.word) ||
      flat[i + 1].si !== flat[i].si ||
      next.start - w.end > PAUSE_SEC;
    if (ends) {
      runs.push(cur);
      cur = [];
    }
  });

  let groups = runs
    .flatMap(splitLong)
    .filter(ws => {
      const text = ws.map(w => w.word).join(' ');
      return /\p{L}/u.test(text) && !HALLUCINATIONS.test(text);
    })
    .map(trimEdges);
  if (opts.captions) {
    // Kept words only, so a hallucinated line cannot pair with real speech.
    const words = retime(groups.flat(), captionWords(opts.captions, offset));
    let k = 0;
    groups = groups.map(ws => words.slice(k, (k += ws.length)));
  }
  const toVideo = (w: Word): Word =>
    offset ? { ...w, start: +(w.start + offset).toFixed(3), end: +(w.end + offset).toFixed(3) } : w;
  return groups.map(ws => makeLine(ws.map(toVideo)));
}

const SCENE_MIN = 60;
const SCENE_MAX = 150;
const SCENE_TARGET = 90;
/** A pause this long is not part of a scene: nobody learns from a minute
 *  of silent action, so it ends one scene and the next starts after it. */
const MAX_SILENCE_SEC = 40;
/** A line or two this far from the rest of a scene is a stray (a lone
 *  "Gracias." before the action), not where the scene starts or ends. */
const STRAY_GAP_SEC = 15;
const STRAY_MAX_LINES = 2;

/** Groups lines into scenes of SCENE_MIN-SCENE_MAX seconds, cutting where
 *  the dialogue pauses longest (ties go to the cut nearest SCENE_TARGET).
 *  When the rest of the video fits in one scene it stays one scene, so no
 *  stub is left at the end. A pause over MAX_SILENCE_SEC always ends a
 *  scene, and stray lines at a scene's edges (or alone between two
 *  silences) are dropped. */
export function toScenes(lines: Line[]): Line[][] {
  const runs: Line[][] = [];
  for (const l of lines) {
    const run = runs[runs.length - 1];
    if (run && l.start - run[run.length - 1].end <= MAX_SILENCE_SEC) run.push(l);
    else runs.push([l]);
  }
  return runs.flatMap(splitRun).map(dropStrays).filter(s => s.length > STRAY_MAX_LINES);
}

function splitRun(lines: Line[]): Line[][] {
  const scenes: Line[][] = [];
  let s = 0;
  while (s < lines.length) {
    const startAt = lines[s].start;
    if (lines[lines.length - 1].end - startAt <= SCENE_MAX) {
      scenes.push(lines.slice(s));
      break;
    }
    let best = -1;
    let bestScore = -Infinity;
    let lastFitting = s;
    for (let j = s; j < lines.length - 1; j++) {
      const dur = lines[j].end - startAt;
      if (dur > SCENE_MAX) break;
      lastFitting = j;
      if (dur < SCENE_MIN) continue;
      const gap = lines[j + 1].start - lines[j].end;
      const score = Math.min(gap, 3) * 10 - Math.abs(dur - SCENE_TARGET) / 10;
      if (score > bestScore) { bestScore = score; best = j; }
    }
    const cut = best >= 0 ? best : lastFitting;
    scenes.push(lines.slice(s, cut + 1));
    s = cut + 1;
  }
  return scenes;
}

function dropStrays(scene: Line[]): Line[] {
  let a = 0;
  let b = scene.length;
  const gapAfter = (i: number) => scene[i + 1].start - scene[i].end;
  for (let k = 0; k < STRAY_MAX_LINES && a + k < b - 1; k++) {
    if (gapAfter(a + k) > STRAY_GAP_SEC) { a += k + 1; break; }
  }
  for (let k = 0; k < STRAY_MAX_LINES && b - 2 - k >= a; k++) {
    if (gapAfter(b - 2 - k) > STRAY_GAP_SEC) { b -= k + 1; break; }
  }
  return scene.slice(a, b);
}

/** The set player treats a scene as short only with this much dialogue
 *  (PrimaryClip.shortSceneMinLines in the iOS app). */
export const MIN_SCENE_LINES = 8;

/** Shorter than this, a scene is over before it starts. */
export const MIN_SCENE_SEC = 30;

/** Scenes worth a place in a set: one that is mostly silent action
 *  (fewer than MIN_SCENE_LINES lines) or a fragment (under MIN_SCENE_SEC)
 *  is left out. */
export function playableScenes(scenes: Line[][]): Line[][] {
  return scenes.filter(s => s.length >= MIN_SCENE_LINES && s[s.length - 1].end - s[0].start >= MIN_SCENE_SEC);
}
