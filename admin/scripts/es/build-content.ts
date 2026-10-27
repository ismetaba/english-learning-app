// Builds the Spanish content database from the approved video selection:
//
//   1. scenes    WhisperX transcript → lines → scenes; one video row per
//                scene (the app plays one short scene per video), with its
//                approved clip, subtitle lines and word timings (from
//                YouTube's auto captions where the video has them)
//   2. translate every line into Turkish (Gemma via LM Studio, with the
//                lines around it as context)
//   3. tag       sentence structure, verb-group convention (main verb in
//                aux_verb), pro-drop subjects left empty
//   4. glosses   a short Turkish gloss per distinct word (word_translations_es)
//   5. vocab     starter words: the set's frequent A1-A2 content words,
//                linked to every form they appear in
//   6. set       the "İspanyolca Başlangıç" video set, slowest source first
//
//   npx tsx scripts/es/build-content.ts scripts/es/selection.json <work-dir> <out.db>
//
// <work-dir> is check-candidates.ts's: audio and transcripts are reused
// from it, captions and the model answers are cached there (cache-*.json),
// so a rebuild only asks the model about lines it hasn't seen.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { esGlossKey } from '../../lib/word-gloss';
import { JsonCache } from './lib/cache';
import { toLines, toScenes, type Line } from './lib/lines';
import { chat, chatJson } from './lib/lmstudio';
import { audioWav, autoCaptions, transcribe } from './lib/media';

interface Selected {
  youtubeId: string;
  /** Video id stem: rows are es-<slug>[-n]. */
  slug: string;
  /** Film or series, shown as the video's movie title. */
  movieTitle: string;
  title: string;
  genre: string;
  startSec?: number;
  maxSec?: number;
}

const [selectionPath, workDir, outPath] = process.argv.slice(2);
if (!selectionPath || !workDir || !outPath) {
  console.error('usage: build-content.ts <selection.json> <work-dir> <out.db>');
  process.exit(1);
}
const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8')) as Selected[];

fs.rmSync(outPath, { force: true });
const db = new Database(outPath);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ── 1. Scenes ────────────────────────────────────────────────────────

const insertVideo = db.prepare(
  `INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language)
   VALUES (?, ?, ?, ?, ?, 'beginner', ?, 1, 'es')`,
);
const insertClip = db.prepare(
  `INSERT INTO clips (video_id, start_time, end_time, status, wpm, avg_sentence_len)
   VALUES (?, ?, ?, 'approved', ?, ?)`,
);
const insertLine = db.prepare(
  `INSERT INTO subtitle_lines (clip_id, line_index, text, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
);
const insertWord = db.prepare(
  `INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
);
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Words per minute over the time someone is actually speaking. */
function speechWpm(lines: Line[]): number {
  const words = lines.reduce((n, l) => n + l.words.length, 0);
  const secs = lines.reduce((n, l) => n + (l.end - l.start), 0);
  return secs > 0 ? Math.round((words / secs) * 60) : 0;
}

const sourceWpm = new Map<string, number>();
const videoOrder: { id: string; youtubeId: string }[] = [];
db.transaction(() => {
  for (const sel of selection) {
    const offset = sel.startSec ?? 0;
    const dir = path.join(workDir, sel.youtubeId);
    const segments = transcribe(audioWav(sel.youtubeId, dir, offset, sel.maxSec));
    const captions = autoCaptions(sel.youtubeId, dir);
    // WhisperX times start at the audio window, the captions' at the
    // video's 0 s: toLines takes the window's start and returns video time.
    const lines = toLines(segments, { captions, offset });
    const scenes = toScenes(lines);
    sourceWpm.set(sel.youtubeId, speechWpm(lines));
    scenes.forEach((scene, n) => {
      const id = scenes.length > 1 ? `es-${sel.slug}-${n + 1}` : `es-${sel.slug}`;
      const title = scenes.length > 1 ? `${sel.title} (${n + 1}/${scenes.length})` : sel.title;
      const start = Math.max(0, scene[0].start - 0.5);
      const end = scene[scene.length - 1].end + 0.7;
      insertVideo.run(id, sel.youtubeId, title, sel.movieTitle, sel.genre, Math.round(end - start));
      const words = scene.reduce((k, l) => k + l.words.length, 0);
      const clipId = insertClip.run(id, round(start), round(end), speechWpm(scene),
        +(words / scene.length).toFixed(2)).lastInsertRowid;
      scene.forEach((line, li) => {
        const lineId = insertLine.run(clipId, li, line.text, round(line.start), round(line.end)).lastInsertRowid;
        line.words.forEach((w, wi) => insertWord.run(lineId, wi, w.word, round(w.start), round(w.end)));
      });
      videoOrder.push({ id, youtubeId: sel.youtubeId });
    });
    console.log(`scenes  ${sel.slug}: ${lines.length} lines → ${scenes.length} scenes, ${sourceWpm.get(sel.youtubeId)} wpm, ` +
      `${captions ? 'with' : 'no'} captions`);
  }
})();

