// Adds newly built sources to a copy of the live Spanish content database,
// for a round whose work dir no longer holds the earlier sources' audio,
// transcripts and model caches (rebuilding them all would re-transcribe
// every source and change live translations). Every live row stays as it
// is; only the speed sets are laid out again.
//
//   1. seed   caches for the new build from the live database, so it asks
//             the model only about what live doesn't already answer:
//             cache-tag.json (line text → structure), cache-gloss.json
//             (glossCacheKey(word) → gloss), cache-lemma.json (each starter
//             form → its starter's lemma)
//
//      npx tsx scripts/es/merge-content.ts seed <live.db> <work-dir>
//
//   then build-content.ts with a selection of the new sources only, into
//   <new.db>, and
//
//   2. merge  <new.db>'s scenes into a copy of <live.db>, ids shifted past
//             live's: their videos, clips, lines and word timings, the
//             glosses of words live hasn't got (live's stay), the new
//             tokens linked to live's starter words (a form live links, or
//             a frequent form live hasn't got whose lemma, from
//             cache-lemma.json, is a starter's: build-content.ts's rule,
//             with live's 100 starters kept), and the speed sets laid out again over all sources:
//             live's in their live order, each new one where its speed
//             fits, cut as build-content.ts cuts them
//
//      npx tsx scripts/es/merge-content.ts merge <live.db> <new.db> <work-dir> <out.db>
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { esGlossKey } from '../../lib/word-gloss';
import { INTERJECTIONS, STOPWORDS, glossCacheKey, type LemmaInfo } from './lib/translate';

/** Same as build-content.ts. */
const SET_SIZE = 22;
const MIN_SET_SIZE = 10;

type Db = Database.Database;

/** A source's speed as build-content.ts measures it (words per minute of
 *  speech), over the lines its scenes kept. */
function sourceWpm(db: Db): Map<string, number> {
  const rows = db.prepare(
    `SELECT v.youtube_video_id AS yt, SUM(sl.end_time - sl.start_time) AS secs,
            SUM((SELECT COUNT(*) FROM word_timestamps wt WHERE wt.line_id = sl.id)) AS words
     FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id JOIN videos v ON v.id = c.video_id
     GROUP BY v.youtube_video_id`,
  ).all() as { yt: string; secs: number; words: number }[];
  return new Map(rows.map(r => [r.yt, r.secs > 0 ? (r.words / r.secs) * 60 : 0]));
}

/** Live sources in their live order with each new one put in before the
 *  first live source faster than it: live's order stands as it is. */
export function orderSources(live: string[], added: string[], wpm: Map<string, number>): string[] {
  const queue = [...added].sort((a, b) => wpm.get(a)! - wpm.get(b)!);
  const out: string[] = [];
  for (const yt of live) {
    while (queue.length && wpm.get(queue[0])! < wpm.get(yt)!) out.push(queue.shift()!);
    out.push(yt);
  }
  return [...out, ...queue];
}

/** Scene ids cut into sets of about SET_SIZE, a source never split, a
 *  small last set joined to the one before (build-content.ts's rule). */
export function cutSets(sources: string[], scenesOf: (yt: string) => string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const yt of sources) {
    current.push(...scenesOf(yt));
    if (current.length >= SET_SIZE) { groups.push(current); current = []; }
  }
  if (current.length) {
    if (current.length < MIN_SET_SIZE && groups.length) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }
  return groups;
}

/** Each surface form live links to a starter, and that starter. */
function liveStarterForms(db: Db): Map<string, string> {
  const forms = new Map<string, string>();
  for (const r of db.prepare(
    'SELECT DISTINCT word, starter_word_id AS id FROM word_timestamps WHERE starter_word_id IS NOT NULL',
  ).all() as { word: string; id: string }[]) {
    const k = esGlossKey(r.word);
    const had = forms.get(k);
    if (had && had !== r.id) throw new Error(`live links "${k}" to both ${had} and ${r.id}`);
    forms.set(k, r.id);
  }
  return forms;
}

