import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Lang } from '@/lib/lang';
import { prepareEsWordRows, type KaraokeWordRow } from '@/lib/word-gloss';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

function parseStructure(raw: string | null): Structure | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.subject) && Array.isArray(obj.aux_verb) && Array.isArray(obj.rest)) {
      return obj as Structure;
    }
    return null;
  } catch {
    return null;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface PatternFilter {
  /** Human label shown in logs / responses. */
  label: string;
  /** SQL fragment that picks lines starting with the pattern. Must be
   *  prefixed with AND and reference `sl.text`. */
  sqlPredicate: string;
  /** Learning language of the lines this pattern matches (default 'en').
   *  The pattern id alone decides it, so a request never mixes English
   *  and Spanish lines whatever ?lang= it carries. */
  lang?: Lang;
}

/** Common-conversation adjectives that follow "I am ..." or "I'm ...".
 *  Curated rather than POS-derived because vocab_words.part_of_speech
 *  only covers the ~95 A2 starters; everyday adjectives like "sorry"
 *  or "fine" aren't tagged. Lowercased, single-word; the SQL strips
 *  punctuation off word tokens before checking membership. */
const ADJ_AFTER_I_AM = [
  // feelings / emotions
  'sorry', 'glad', 'happy', 'sad', 'angry', 'mad', 'upset', 'bored',
  'nervous', 'anxious', 'worried', 'excited', 'thrilled', 'pleased',
  'satisfied', 'proud', 'embarrassed', 'ashamed', 'guilty', 'confused',
  'surprised', 'shocked', 'disappointed', 'jealous', 'calm', 'relaxed',
  'lonely', 'depressed', 'grateful', 'honored', 'curious', 'hopeful',
  'hopeless', 'helpless', 'flattered', 'disgusted', 'horrified',
  // physical / bodily state
  'tired', 'exhausted', 'sleepy', 'hungry', 'thirsty', 'sick', 'ill',
  'well', 'fine', 'hurt', 'lost', 'awake', 'asleep', 'drowsy', 'weary',
  'starving', 'freezing', 'boiling', 'wet', 'soaked', 'pregnant',
  'drunk', 'sober', 'hungover', 'broken',
  // states / readiness
  'ready', 'busy', 'free', 'alone', 'sure', 'certain', 'late', 'early',
  'available', 'unavailable', 'safe', 'stuck', 'done', 'finished',
  'comfortable', 'uncomfortable', 'positive', 'willing', 'aware',
  'responsible',
  // descriptive / personality
  'ok', 'okay', 'right', 'wrong', 'serious', 'kidding', 'joking',
  'married', 'single', 'divorced', 'lucky', 'unlucky', 'blessed',
  'cursed', 'smart', 'stupid', 'dumb', 'silly', 'foolish', 'kind',
  'mean', 'nice', 'friendly', 'rude', 'polite', 'crazy', 'insane',
  'weird', 'strange', 'normal',
  // physical descriptive
  'beautiful', 'ugly', 'handsome', 'pretty', 'gorgeous', 'fat', 'thin',
  'strong', 'weak', 'big', 'small', 'short', 'tall', 'young', 'old',
  'new', 'rich', 'poor',
  // evaluative
  'good', 'bad', 'awful', 'terrible', 'wonderful', 'great', 'amazing',
  'fantastic', 'brilliant', 'incredible', 'perfect', 'important',
  'different', 'easy', 'hard', 'better', 'worse', 'best', 'worst',
  // additional everyday adjectives surfaced from corpus misses
  'pathetic', 'older', 'younger', 'cheap', 'expensive', 'fast', 'slow',
  'quiet', 'loud', 'late', 'early', 'soft', 'angry', 'jealous',
  'bored', 'pissed', 'overwhelmed', 'fed up', 'cool', 'cute',
  'adorable', 'lovely', 'nice', 'evil', 'wicked', 'innocent',
];

/** Light intensifiers that introduce an adjective:
 *  "I am so happy", "I'm really tired". The query also accepts these
 *  in the slot right after "am"/"I'm" provided the next word is a
 *  known adjective. Kept short so we don't sweep in adverbs that
 *  rarely precede an adjective in conversation. */
const ADJ_INTENSIFIERS = [
  'so', 'very', 'really', 'totally', 'quite', 'super', 'extremely',
  'absolutely', 'completely', 'truly', 'honestly', 'actually', 'too',
  'pretty', 'kinda', 'sort', 'kind',
];

/** Spanish words that complete ser/estar as a predicate ("estoy
 *  cansado", "es muy guapo"), with the gender/number variants (-o/-a/
 *  -os/-as) Spanish adjectives agree in. "bien"/"mal" are adverbs but
 *  fill the same slot in beginner staples ("Estoy bien" = İyiyim).
 *  Lowercased; accents as written in the subtitles, plus a few common
 *  unaccented spellings. */
const ADJ_AFTER_COPULA = [
  // estar-leaning states / moods
  'bien', 'mal',
  'feliz', 'felices', 'triste', 'tristes',
  'contento', 'contenta', 'contentos', 'contentas',
  'cansado', 'cansada', 'cansados', 'cansadas',
  'ocupado', 'ocupada', 'ocupados', 'ocupadas',
  'enfermo', 'enferma', 'enfermos', 'enfermas',
  'listo', 'lista', 'listos', 'listas',
  'nervioso', 'nerviosa', 'nerviosos', 'nerviosas',
  'preocupado', 'preocupada', 'preocupados', 'preocupadas',
  'emocionado', 'emocionada', 'emocionados', 'emocionadas',
  'sorprendido', 'sorprendida', 'perdido', 'perdida',
  'enojado', 'enojada', 'enojados', 'enojadas', 'enfadado', 'enfadada',
  'aburrido', 'aburrida', 'asustado', 'asustada', 'asustados', 'asustadas',
  'seguro', 'segura', 'seguros', 'seguras',
  'solo', 'sola', 'solos', 'solas', 'libre', 'libres',
  'loco', 'loca', 'locos', 'locas',
  'despierto', 'despierta', 'dormido', 'dormida', 'muerto', 'muerta',
  'mojado', 'mojada', 'lleno', 'llena', 'vacío', 'vacía',
  // ser-leaning traits
  'alto', 'alta', 'altos', 'altas', 'bajo', 'baja', 'bajos', 'bajas',
  'joven', 'jóvenes', 'viejo', 'vieja', 'viejos', 'viejas',
  'nuevo', 'nueva', 'guapo', 'guapa', 'guapos', 'guapas',
  'feo', 'fea', 'feos', 'feas', 'bonito', 'bonita', 'bonitos', 'bonitas',
  'lindo', 'linda', 'lindos', 'lindas', 'hermoso', 'hermosa', 'precioso', 'preciosa',
  'fuerte', 'fuertes', 'débil', 'débiles',
  'rico', 'rica', 'ricos', 'ricas', 'pobre', 'pobres',
  'bueno', 'buena', 'buenos', 'buenas', 'malo', 'mala', 'malos', 'malas',
  'grande', 'grandes', 'pequeño', 'pequeña', 'pequeños', 'pequeñas', 'enorme', 'enormes',
  'gordo', 'gorda', 'flaco', 'flaca', 'delgado', 'delgada',
  'inteligente', 'inteligentes', 'amable', 'amables',
  'simpático', 'simpática', 'tonto', 'tonta',
  'importante', 'importantes', 'famoso', 'famosa',
  'divertido', 'divertida', 'divertidos', 'divertidas',
  'delicioso', 'deliciosa', 'emocionante', 'maravilloso', 'maravillosa',
  'fantástico', 'fantástica', 'estupendo', 'estupenda',
  'perfecto', 'perfecta', 'increíble', 'increíbles', 'increible',
  'difícil', 'difíciles', 'fácil', 'fáciles',
  'caro', 'cara', 'barato', 'barata', 'rápido', 'rápida',
  'lento', 'lenta', 'limpio', 'limpia', 'sucio', 'sucia',
  'frío', 'fría', 'caliente', 'calientes',
  // high-frequency conversational + description adjectives
  'normal', 'normales', 'real', 'reales', 'mejor', 'mejores', 'peor', 'peores',
  'igual', 'iguales', 'diferente', 'diferentes', 'posible', 'posibles', 'imposible',
  'rubio', 'rubia', 'rubios', 'rubias', 'moreno', 'morena', 'morenos', 'morenas',
  'mayor', 'mayores', 'menor', 'menores',
  'raro', 'rara', 'claro', 'clara', 'cierto', 'cierta',
  'genial', 'geniales', 'tranquilo', 'tranquila',
  'sincero', 'sincera', 'serio', 'seria',
];

/** Spanish intensifiers between a copula and an adjective:
 *  "es muy guapo", "estoy tan cansado". */
const COPULA_INTENSIFIERS = [
  'muy', 'tan', 'súper', 'super', 'bastante', 'demasiado', 'realmente',
];

function sqlList(words: string[]): string {
  // single-quoted, escaped — adjectives are alphabetic so no escaping
  // needed beyond doubling apostrophes (none of our entries have one).
  return words.map(w => `'${w}'`).join(',');
}

/** Builds the EXISTS-clause SQL for a "<subject> <be> + adjective"
 *  pattern. Accepts arrays of prefixes so a single rule can cover
 *  all three variants of a row (e.g. He/She/It → "he is", "she is",
 *  "it is" + the matching contractions). All full-form prefixes
 *  share one slot index; all contraction prefixes share another.
 *  The body checks: direct adjective | intensifier+adj | not+adj |
 *  not+intensifier+adj — so "I am so happy", "you're not sure",
 *  "he is not very excited" all match. */
function buildBeAdjPredicate(opts: {
  fullPrefixes: string[];          // e.g. ["he is ", "she is ", "it is "] — each ends in space
  fullSlotIndex: number;           // word_index of the slot after BE in the full form
  contractionPrefixes: string[];   // e.g. ["he's ", "she's ", "it's "]
  contractionSlotIndex: number;
}): string {
  const { fullPrefixes, fullSlotIndex, contractionPrefixes, contractionSlotIndex } = opts;
  // SQL string-quoted, with apostrophes doubled.
  const sqlEscape = (s: string) => s.replace(/'/g, "''");
  const fps = fullPrefixes.map(sqlEscape);
  const cps = contractionPrefixes.map(sqlEscape);
  // OR'd LIKE list for prefix membership.
  const fpAny = fps.map(p => `LOWER(TRIM(sl.text)) LIKE '${p}%'`).join(' OR ');
  const cpAny = cps.map(p => `LOWER(TRIM(sl.text)) LIKE '${p}%'`).join(' OR ');
  // The slot right after BE can hold:
  //   1. a direct adjective                                  ("I am tired")
  //   2. an intensifier + adjective                          ("I'm really tired")
  //   3. a negation + adjective                              ("I am not happy")
  //   4. a negation + intensifier + adjective                ("I'm not very happy")
  // Cases 3 & 4 reuse the wt2/wt3 structure to peek further into the
  // sentence. The clean strip on each word removes wrapping punctuation
  // so "tired." matches the bare adjective list.
  const clean = `LOWER(TRIM(wt%.word, '.,!?;:"' || char(39)))`;
  const adj = `${clean} IN (${sqlList(ADJ_AFTER_I_AM)})`;
  const intensifier = `${clean} IN (${sqlList(ADJ_INTENSIFIERS)})`;
  const isNot = `${clean} = 'not'`;
  const c1 = adj.replace(/wt%/g, 'wt1');
  const i1 = intensifier.replace(/wt%/g, 'wt1');
  const n1 = isNot.replace(/wt%/g, 'wt1');
  const a2 = adj.replace(/wt%/g, 'wt2');
  const i2 = intensifier.replace(/wt%/g, 'wt2');
  const a3 = adj.replace(/wt%/g, 'wt3');

  return `
    AND ((${fpAny}) OR (${cpAny}))
    AND EXISTS (
      SELECT 1 FROM word_timestamps wt1
      WHERE wt1.line_id = sl.id
        AND (
          ((${fpAny}) AND wt1.word_index = ${fullSlotIndex})
          OR ((${cpAny}) AND wt1.word_index = ${contractionSlotIndex})
        )
        AND (
          -- 1. direct adjective
          ${c1}
          -- 2. intensifier + adjective
          OR (${i1} AND EXISTS (
            SELECT 1 FROM word_timestamps wt2
            WHERE wt2.line_id = sl.id
              AND wt2.word_index = wt1.word_index + 1
              AND ${a2}
          ))
          -- 3 & 4. negation, possibly with intensifier
          OR (${n1} AND EXISTS (
            SELECT 1 FROM word_timestamps wt2
            WHERE wt2.line_id = sl.id
              AND wt2.word_index = wt1.word_index + 1
              AND (
                ${a2}
                OR (${i2} AND EXISTS (
                  SELECT 1 FROM word_timestamps wt3
                  WHERE wt3.line_id = sl.id
                    AND wt3.word_index = wt2.word_index + 1
                    AND ${a3}
                ))
              )
          ))
        )
    )`;
}

/** Spanish analog of `buildBeAdjPredicate` for the ser/estar +
 *  adjective family. Spanish is pro-drop (the subject pronoun is usually
 *  omitted: "Estoy cansado" = "Yorgunum"), so this keys on the COPULA
 *  word itself rather than a sentence-leading pronoun prefix: any line
 *  with a copula form from `copulas` immediately followed by an adjective
 *  (or intensifier + adjective). Negation ("no estoy cansado") sits BEFORE
 *  the copula, so it doesn't break the adjacency. The trim set adds the
 *  inverted ¿ ¡ that open Spanish questions and exclamations. */
function buildCopulaAdjPredicate(copulas: string[]): string {
  const clean = `LOWER(TRIM(wt%.word, '.,!?;:"¿¡…' || char(39)))`;
  const copulaIn = `${clean.replace(/wt%/g, 'wt1')} IN (${sqlList(copulas)})`;
  const adj2 = `${clean.replace(/wt%/g, 'wt2')} IN (${sqlList(ADJ_AFTER_COPULA)})`;
  const int2 = `${clean.replace(/wt%/g, 'wt2')} IN (${sqlList(COPULA_INTENSIFIERS)})`;
  const adj3 = `${clean.replace(/wt%/g, 'wt3')} IN (${sqlList(ADJ_AFTER_COPULA)})`;

  return `
    AND EXISTS (
      SELECT 1 FROM word_timestamps wt1
      WHERE wt1.line_id = sl.id
        AND ${copulaIn}
        AND EXISTS (
          SELECT 1 FROM word_timestamps wt2
          WHERE wt2.line_id = sl.id
            AND wt2.word_index = wt1.word_index + 1
            AND (
              -- copula + adjective ("estoy cansado")
              ${adj2}
              -- copula + intensifier + adjective ("es muy guapo")
              OR (${int2} AND EXISTS (
                SELECT 1 FROM word_timestamps wt3
                WHERE wt3.line_id = sl.id
                  AND wt3.word_index = wt2.word_index + 1
                  AND ${adj3}
              ))
            )
        )
    )`;
}

/** Maps a pattern.id (mirrors PatternCatalog ids in iOS) to the SQL
 *  predicate that picks subtitle lines matching that pattern. English
 *  covers the BE + adjective family — "I am +", "You are +" — and
 *  Spanish the ser/estar + adjective family (`lang: 'es'`), leaving
 *  room for the rest as the demand surfaces. */
const PATTERN_FILTERS: Record<string, PatternFilter> = {
  'be-adj-i': {
    label: 'I am + sıfat',
    // "I am happy" → I(0) am(1) happy(2)  |  "I'm happy" → I'm(0) happy(1)
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['i am '],
      fullSlotIndex: 2,
      contractionPrefixes: ["i'm "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-you': {
    label: 'You are + sıfat',
    // "You are kind" → You(0) are(1) kind(2)  |  "You're kind" → You're(0) kind(1)
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['you are '],
      fullSlotIndex: 2,
      contractionPrefixes: ["you're "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-hesheIt': {
    label: 'He/She/It is + sıfat',
    // Three subjects share the same slot positions. Full forms: He/She/It is X
    // → idx 2; contractions: He's/She's/It's X → idx 1.
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['he is ', 'she is ', 'it is '],
      fullSlotIndex: 2,
      contractionPrefixes: ["he's ", "she's ", "it's "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-wethey': {
    label: 'We/They are + sıfat',
    // "We are happy" / "They are tired" → idx 2.
    // "We're happy" / "They're tired" → idx 1.
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['we are ', 'they are '],
      fullSlotIndex: 2,
      contractionPrefixes: ["we're ", "they're "],
      contractionSlotIndex: 1,
    }),
  },

  // ── Spanish: ser/estar + adjective ──────────────────────────────
  'ser-estar-adj-yo': {
    label: 'Yo soy/estoy + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(['soy', 'estoy']),
    lang: 'es',
  },
  'ser-estar-adj-tu': {
    label: 'Tú eres/estás + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(['eres', 'estás']),
    lang: 'es',
  },
  'ser-estar-adj-el': {
    label: 'Él/Ella es/está + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(['es', 'está']),
    lang: 'es',
  },
  'ser-estar-adj-nosotros': {
    label: 'Nosotros somos/estamos + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(['somos', 'estamos']),
    lang: 'es',
  },
  'ser-estar-adj-ellos': {
    label: 'Ellos/Ellas son/están + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(['son', 'están']),
    lang: 'es',
  },
};

/** One karaoke-ready sentence card — shape matches the iOS
 *  `VocabContext` so the existing reels card can render it without
 *  any model changes. The endpoint returns `{ items: [...], total }`
 *  to match how the Word Reels feed is decoded on the client. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
) {
  try {
    const { patternId } = await params;
    const filter = PATTERN_FILTERS[patternId];
    if (!filter) {
      return NextResponse.json(
        { error: `Unknown patternId: ${patternId}` },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const lang = filter.lang ?? 'en';
    const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
    const limit = Math.max(10, Math.min(300, Number.isFinite(limitRaw) ? limitRaw : 100));

    const db = getDb();

    // Quality filter: poc + approved + sentence has structure tags +
    // has Turkish translation + reasonable length. The structure check
    // matters because the karaoke colors lean on subject/aux/rest
    // indices; without them the line still plays but the 3-color
    // code goes flat. Same length cap as vocab-feed (drops monologue
    // walls).
    const rows = db
      .prepare(
        `SELECT
           sl.id              AS line_id,
           sl.text,
           sl.start_time      AS line_start,
           sl.end_time        AS line_end,
           sl.translation_tr  AS line_tr,
           sl.structure       AS structure_raw,
           c.id               AS clip_id,
           c.start_time       AS clip_start,
           c.end_time         AS clip_end,
           v.id               AS video_id,
           v.youtube_video_id,
           v.title            AS video_title,
           v.movie_title
         FROM subtitle_lines sl
         JOIN clips c  ON c.id = sl.clip_id
         JOIN videos v ON v.id = c.video_id
         WHERE c.status = 'approved'
           AND v.language = ?
           -- Note: dropped the v.poc=1 restriction once the akış started
           -- starving on the curated subset. clip.status='approved' is
           -- still the per-clip quality gate.
           AND sl.text IS NOT NULL
           AND length(trim(sl.text)) > 0
           AND length(sl.text) <= 120
           AND sl.translation_tr IS NOT NULL
           AND length(trim(sl.translation_tr)) > 0
           AND sl.structure IS NOT NULL
           ${filter.sqlPredicate}`,
      )
      .all(lang) as {
      line_id: number;
      text: string;
      line_start: number;
      line_end: number;
      line_tr: string | null;
      structure_raw: string | null;
      clip_id: number;
      clip_start: number;
      clip_end: number;
      video_id: string;
      youtube_video_id: string;
      video_title: string;
      movie_title: string;
    }[];

    // Dedupe by exact sentence text — same line shared across multiple
    // approved clip variants only contributes once to keep the akış
    // feeling fresh card-to-card.
    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const r of rows) {
      const key = r.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    // Need at least 3 word_timestamps for the karaoke to look right.
    // Using a single bulk query instead of per-line so the route stays
    // O(1) DB calls regardless of corpus size.
    const lineIds = deduped.map(r => r.line_id);
    const wordCountByLine = new Map<number, number>();
    if (lineIds.length > 0) {
      const placeholders = lineIds.map(() => '?').join(',');
      const counts = db
        .prepare(
          `SELECT line_id, COUNT(*) AS c
           FROM word_timestamps
           WHERE line_id IN (${placeholders})
           GROUP BY line_id`,
        )
        .all(...lineIds) as { line_id: number; c: number }[];
      for (const row of counts) {
        wordCountByLine.set(row.line_id, row.c);
      }
    }
    // Spanish is pro-drop, so a perfectly good "Estoy cansado" is only
    // two words; the 3-word floor (tuned for "I am happy") would starve
    // the ser/estar feed. Two words still karaoke cleanly.
    const minWords = lang === 'es' ? 2 : 3;
    const usable = deduped.filter(r => (wordCountByLine.get(r.line_id) ?? 0) >= minWords);

    // Pick a random sample so repeated visits don't always start with
    // the same first card. The cap is small enough (≤300) that fully
    // shuffling and slicing is fine.
    const sampled = shuffle(usable).slice(0, limit);

    // Per-line word fetch — same shape vocab-feed uses so the iOS
    // VocabContext decoder works unchanged.
    const englishWords = db.prepare(
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
    // Spanish lines gloss from word_translations_es (lib/word-gloss.ts).
    const wordRowsFor =
      lang === 'es'
        ? prepareEsWordRows(db)
        : (lineId: number) => englishWords.all(lineId) as KaraokeWordRow[];

    // Phrase dict — small enough to load once and reuse per line.
    const phraseRows = db
      .prepare(`SELECT phrase, translation_tr FROM phrase_translations`)
      .all() as { phrase: string; translation_tr: string }[];
    const phraseDict = new Map<string, string>(
      phraseRows.map(r => [r.phrase.toLowerCase(), r.translation_tr]),
    );
    const cleanWord = (w: string) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

    interface PhraseSpan {
      startIndex: number;
      endIndex: number;
      translationTr: string;
      joinedText: string;
    }
    function detectPhrases(
      ws: { word: string; word_index: number }[],
    ): PhraseSpan[] {
      const out: PhraseSpan[] = [];
      let i = 0;
      while (i < ws.length - 1) {
        const w1 = cleanWord(ws[i].word);
        const w2 = cleanWord(ws[i + 1].word);
        const tr = phraseDict.get(`${w1} ${w2}`);
        if (tr) {
          out.push({
            startIndex: ws[i].word_index,
            endIndex: ws[i + 1].word_index,
            translationTr: tr,
            joinedText: `${ws[i].word} ${ws[i + 1].word}`,
          });
          i += 2;
        } else {
          i += 1;
        }
      }
      return out;
    }

    const items = sampled.map(r => {
      const wordRows = wordRowsFor(r.line_id);

      return {
        lineId: r.line_id,
        text: r.text,
        translationTr: r.line_tr,
        startTime: r.line_start,
        endTime: r.line_end,
        clipStartTime: r.clip_start,
        clipEndTime: r.clip_end,
        structure: parseStructure(r.structure_raw),
        videoId: r.video_id,
        youtubeVideoId: r.youtube_video_id,
        videoTitle: r.video_title,
        movieTitle: r.movie_title,
        isPoc: true,
        words: wordRows.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
          wordIndex: w.word_index,
          starterId: w.starter_word_id ?? null,
          starterTr: w.starter_tr ?? null,
          translationTr: w.word_tr ?? null,
        })),
        // The phrase dictionary is English phrasal verbs.
        phrases: lang === 'es' ? [] : detectPhrases(wordRows),
      };
    });

    return NextResponse.json(
      {
        patternId,
        label: filter.label,
        items,
        total: items.length,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('Error building pattern scenes feed:', error);
    return NextResponse.json(
      { error: 'Failed to build pattern scenes feed' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