interface LineRow { id: number; text: string; clip_id: number; video_id: string; movie_title: string }
const allLines = db
  .prepare(
    `SELECT sl.id, sl.text, sl.clip_id, c.video_id, v.movie_title
     FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id JOIN videos v ON v.id = c.video_id
     ORDER BY sl.id`,
  )
  .all() as LineRow[];

// ── 2. Translate ─────────────────────────────────────────────────────

const TRANSLATE_SYS = `You are a professional subtitle translator. Translate the Latin American Spanish dialogue line marked LINE into natural, colloquial Turkish, the way a real Turkish subtitle would read it. The lines before and after are context only: do not translate them. Spanish often drops the subject pronoun, so use the context to choose the right Turkish person and ending. Keep it concise. Output ONLY the Turkish translation of LINE.`;

async function translateAll() {
  const cache = new JsonCache<string>(path.join(workDir, 'cache-translate.json'));
  const update = db.prepare('UPDATE subtitle_lines SET translation_tr = ? WHERE id = ?');
  let asked = 0;
  for (let i = 0; i < allLines.length; i++) {
    const l = allLines[i];
    const sameClip = (k: number) => allLines[k]?.clip_id === l.clip_id ? allLines[k].text : null;
    const before = [sameClip(i - 2), sameClip(i - 1)].filter(Boolean).join(' / ');
    const after = sameClip(i + 1) ?? '';
    const key = `${before}|${l.text}|${after}`;
    let tr = cache.get(key);
    if (tr === undefined) {
      const out = await chat(TRANSLATE_SYS,
        `Source: ${l.movie_title}\nBefore: ${before || '—'}\nLINE: ${l.text}\nAfter: ${after || '—'}`,
        { temperature: 0.2, maxTokens: 200 });
      tr = out?.replace(/^["'«]|["'»]$/g, '').trim() ?? '';
      if (tr) cache.set(key, tr);
      asked++;
    }
    if (tr) update.run(tr, l.id);
    if ((i + 1) % 100 === 0) console.log(`translate ${i + 1}/${allLines.length} (${asked} asked)`);
  }
  cache.save();
}

// ── 3. Tag ───────────────────────────────────────────────────────────

const TAG_SYS = `You are a sentence-structure tagger for a Spanish-learning app.

You receive a Spanish sentence pre-split into an ORDERED list of [index,"word"]
tokens (punctuation stays attached). Put EVERY token index into EXACTLY ONE of
three buckets: subject, aux_verb, rest. Together they cover every index once.

SUBJECT — the subject of the MAIN clause when it is said: a pronoun (yo, tú,
él, ella, usted, nosotros, nosotras, ellos, ellas, ustedes) or a noun phrase
with its determiners ("el perro", "mi papá", "Peppa", "Mamá Cerdita").
Spanish usually drops the subject: then subject is EMPTY ("Estoy cansado").

AUX_VERB — the MAIN clause's verb group: the conjugated verb, plus the
auxiliary and participle/gerund of compound and progressive forms ("he
comido", "estoy comiendo"). A copula (ser/estar) that is the only verb goes
here; so does existential "hay". A lone main verb goes here ("Quiero").

REST — everything else: objects, predicate adjectives and nouns, clitic
pronouns before or after the verb (me, te, se, lo, la, le, nos, les), the
negation "no", infinitive complements ("quiero comer": comer → rest;
"vamos a aprender": a, aprender → rest), prepositional phrases, question
words (qué, dónde, cómo, por qué), subordinate and second coordinated
clauses, interjections, vocatives and discourse markers.

Use ONLY the given indices, each exactly once. A fragment with no verb goes
entirely in rest.`;

const TAG_FEWSHOT = `Examples:
tokens=[[0,"Estoy"],[1,"muy"],[2,"cansado."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2]}
tokens=[[0,"Peppa"],[1,"está"],[2,"jugando"],[3,"en"],[4,"el"],[5,"parque."]] -> {"subject":[0],"aux_verb":[1,2],"rest":[3,4,5]}
tokens=[[0,"Yo"],[1,"no"],[2,"quiero"],[3,"ir."]] -> {"subject":[0],"aux_verb":[2],"rest":[1,3]}
tokens=[[0,"¿Dónde"],[1,"está"],[2,"mi"],[3,"osito?"]] -> {"subject":[2,3],"aux_verb":[1],"rest":[0]}
tokens=[[0,"Me"],[1,"llamo"],[2,"Peppa."]] -> {"subject":[],"aux_verb":[1],"rest":[0,2]}
tokens=[[0,"Mamá"],[1,"Cerdita"],[2,"ha"],[3,"hecho"],[4,"un"],[5,"pastel."]] -> {"subject":[0,1],"aux_verb":[2,3],"rest":[4,5]}
tokens=[[0,"Vamos"],[1,"a"],[2,"aprender"],[3,"sobre"],[4,"el"],[5,"clima."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2,3,4,5]}
tokens=[[0,"Hay"],[1,"mucha"],[2,"nieve."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2]}
tokens=[[0,"¡Hola!"]] -> {"subject":[],"aux_verb":[],"rest":[0]}`;

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'array', items: { type: 'integer' } },
    aux_verb: { type: 'array', items: { type: 'integer' } },
    rest: { type: 'array', items: { type: 'integer' } },
  },
  required: ['subject', 'aux_verb', 'rest'],
  additionalProperties: false,
};
type Structure = { subject: number[]; aux_verb: number[]; rest: number[] };

