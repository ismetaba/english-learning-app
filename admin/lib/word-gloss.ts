import type Database from 'better-sqlite3';

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

/** Per-word rows for a Spanish line, same shape as the English statement
 *  each route prepares, with `word_tr` read from `word_translations_es`
 *  so a Spanish "son" never picks up the English "son" (oğul). */
export function prepareEsWordRows(db: Database.Database): (lineId: number) => KaraokeWordRow[] {
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