function readJson<T>(file: string): Record<string, T> {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function seed(livePath: string, workDir: string) {
  const live = new Database(livePath, { readonly: true });
  fs.mkdirSync(workDir, { recursive: true });
  const write = (name: string, add: Record<string, unknown>) => {
    const file = path.join(workDir, name);
    const out = { ...add, ...readJson(file) };
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`${name}: ${Object.keys(out).length} entries`);
  };

  const tags: Record<string, unknown> = {};
  for (const r of live.prepare('SELECT text, structure FROM subtitle_lines WHERE structure IS NOT NULL').all() as
    { text: string; structure: string }[]) tags[r.text] = JSON.parse(r.structure);
  write('cache-tag.json', tags);

  const glosses: Record<string, string> = {};
  for (const r of live.prepare('SELECT word_lower, translation_tr FROM word_translations_es').all() as
    { word_lower: string; translation_tr: string }[]) glosses[glossCacheKey(r.word_lower)] = r.translation_tr;
  write('cache-gloss.json', glosses);

  const starters = new Map((live.prepare('SELECT id, word, part_of_speech, translation_tr, cefr_level FROM vocab_words')
    .all() as { id: string; word: string; part_of_speech: string; translation_tr: string; cefr_level: string }[])
    .map(s => [s.id, { lemma: s.word, pos: s.part_of_speech, tr: s.translation_tr, cefr: s.cefr_level }]));
  const lemmas: Record<string, LemmaInfo> = {};
  for (const [form, id] of liveStarterForms(live)) lemmas[form] = starters.get(id)!;
  write('cache-lemma.json', lemmas);
  live.close();
}