function validStructure(t: Structure | null, n: number): t is Structure {
  if (!t) return false;
  const all = [...t.subject, ...t.aux_verb, ...t.rest];
  return all.length === n && new Set(all).size === n && all.every(i => Number.isInteger(i) && i >= 0 && i < n);
}

async function tagAll() {
  const cache = new JsonCache<Structure>(path.join(workDir, 'cache-tag.json'));
  const update = db.prepare('UPDATE subtitle_lines SET structure = ? WHERE id = ?');
  let failed = 0;
  for (let i = 0; i < allLines.length; i++) {
    const l = allLines[i];
    const tokens = l.text.split(' ');
    let t: Structure | null = cache.get(l.text) ?? null;
    for (let attempt = 0; !validStructure(t, tokens.length) && attempt < 2; attempt++) {
      const list = tokens.map((w, k) => `[${k},${JSON.stringify(w)}]`).join(',');
      t = await chatJson<Structure>(TAG_SYS, `${TAG_FEWSHOT}\n\nNow tag this sentence.\ntokens=[${list}]`, TAG_SCHEMA, 300);
      if (validStructure(t, tokens.length)) cache.set(l.text, t);
    }
    if (validStructure(t, tokens.length)) update.run(JSON.stringify(t), l.id);
    else failed++;
    if ((i + 1) % 100 === 0) console.log(`tag ${i + 1}/${allLines.length}`);
  }
  cache.save();
  console.log(`tag: ${failed} lines left untagged`);
}

// ── 4. Glosses ───────────────────────────────────────────────────────

/** Hand-written glosses for the most frequent function words, which the
 *  model glosses from whichever sentence it saw first ("si" in "Si
 *  recuerdan…" came back as "-ıp -madığı"). Keys are esGlossKey forms. */
