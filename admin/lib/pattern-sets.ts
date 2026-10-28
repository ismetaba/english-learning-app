// Pattern-first sets for the Spanish track: the learner learns a pattern
// on Kalıplar, then watches the scenes that use it. One set per pattern of
// the path; the app opens a pattern's set once the pattern is done.
import type Database from 'better-sqlite3';
import { getDb, prepareStarterWords, VIDEO_CARD_COLUMNS, type PocStarterWord, type PocVideo, type VideoSet } from '@/lib/db';
import type { Lang } from '@/lib/lang';
import { PATTERN_FILTERS, SPANISH_PATTERN_PATH } from '@/lib/pattern-filters';

/** Most scenes a pattern's set shows (él/ella es/está is in ~70). */
const MAX_SCENES = 20;
/** Most words a pattern adds to the learner's words, and how many its
 *  scenes' frequent words fill it up to when its own lines bring fewer. */
const MAX_WORDS = 8;
const MIN_WORDS = 4;
/** A pattern's own verb is its word, though earlier patterns' lines use it
 *  too ("Estás loco, tienes que…" is a line of "Tú estás"). */
const OWN_WORD: Record<string, string> = {
  'es-quiero': 'a2-es-querer', 'es-tengo': 'a2-es-tener', 'es-puedo': 'a2-es-poder',
  'es-voy-a': 'a2-es-ir', 'es-se': 'a2-es-saber',
};

export interface PatternSetVideo extends PocVideo {
  /** Lines of the scene that use the set's pattern. */
  target_lines: number;
}

export interface PatternSet extends VideoSet {
  pattern_id: string;
  videos: PatternSetVideo[];
  /** Starter words the pattern adds to the learner's words. */
  words: string[];
}

/** For each pattern of the path, its lines per video. */
function patternLines(db: Database.Database): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>();
  for (const id of SPANISH_PATTERN_PATH) {
    const rows = db
      .prepare(
        `SELECT sl.id, c.video_id FROM subtitle_lines sl
         JOIN clips c ON c.id = sl.clip_id
         JOIN videos v ON v.id = c.video_id
         WHERE v.language = 'es' AND c.status = 'approved' ${PATTERN_FILTERS[id].sqlPredicate}`,
      )
      .all() as { id: number; video_id: string }[];
    const byVideo = new Map<string, number[]>();
    for (const r of rows) byVideo.set(r.video_id, [...(byVideo.get(r.video_id) ?? []), r.id]);
    out.set(id, byVideo);
  }
  return out;
}

/** The pattern sets of the learning language: Spanish only. A set holds
 *  the scenes with the most lines of its pattern; among equals, those that
 *  also repeat the patterns before it on the path, then the slowest. Its
 *  words: the starters its target lines use that no earlier pattern's
 *  target lines did (a word belongs to the first pattern it shows up in,
 *  a pattern's own verb to that pattern),
 *  filled up from its scenes' frequent words when that's under MIN_WORDS. */
export function getPatternSets(lang: Lang): PatternSet[] {
  if (lang !== 'es') return [];
  const db = getDb();
  const lines = patternLines(db);
  const card = db.prepare(`SELECT ${VIDEO_CARD_COLUMNS} FROM videos v WHERE v.id = ?`);
  const startersOf = prepareStarterWords(db);
  const lineStarters = db.prepare(
    `SELECT starter_word_id AS id FROM word_timestamps WHERE line_id = ? AND starter_word_id LIKE 'a2-es-%'`,
  );

  const chosen = SPANISH_PATTERN_PATH.map((id, k) => {
    const earlier = SPANISH_PATTERN_PATH.slice(0, k);
    const review = (video: string) => earlier.reduce((n, e) => n + (lines.get(e)!.get(video)?.length ?? 0), 0);
    const videos = [...lines.get(id)!.entries()]
      .map(([video, ids]) => ({ ...(card.get(video) as Omit<PocVideo, 'starter_words'>), target: ids }))
      .sort((a, b) =>
        b.target.length - a.target.length || review(b.id) - review(a.id) || (a.wpm ?? 999) - (b.wpm ?? 999))
      .slice(0, MAX_SCENES);
    return { id, videos };
  });

  // A word belongs to the first pattern whose target lines use it.
  const owner = new Map<string, string>(Object.entries(OWN_WORD).map(([p, w]) => [w, p]));
  const ownFreq = new Map<string, Map<string, number>>();
  for (const { id, videos } of chosen) {
    const freq = new Map<string, number>();
    for (const v of videos) {
      for (const line of v.target) {
        for (const { id: w } of lineStarters.all(line) as { id: string }[]) {
          if (!owner.has(w)) owner.set(w, id);
          if (owner.get(w) === id) freq.set(w, (freq.get(w) ?? 0) + 1);
        }
      }
    }
    ownFreq.set(id, freq);
  }

  const granted = new Set<string>();
  return chosen
    .filter(({ videos }) => videos.length > 0)
    .map(({ id, videos }, k) => {
      const byFreq = (m: Map<string, number>) =>
        [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w]) => w);
      const words = byFreq(ownFreq.get(id)!).slice(0, MAX_WORDS);
      if (words.length < MIN_WORDS) {
        const sceneFreq = new Map<string, number>();
        for (const v of videos) {
          for (const w of startersOf.all(v.id) as PocStarterWord[]) {
            if (w.id.startsWith('a2-es-') && !owner.has(w.id) && !granted.has(w.id)) {
              sceneFreq.set(w.id, (sceneFreq.get(w.id) ?? 0) + w.occurrences);
            }
          }
        }
        words.push(...byFreq(sceneFreq).slice(0, MIN_WORDS - words.length));
      }
      words.forEach(w => granted.add(w));
      const label = PATTERN_FILTERS[id].label;
      return {
        id: `pattern-${id}`,
        title: label,
        title_tr: label,
        description: null,
        description_tr: `Hedef kalıp: ${label}`,
        difficulty: null,
        sort_order: k + 1,
        pattern_id: id,
        words,
        videos: videos.map(({ target, ...v }) => ({
          ...v,
          target_lines: target.length,
          starter_words: startersOf.all(v.id) as PocStarterWord[],
        })),
      };
    });
}