function merge(livePath: string, newPath: string, workDir: string, outPath: string) {
  fs.rmSync(outPath, { force: true });
  fs.copyFileSync(livePath, outPath);
  const db = new Database(outPath);
  db.pragma('foreign_keys = ON');
  db.exec(`ATTACH DATABASE '${newPath.replace(/'/g, "''")}' AS nw`);

  const clash = db.prepare(
    `SELECT id FROM nw.videos WHERE id IN (SELECT id FROM main.videos)
        OR youtube_video_id IN (SELECT youtube_video_id FROM main.videos)`,
  ).all() as { id: string }[];
  if (clash.length) throw new Error(`already live: ${clash.map(c => c.id).join(', ')}`);

  // Live's order of sources, read off its sets, before they are replaced.
  const liveOrder = [...new Set((db.prepare(
    `SELECT v.youtube_video_id AS yt FROM main.video_set_items i JOIN main.video_sets s ON s.id = i.set_id
     JOIN main.videos v ON v.id = i.video_id ORDER BY s.sort_order, i.sort_order`,
  ).all() as { yt: string }[]).map(r => r.yt))];
  const liveSources = (db.prepare('SELECT COUNT(DISTINCT youtube_video_id) n FROM main.videos').get() as { n: number }).n;
  if (liveOrder.length !== liveSources) throw new Error(`live sets hold ${liveOrder.length} of ${liveSources} sources`);

  const starterForms = liveStarterForms(db);
  // A form live has but doesn't link was ruled out by the lemma answer
  // live was built with ("todo" as a pronoun): that answer stands.
  const liveForms = new Set((db.prepare('SELECT DISTINCT word FROM main.word_timestamps').all() as { word: string }[])
    .map(r => esGlossKey(r.word)));
  const starterByLemma = new Map((db.prepare('SELECT id, word FROM main.vocab_words').all() as { id: string; word: string }[])
    .map(s => [s.word, s.id]));
  const lemmaCache = readJson<LemmaInfo>(path.join(workDir, 'cache-lemma.json'));

  db.transaction(() => {
    const max = (t: string) => (db.prepare(`SELECT COALESCE(MAX(id), 0) n FROM main.${t}`).get() as { n: number }).n;
    const off = { clip: max('clips'), line: max('subtitle_lines'), word: max('word_timestamps') };
    db.prepare(
      `INSERT INTO main.videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language)
       SELECT id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language FROM nw.videos ORDER BY rowid`,
    ).run();
    db.prepare(
      `INSERT INTO main.clips (id, video_id, start_time, end_time, status, wpm, a2_ratio, avg_sentence_len)
       SELECT id + ?, video_id, start_time, end_time, status, wpm, a2_ratio, avg_sentence_len FROM nw.clips`,
    ).run(off.clip);
    db.prepare(
      `INSERT INTO main.subtitle_lines (id, clip_id, line_index, speaker, text, start_time, end_time, translation_tr, structure)
       SELECT id + ?, clip_id + ?, line_index, speaker, text, start_time, end_time, translation_tr, structure
       FROM nw.subtitle_lines`,
    ).run(off.line, off.clip);
    db.prepare(
      `INSERT INTO main.word_timestamps (id, line_id, word_index, word, start_time, end_time)
       SELECT id + ?, line_id + ?, word_index, word, start_time, end_time FROM nw.word_timestamps`,
    ).run(off.word, off.line);
    const glosses = db.prepare(
      `INSERT OR IGNORE INTO main.word_translations_es (word_lower, translation_tr)
       SELECT word_lower, translation_tr FROM nw.word_translations_es`,
    ).run().changes;

    // Starter links for the new tokens.
    const freq = new Map<string, number>();
    for (const r of db.prepare('SELECT word FROM main.word_timestamps').all() as { word: string }[]) {
      const k = esGlossKey(r.word);
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    const starterOf = (k: string): string | undefined => {
      if (INTERJECTIONS.has(k)) return undefined;
      const known = starterForms.get(k);
      if (known || liveForms.has(k)) return known;
      const info = lemmaCache[k];
      if (!info || (freq.get(k) ?? 0) < 2 || k.length <= 2 || STOPWORDS.has(k) || /\d/.test(k)) return undefined;
      if (info.pos === 'other' || !['A1', 'A2'].includes(info.cefr) || STOPWORDS.has(info.lemma)) return undefined;
      return starterByLemma.get(info.lemma);
    };
    const tokens = db.prepare(
      `SELECT wt.id, wt.word, wt.line_id, sl.clip_id FROM main.word_timestamps wt
       JOIN main.subtitle_lines sl ON sl.id = wt.line_id WHERE wt.id > ? ORDER BY wt.id`,
    ).all(off.word) as { id: number; word: string; line_id: number; clip_id: number }[];
    const link = db.prepare('UPDATE main.word_timestamps SET starter_word_id = ? WHERE id = ?');
    const perClip = new Map<string, { clip: number; word: string; line: number; n: number }>();
    const newForms = new Set<string>();
    for (const t of tokens) {
      const k = esGlossKey(t.word);
      const id = starterOf(k);
      if (!id) continue;
      if (!starterForms.has(k)) newForms.add(`${k}→${id}`);
      link.run(id, t.id);
      const key = `${t.clip_id}|${id}`;
      const cv = perClip.get(key) ?? { clip: t.clip_id, word: id, line: t.line_id, n: 0 };
      cv.n++;
      perClip.set(key, cv);
    }
    const insertClipVocab = db.prepare(
      'INSERT INTO main.clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, ?)',
    );
    for (const cv of perClip.values()) insertClipVocab.run(cv.clip, cv.word, cv.line, cv.n);
    console.log(`starters: ${tokens.length} new tokens, ${[...perClip.values()].reduce((n, c) => n + c.n, 0)} linked` +
      `${newForms.size ? `; forms live doesn't link: ${[...newForms].join(', ')}` : ''}`);
    console.log(`glosses: ${glosses} new words`);

    // Speed sets over every source.
    const added = (db.prepare('SELECT DISTINCT youtube_video_id AS yt FROM nw.videos').all() as { yt: string }[]).map(r => r.yt);
    const wpm = sourceWpm(db);
    const scenes = db.prepare('SELECT id FROM main.videos WHERE youtube_video_id = ? ORDER BY rowid');
    const groups = cutSets(orderSources(liveOrder, added, wpm), yt => (scenes.all(yt) as { id: string }[]).map(r => r.id));
    const old = db.prepare('SELECT * FROM main.video_sets ORDER BY sort_order').all() as Record<string, unknown>[];
    db.prepare('DELETE FROM main.video_set_items').run();
    db.prepare('DELETE FROM main.video_sets').run();
    const insertSet = db.prepare(
      `INSERT INTO main.video_sets (id, title, title_tr, description, description_tr, difficulty, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare('INSERT INTO main.video_set_items (set_id, video_id, sort_order) VALUES (?, ?, ?)');
    groups.forEach((ids, g) => {
      const n = g + 1;
      // Set texts as live has them: the first set's, then the others'.
      const like = old[Math.min(g, 1)];
      insertSet.run(`es-set-${n}`, `Spanish ${n}`, `İspanyolca ${n}`, like.description, like.description_tr, like.difficulty, 100 + n);
      ids.forEach((id, i) => insertItem.run(`es-set-${n}`, id, i + 1));
    });
    console.log(`sets: ${groups.map((ids, g) => `İspanyolca ${g + 1} (${ids.length})`).join(', ')}`);
  })();
  db.exec('DETACH DATABASE nw');
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  console.log(`\nDone: ${n('SELECT COUNT(*) n FROM videos')} scene videos from ` +
    `${n('SELECT COUNT(DISTINCT youtube_video_id) n FROM videos')} sources, ${n('SELECT COUNT(*) n FROM subtitle_lines')} lines, ` +
    `${n('SELECT COUNT(*) n FROM video_sets')} sets, ${n('SELECT COUNT(*) n FROM vocab_words')} starters`);
  db.close();
}

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'seed' && args.length === 2) seed(args[0], args[1]);
  else if (cmd === 'merge' && args.length === 4) merge(args[0], args[1], args[2], args[3]);
  else {
    console.error('usage: merge-content.ts seed <live.db> <work-dir>\n' +
      '       merge-content.ts merge <live.db> <new.db> <work-dir> <out.db>');
    process.exit(1);
  }
}