const GLOSS_OVERRIDES: Record<string, string> = {
  el: '(belirli, eril)', la: '(belirli, dişil)', los: '(belirli, çoğul)', las: '(belirli, çoğul)',
  un: 'bir', una: 'bir', unos: 'birkaç', unas: 'birkaç', al: "-e (a + el)", del: "-in (de + el)",
  de: '-in / -den', a: '-e / -a', en: '-de / içinde', con: 'ile', sin: 'olmadan', por: 'için / -den dolayı',
  para: 'için', sobre: 'hakkında / üstünde', desde: '-den beri', hasta: '-e kadar',
  que: 'ki / -en', qué: 'ne', si: 'eğer', sí: 'evet', no: 'hayır / değil', y: 've', o: 'veya',
  pero: 'ama', porque: 'çünkü', cuando: '-dığında', como: 'gibi', cómo: 'nasıl', dónde: 'nerede',
  cuándo: 'ne zaman', quién: 'kim', cuál: 'hangisi', muy: 'çok', más: 'daha', ya: 'artık / zaten',
  también: 'de / da', aquí: 'burada', ahí: 'orada', allí: 'orada', bien: 'iyi', mal: 'kötü',
  yo: 'ben', tú: 'sen', él: 'o (erkek)', ella: 'o (kadın)', usted: 'siz', nosotros: 'biz',
  nosotras: 'biz', ellos: 'onlar', ellas: 'onlar', ustedes: 'sizler',
  me: 'beni / bana', te: 'seni / sana', se: 'kendini / kendine', lo: 'onu', le: 'ona', les: 'onlara',
  nos: 'bizi / bize', mi: 'benim', mis: 'benim', tu: 'senin', tus: 'senin', su: 'onun', sus: 'onun',
  esto: 'bu', eso: 'şu / o', este: 'bu', esta: 'bu', ese: 'şu', esa: 'şu',
  soy: '-im (ser)', eres: '-sin (ser)', es: '-dir (ser)', somos: '-iz (ser)', son: '-dirler (ser)',
  estoy: '-im (estar)', estás: '-sin (estar)', está: '-dir (estar)', estamos: '-iz (estar)',
  están: '-dirler (estar)', hay: 'var',
};

const GLOSS_SYS = `You give Turkish glosses for a Spanish-learning app. Each item is a Spanish word with a sentence it appears in. Answer with the word's meaning IN THAT SENTENCE as the short Turkish gloss a learner sees under the word: 1-3 words. Conjugated verbs get the matching conjugated Turkish form ("quiero" → "istiyorum", "está" → "-dir / bulunuyor"). Articles and prepositions get the closest Turkish word or a short hint in parentheses ("el" → "(belirli)", "de" → "-in, -den"). Names get the name itself. Keep each "word" exactly as given.`;

const GLOSS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, tr: { type: 'string' } },
        required: ['word', 'tr'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Every distinct gloss key with the line it is most at home in. */
function wordContexts(): Map<string, string> {
  const rows = db.prepare('SELECT wt.word, sl.text FROM word_timestamps wt JOIN subtitle_lines sl ON sl.id = wt.line_id').all() as
    { word: string; text: string }[];
  const ctx = new Map<string, string>();
  for (const r of rows) {
    const k = esGlossKey(r.word);
    if (!k || ctx.has(k)) continue;
    ctx.set(k, r.text);
  }
  return ctx;
}

async function glossAll() {
  const cache = new JsonCache<string>(path.join(workDir, 'cache-gloss.json'));
  const ctx = wordContexts();
  const todo = [...ctx.keys()].filter(k => cache.get(k) === undefined);
  console.log(`glosses: ${ctx.size} words, ${todo.length} to ask`);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const user = batch.map((w, k) => `${k + 1}. word: ${JSON.stringify(w)} — sentence: ${JSON.stringify(ctx.get(w))}`).join('\n');
    const out = await chatJson<{ items: { word: string; tr: string }[] }>(GLOSS_SYS, user, GLOSS_SCHEMA, 1200);
    for (const it of out?.items ?? []) {
      if (batch.includes(it.word) && it.tr.trim()) cache.set(it.word, it.tr.trim());
    }
    console.log(`glosses ${Math.min(i + 20, todo.length)}/${todo.length}`);
  }
  cache.save();
  const insert = db.prepare('INSERT INTO word_translations_es (word_lower, translation_tr) VALUES (?, ?)');
  db.transaction(() => {
    for (const k of ctx.keys()) {
      const tr = GLOSS_OVERRIDES[k] ?? cache.get(k);
      if (tr) insert.run(k, tr);
    }
  })();
}

