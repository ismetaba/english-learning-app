// WhisperX segments → subtitle lines → scenes. Pure functions (no I/O),
// covered by tests/es-lines.test.ts.
//
// A line is one sentence the learner reads (and repeats) at a time; its
// text is exactly its words joined by spaces, because structure tags
// index words by position. A scene is what one video row in the app
// plays: the set player shows one short scene per video (≤150 s, see
// PrimaryClip in the iOS app), so long sources are cut into several.
import type { WhisperSegment, WhisperWord } from './media';

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

export function toLines(segments: WhisperSegment[]): Line[] {
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

  return runs
    .flatMap(splitLong)
    .map(makeLine)
    .filter(l => /\p{L}/u.test(l.text) && !HALLUCINATIONS.test(l.text));
}

const SCENE_MIN = 60;
const SCENE_MAX = 150;
const SCENE_TARGET = 90;

/** Groups lines into scenes of SCENE_MIN-SCENE_MAX seconds, cutting where
 *  the dialogue pauses longest (ties go to the cut nearest SCENE_TARGET).
 *  When the rest of the video fits in one scene it stays one scene, so no
 *  stub is left at the end. */
export function toScenes(lines: Line[]): Line[][] {
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
