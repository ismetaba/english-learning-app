import type Database from 'better-sqlite3';
import type { Lang } from './lang';

/** One per-word row as the karaoke routes (clips, vocab-feed, pattern
 *  scenes, starter contexts) select it from `word_timestamps`. */
export interface KaraokeWordRow {
  word: string;
  start_time: number;
  end_time: number;
  word_index: number;
  starter_word_id: string | null;
  starter_tr: string | null;
  word_tr: string | null;
}

/** Lookup key for a Spanish word's Turkish gloss: Unicode lowercase with
 *  wrapping punctuation stripped, accents and ñ kept ("¿Está" → "está",
 *  "niño," → "niño"). English glosses are keyed in SQL with
 *  LOWER(TRIM(...)), which can't do this: SQLite's LOWER only folds ASCII
 *  and the trim set has no ¿ or ¡. */
export function esGlossKey(word: string): string {
  return word.toLocaleLowerCase('es').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Per-word rows for one line, each word glossed from its language's own
 *  table — a request only touches the tables of the language it serves.
 *
 *  English: `word_translations`, keyed by a lowercase +
 *  sentence-punctuation-trimmed surface form (so "I'm" / "I'm." / "i'm"
 *  all collapse to the same row). Independent from the starter set's
 *  curated TR (vw.translation_tr) so the client can show both — the
 *  starter banner uses the curated one, the inline gloss uses this wider
 *  but shallower table. */
export function prepareWordRows(db: Database.Database, lang: Lang): (lineId: number) => KaraokeWordRow[] {
  if (lang === 'es') return prepareEsWordRows(db);
  const words = db.prepare(
    `SELECT wt.word, wt.start_time, wt.end_time, wt.word_index,
            wt.starter_word_id,
            vw.translation_tr AS starter_tr,
            wtr.translation_tr AS word_tr
     FROM word_timestamps wt
     LEFT JOIN vocab_words vw ON vw.id = wt.starter_word_id
     LEFT JOIN word_translations wtr
       ON wtr.word_lower = LOWER(TRIM(wt.word, '.,?!;:"'))
     WHERE wt.line_id = ?
     ORDER BY wt.word_index`,
  );
  return lineId => words.all(lineId) as KaraokeWordRow[];
}

/** Spanish: `word_translations_es`, so a Spanish "son" never picks up the
 *  English "son" (oğul). */
function prepareEsWordRows(db: Database.Database): (lineId: number) => KaraokeWordRow[] {
  const words = db.prepare(
    `SELECT wt.word, wt.start_time, wt.end_time, wt.word_index,
            wt.starter_word_id,
            vw.translation_tr AS starter_tr
     FROM word_timestamps wt
     LEFT JOIN vocab_words vw ON vw.id = wt.starter_word_id
     WHERE wt.line_id = ?
     ORDER BY wt.word_index`,
  );
  const gloss = db.prepare('SELECT translation_tr FROM word_translations_es WHERE word_lower = ?');
  return lineId =>
    (words.all(lineId) as Omit<KaraokeWordRow, 'word_tr'>[]).map(w => ({
      ...w,
      word_tr:
        (gloss.get(esGlossKey(w.word)) as { translation_tr: string | null } | undefined)?.translation_tr ?? null,
    }));
}