// ── 5. Vocab ─────────────────────────────────────────────────────────

/** Function words and the copulas the patterns already teach. */
const STOPWORDS = new Set(`a al algo algún alguna alguno algunos ante antes aquí así aun aunque bien cada como con cual cuando de del desde donde dos e el ella ellas ello ellos en entonces entre era eres es esa ese eso esta está estaba estamos están estar estás este esto estoy fue fuera ha había han has hasta hay haber he la las le les lo los me mi mis muy más nada ni no nos nosotros o os para pero poco por porque que qué quien se ser si sí sin sobre soy su sus también tan te ti tu tú tus un una uno unos unas usted ustedes y ya yo él ah oh eh mm uh ay sí okay ok vale bueno pues hola adiós`.split(' '));

const LEMMA_SYS = `You analyse Spanish words for a beginner vocabulary list. For each word (with a sentence it appears in) give: its dictionary form ("lemma": infinitive for verbs, masculine singular for adjectives, singular for nouns), its part of speech ("pos": noun, verb, adjective, adverb or other), the lemma's main Turkish meaning ("tr": 1-3 words, a verb as a Turkish infinitive like "gitmek"), and the CEFR level of the lemma ("cefr": A1, A2, B1 or B2). Keep each "word" exactly as given.`;

const LEMMA_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          lemma: { type: 'string' },
          pos: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'other'] },
          tr: { type: 'string' },
          cefr: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2'] },
        },
        required: ['word', 'lemma', 'pos', 'tr', 'cefr'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};
type LemmaInfo = { lemma: string; pos: string; tr: string; cefr: string };

const STARTER_COUNT = 50;

/** ASCII id stem: accents dropped, ñ → n ("niño" → "nino"). */
const idStem = (lemma: string) => lemma.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, '-');

async function vocabAll() {
  const cache = new JsonCache<LemmaInfo>(path.join(workDir, 'cache-lemma.json'));
  const ctx = wordContexts();
  const freq = new Map<string, number>();
  for (const r of db.prepare('SELECT word FROM word_timestamps').all() as { word: string }[]) {
    const k = esGlossKey(r.word);
    if (k.length > 2 && !STOPWORDS.has(k) && !/\d/.test(k)) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const candidates = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 250).map(([k]) => k);
  const todo = candidates.filter(k => cache.get(k) === undefined);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const user = batch.map((w, k) => `${k + 1}. word: ${JSON.stringify(w)} — sentence: ${JSON.stringify(ctx.get(w))}`).join('\n');
    const out = await chatJson<{ items: (LemmaInfo & { word: string })[] }>(LEMMA_SYS, user, LEMMA_SCHEMA, 2000);
    for (const it of out?.items ?? []) {
      if (batch.includes(it.word)) cache.set(it.word, { lemma: it.lemma.toLowerCase(), pos: it.pos, tr: it.tr, cefr: it.cefr });
    }
    console.log(`lemmas ${Math.min(i + 20, todo.length)}/${todo.length}`);
  }
  cache.save();

  // Group surface forms by lemma; keep beginner content words.
  const byLemma = new Map<string, { info: LemmaInfo; forms: string[]; count: number }>();
  for (const k of candidates) {
    const info = cache.get(k);
    if (!info || info.pos === 'other' || !['A1', 'A2'].includes(info.cefr) || STOPWORDS.has(info.lemma)) continue;
    const g = byLemma.get(info.lemma) ?? { info, forms: [], count: 0 };
    g.forms.push(k);
    g.count += freq.get(k) ?? 0;
    byLemma.set(info.lemma, g);
  }
  const chosen = [...byLemma.values()].sort((a, b) => b.count - a.count).slice(0, STARTER_COUNT);

  const insertWord = db.prepare(
    `INSERT INTO vocab_words (id, word, part_of_speech, translation_tr, frequency_rank, cefr_level, language)
     VALUES (?, ?, ?, ?, ?, ?, 'es')`,
  );
  const tokens = db.prepare(
    `SELECT wt.id, wt.word, wt.line_id, sl.clip_id FROM word_timestamps wt JOIN subtitle_lines sl ON sl.id = wt.line_id ORDER BY wt.id`,
  ).all() as { id: number; word: string; line_id: number; clip_id: number }[];
  const link = db.prepare('UPDATE word_timestamps SET starter_word_id = ? WHERE id = ?');
  const insertClipVocab = db.prepare(
    'INSERT INTO clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, ?)',
  );
  db.transaction(() => {
    const idOf = new Map<string, string>();
    chosen.forEach((g, rank) => {
      let id = `a2-es-${idStem(g.info.lemma)}`;
      while ([...idOf.values()].includes(id)) id += '-2';
      for (const f of g.forms) idOf.set(f, id);
      insertWord.run(id, g.info.lemma, g.info.pos, g.info.tr, rank + 1, g.info.cefr);
    });
    const perClip = new Map<string, { clip: number; word: string; line: number; n: number }>();
    for (const t of tokens) {
      const id = idOf.get(esGlossKey(t.word));
      if (!id) continue;
      link.run(id, t.id);
      const key = `${t.clip_id}|${id}`;
      const cv = perClip.get(key) ?? { clip: t.clip_id, word: id, line: t.line_id, n: 0 };
      cv.n++;
      perClip.set(key, cv);
    }
    for (const cv of perClip.values()) insertClipVocab.run(cv.clip, cv.word, cv.line, cv.n);
  })();
  console.log(`vocab: ${chosen.length} starters — ${chosen.map(g => g.info.lemma).join(', ')}`);
}

// ── 6. Set ───────────────────────────────────────────────────────────

function buildSet() {
  db.prepare(
    `INSERT INTO video_sets (id, title, title_tr, description, description_tr, difficulty, sort_order)
     VALUES ('es-set-1', 'Spanish Starter', 'İspanyolca Başlangıç',
             'Animated film scenes in Latin American Spanish, slowest first.',
             'Pixar, Disney ve DreamWorks filmlerinden Latin Amerika İspanyolcası sahneler, en yavaştan başlayarak.',
             'beginner', 100)`,
  ).run();
  // Slowest source first; a source's scenes stay in story order.
  const order = [...videoOrder].sort(
    (a, b) => (sourceWpm.get(a.youtubeId)! - sourceWpm.get(b.youtubeId)!) ||
      videoOrder.indexOf(a) - videoOrder.indexOf(b),
  );
  const insert = db.prepare('INSERT INTO video_set_items (set_id, video_id, sort_order) VALUES (?, ?, ?)');
  order.forEach((v, i) => insert.run('es-set-1', v.id, i + 1));
}

(async () => {
  await translateAll();
  await tagAll();
  await glossAll();
  await vocabAll();
  buildSet();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  console.log(
    `\nDone: ${n('SELECT COUNT(*) n FROM videos')} scene videos, ${n('SELECT COUNT(*) n FROM subtitle_lines')} lines` +
      ` (${n('SELECT COUNT(*) n FROM subtitle_lines WHERE translation_tr IS NOT NULL')} translated,` +
      ` ${n('SELECT COUNT(*) n FROM subtitle_lines WHERE structure IS NOT NULL')} tagged),` +
      ` ${n('SELECT COUNT(*) n FROM word_timestamps')} words, ${n('SELECT COUNT(*) n FROM word_translations_es')} glosses,` +
      ` ${n('SELECT COUNT(*) n FROM vocab_words')} starters`,
  );
  db.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
