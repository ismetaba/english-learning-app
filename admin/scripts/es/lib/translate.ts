// Spanish → Turkish for the content build: line translations, word glosses
// and the starter words' grouping and meanings. Pure functions plus
// translateLines, which talks to the model only through the `ask` it is
// given; covered by tests/es-translate.test.ts.
//
// An audit of the live set found the pipeline's own errors: sentences split
// over two lines translated half by half, broken replies (token-limit loops,
// the model's notes, context copied in) cached for good, glosses taken from
// the first sentence a word appeared in, and interjections ("¡Oye!") counted
// as their verb.
import { esGlossKey } from '../../../lib/word-gloss';

export interface TranslateLine { id: number; text: string; clip_id: number; movie_title: string }

/** One model turn: the raw reply, or null. `chat` from lmstudio.ts fits. */
export type Ask = (system: string, user: string,
                   opts: { temperature: number; maxTokens: number }) => Promise<string | null>;

/** A string cache: a Map, or the build's JsonCache. */
export interface StringCache {
  get(key: string): string | undefined;
  set(key: string, value: string): unknown;
}

// ── Replies ──────────────────────────────────────────────────────────

/** Matching pairs a reply may come wrapped in. */
const WRAP: Record<string, string> = { '"': '"', "'": "'", '«': '»', '“': '”', '‘': '’' };

const words = (s: string) => s.split(/\s+/).map(esGlossKey).filter(Boolean);
const oddQuotes = (s: string) => (s.match(/"/g)?.length ?? 0) % 2 === 1;
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Most times one word comes up in the text. */
function maxRepeat(s: string): number {
  const n = new Map<string, number>();
  for (const w of words(s)) n.set(w, (n.get(w) ?? 0) + 1);
  return Math.max(0, ...n.values());
}

/** The reply as a subtitle, or null when it is not one: empty, more than
 *  one line, markdown or a note about the translation, the context lines
 *  copied in (" / "), a loop cut off at the token limit (far longer than
 *  the source, one word over and over), a quote left open that the source
 *  doesn't leave open, no words at all for a source that has some ("." for
 *  "abrazos."). A leading dialogue dash goes, and quotes go only
 *  when they wrap the whole reply (`"Gelmeyecek" derken…` keeps its own). */
export function cleanTranslation(raw: string | null | undefined, source: string): string | null {
  let t = (raw ?? '').trim();
  if (!t || /[\r\n]/.test(t) || t.includes('**')) return null;
  if (/\b(note|translation|translated)\b/i.test(t)) return null;
  if (t.includes(' / ') && !source.includes('/')) return null;
  if (t.length > source.length * 3 + 20) return null;
  if (maxRepeat(t) > maxRepeat(source) + 3) return null;
  if (oddQuotes(t) && !oddQuotes(source)) return null;
  if (!hasLetters(t) && hasLetters(source)) return null;
  t = t.replace(/^[—–-]+\s*/, '');
  const close = WRAP[t[0]];
  const src = source.trim();
  if (close && t.length > 1 && t.endsWith(close) && !(WRAP[src[0]] && src.endsWith(WRAP[src[0]]))) {
    const inner = t.slice(1, -1);
    if (!inner.includes(t[0]) && !inner.includes(close)) t = inner.trim();
  }
  return t || null;
}

/** The JSON in a reply, bare or fenced, or undefined. */
function jsonOf(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** The parts of a group reply: JSON, bare or fenced, an array or
 *  {"parts": […]}, with exactly one non-empty string per line. */
export function parseParts(raw: string | null | undefined, n: number): string[] | null {
  const j = jsonOf(raw);
  const parts = Array.isArray(j) ? j : (j as { parts?: unknown } | undefined)?.parts;
  if (!Array.isArray(parts) || parts.length !== n) return null;
  if (!parts.every(p => typeof p === 'string' && p.trim())) return null;
  return parts.map(p => (p as string).trim());
}

/** The "sentence" of a group reply: the Turkish written out whole before
 *  it was split, still good when no split is. */
function parseSentence(raw: string | null | undefined): string | null {
  const s = (jsonOf(raw) as { sentence?: unknown } | undefined)?.sentence;
  return typeof s === 'string' ? s : null;
}

// ── Lines ────────────────────────────────────────────────────────────

/** Same rule as lib/lines.ts: the line ends a sentence. */
const SENTENCE_END = /[.?!…]["'»)\]]*$/;
/** Most lines one sentence may span before it is translated in pieces. */
const MAX_GROUP = 3;

/** Lines that make one sentence, as index runs: a line that stops
 *  mid-sentence goes with the next line of the same clip ("…y no" | "han
 *  agregado el parpadeo…"), three lines at most. */
export function sentenceGroups(lines: TranslateLine[]): number[][] {
  const groups: number[][] = [];
  let g: number[] = [];
  lines.forEach((l, i) => {
    g.push(i);
    const next = lines[i + 1];
    if (SENTENCE_END.test(l.text.trim()) || !next || next.clip_id !== l.clip_id || g.length >= MAX_GROUP) {
      groups.push(g);
      g = [];
    }
  });
  return groups;
}

const TRANSLATE_SYS = `You are a professional subtitle translator. Translate the Latin American Spanish dialogue line marked LINE into natural, colloquial Turkish, the way a real Turkish subtitle would read it. The lines before and after are context only: do not translate them. Spanish often drops the subject pronoun, so use the context to choose the right Turkish person and ending. Keep it concise. Output ONLY the Turkish translation of LINE.`;

/** Given only the numbered lines, the model still lost a negation that
 *  ended a line ("…y no | han agregado…" → "eklemişler"); shown the sentence
 *  whole and made to write it out before splitting it, it kept it. */
const GROUP_SYS = `You are a professional subtitle translator. The Latin American Spanish dialogue SENTENCE is split over the consecutive subtitles numbered under LINES. First translate the whole SENTENCE into natural, colloquial Turkish, the way a real Turkish subtitle would read it, keeping all of its meaning, negations included: a line often ends in the middle of a phrase that the next line finishes. Then split your Turkish sentence into one part per numbered line, in order: read together, the parts are your sentence, and each part says what its own line says. Turkish word order may move a word or two between neighbouring parts, but no part repeats another and none is empty. The lines before and after are context only: do not translate them. Spanish often drops the subject pronoun, so use the context to choose the right Turkish person and ending. Output ONLY JSON: {"sentence": "<the Turkish sentence>", "parts": ["<part for line 1>", "<part for line 2>", …]}.`;

const PART_SYS = `You are a professional subtitle translator. A Latin American Spanish sentence (SENTENCE) is split over several subtitles. Translate only the subtitle marked PART into natural, colloquial Turkish, as its piece of a Turkish subtitle of the whole sentence: it carries on from the Turkish so far and says what PART says, nothing from the other subtitles. The lines before and after are context only. Spanish often drops the subject pronoun, so use the context to choose the right Turkish person and ending. Output ONLY the Turkish for PART.`;

/** First try near-greedy; a reply that fails cleanTranslation tends to come
 *  back the same, so the retries sample. */
const TEMPS = [0.2, 0.6, 0.9];

/** Turkish for every line, by id. A line with a hand correction
 *  (TRANSLATION_OVERRIDES) gets it. A line on its own is asked with the
 *  lines around it as context and cached under `before|text|after`, as the
 *  build always has, so earlier answers are reused. The lines of one
 *  sentence are asked together, for one part each; when that fails, line
 *  by line with the whole sentence in view, never a half alone; when no
 *  split works ("¡Se está" | "acercando!" is one Turkish word), each line
 *  gets the whole sentence's Turkish. Every reply, fresh or cached, goes
 *  through cleanTranslation: a broken one is asked again and never cached. */
export async function translateLines(lines: TranslateLine[], ask: Ask, cache: StringCache,
                                     progress?: (done: number, asked: number) => void): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  let asked = 0;
  const sameClip = (i: number, k: number) => lines[k]?.clip_id === lines[i].clip_id ? lines[k].text : null;
  const beforeOf = (i: number) => [sameClip(i, i - 2), sameClip(i, i - 1)].filter(Boolean).join(' / ');
  /** The ask for one line (TRANSLATE_SYS), or a whole sentence as one. */
  const lineAsk = (title: string, b: string, text: string, a: string) =>
    `Source: ${title}\nBefore: ${b || '—'}\nLINE: ${text}\nAfter: ${a || '—'}`;

  async function askClean(system: string, user: string, maxTokens: number,
                          accept: (raw: string | null) => string | null, temps = TEMPS): Promise<string | null> {
    for (const temperature of temps) {
      asked++;
      const ok = accept(await ask(system, user, { temperature, maxTokens }));
      if (ok) return ok;
    }
    return null;
  }

  async function one(i: number) {
    const l = lines[i];
    const fixed = overrideOf(l.text);
    if (fixed) { out.set(l.id, fixed); return; }
    const before = beforeOf(i);
    const after = sameClip(i, i + 1) ?? '';
    const key = `${before}|${l.text}|${after}`;
    const user = (b: string, a: string) => lineAsk(l.movie_title, b, l.text, a);
    const accept = (raw: string | null) => cleanTranslation(raw, l.text);
    let tr = accept(cache.get(key) ?? null);
    if (!tr) {
      tr = await askClean(TRANSLATE_SYS, user(before, after), 200, accept);
      // A line that answers the one before ("¿Qué?" | "Que nunca…") can
      // draw the whole exchange into every reply: last, the line alone.
      if (!tr && (before || after)) tr = await askClean(TRANSLATE_SYS, user('', ''), 200, accept, TEMPS.slice(0, 1));
      if (tr) cache.set(key, tr);
    }
    if (tr) out.set(l.id, tr);
  }

  async function group(g: number[]) {
    const ls = g.map(i => lines[i]);
    const fixed = ls.map(l => overrideOf(l.text));
    const before = beforeOf(g[0]);
    const after = sameClip(g[0], g[g.length - 1] + 1) ?? '';
    const sentence = ls.map(l => l.text).join(' ');
    // A newline never occurs in a single line's key, so the two can't meet.
    const key = `group\n${before}|${ls.map(l => l.text).join('\n')}|${after}`;
    const accept = (raw: string | null) => {
      const parts = cleanParts(parseParts(raw, ls.length), ls);
      return parts && JSON.stringify(parts);
    };
    /** The sentence's Turkish whole, kept as {"sentence": …}: no parts
     *  array, so a cached one is never read as a split. */
    const acceptWhole = (tr: string | null) => {
      const clean = cleanTranslation(tr, sentence);
      return clean && JSON.stringify({ sentence: clean });
    };
    const cached = cache.get(key) ?? null;
    let json = accept(cached) ?? acceptWhole(parseSentence(cached));
    if (!json) {
      // A corrected line is never asked, so its group goes part by part
      // and is never asked whole.
      const askable = !fixed.some(Boolean);
      // Not narrowed to null: the group replies' accept sets it.
      let whole = null as string | null;
      if (askable) json = await askClean(GROUP_SYS,
        `Source: ${ls[0].movie_title}\nBefore: ${before || '—'}\nSENTENCE: ${sentence}\n` +
          `LINES (the sentence over ${ls.length} subtitles):\n${ls.map((l, k) => `${k + 1}. ${l.text}`).join('\n')}\n` +
          `After: ${after || '—'}`,
        250 * ls.length + 100, raw => { whole ??= acceptWhole(parseSentence(raw)); return accept(raw); });
      if (!json) json = await partByPart(ls, before, after, fixed);
      // Too short to split ("Yaklaşıyor!"): no reply gives each line a part
      // of its own, so each line shows the whole, asked as one line.
      if (!json && askable) json = whole ?? await askClean(TRANSLATE_SYS,
        lineAsk(ls[0].movie_title, before, sentence, after), 200 * ls.length, acceptWhole, TEMPS.slice(0, 1));
      if (json) cache.set(key, json);
    }
    if (json) {
      const j = JSON.parse(json) as string[] | { sentence: string };
      ls.forEach((l, k) => out.set(l.id, fixed[k] ?? (Array.isArray(j) ? j[k] : j.sentence)));
    }
  }

  /** The fallback: each line on its own, with the whole sentence and the
   *  Turkish so far in view, a corrected line as its correction; the last
   *  try leaves out the lines around the sentence. All parts or none. */
  async function partByPart(ls: TranslateLine[], before: string, after: string,
                            fixed: (string | undefined)[]): Promise<string | null> {
    const sentence = ls.map(l => l.text).join(' ');
    const parts: string[] = [];
    for (const [k, l] of ls.entries()) {
      const user = (b: string, a: string) => `Source: ${l.movie_title}\nBefore: ${b || '—'}\nSENTENCE: ${sentence}\n` +
        `Turkish so far: ${parts.join(' ') || '—'}\nPART: ${l.text}\nAfter: ${a || '—'}`;
      const accept = (raw: string | null) => cleanTranslation(raw, l.text);
      const tr = fixed[k] ?? await askClean(PART_SYS, user(before, after), 200, accept) ??
        (before || after ? await askClean(PART_SYS, user('', ''), 200, accept, TEMPS.slice(0, 1)) : null);
      if (!tr) return null;
      parts.push(tr);
    }
    return cleanParts(parts, ls) && JSON.stringify(parts);
  }

  const groups = sentenceGroups(lines);
  let done = 0;
  for (const g of groups) {
    if (g.length === 1) await one(g[0]);
    else await group(g);
    const before = done;
    done += g.length;
    if (progress && Math.floor(done / 100) > Math.floor(before / 100)) progress(done, asked);
  }
  return out;
}

/** Each part cleaned against its own line; null when one fails or a part
 *  repeats another (the first half taking in the whole sentence). A part
 *  inside another is fine when its Spanish line is inside the other's too
 *  ("…ultra delgadas, ultra delgadas," | "ultra delgadas."). */
function cleanParts(parts: string[] | null, ls: TranslateLine[]): string[] | null {
  if (!parts) return null;
  const clean = parts.map((p, k) => cleanTranslation(p, ls[k].text));
  if (clean.some(p => !p)) return null;
  const norm = (s: string) => ` ${words(s).join(' ')} `;
  const tr = clean.map(p => norm(p!));
  const es = ls.map(l => norm(l.text));
  for (let a = 0; a < tr.length; a++) {
    for (let b = 0; b < tr.length; b++) {
      if (a !== b && tr[b].length >= 10 && tr[a].includes(tr[b]) && !es[a].includes(es[b])) return null;
    }
  }
  return clean as string[];
}

/** Corrections from a read-through of the live set, for lines whose
 *  meaning the model gets wrong (a person, a homonym, a calque) or loops
 *  on. Keyed by the line's exact text: one applies wherever that text
 *  occurs, so keep to lines that read one way anywhere. A corrected line
 *  is never asked; it is still context for the lines around it. */
export const TRANSLATION_OVERRIDES: Record<string, string> = {
  'Sí, pueden tocar el piso.': 'Evet, yere dokunabilirsiniz.',
  '¿Arreglarlo?': 'Tamir etmek mi?',
  'Ya me está asustando.': 'Beni korkutmaya başladı.',
  '¡Tienes cara de...': 'Suratın tıpkı...',
  'de pez gato!': 'bir yayın balığı gibi!',
  'Oye, Nangi, estos dos quieren preguntar sobre Emmit la nutria.': "Hey Nangi, bu ikisi su samuru Emmit'i sormak istiyor.",
  'Más bien es de esas noticias que te dejan sin habla.': 'Daha çok insanın nutkunu tutturan türden bir haber.',
  '¿De que alguien en Berk lo haría?': "Ya Berk'te herhangi birinin değişeceğine dair?",
  'No soy el único que opina eso, te lo aseguro.': 'Emin ol, bunu düşünen tek kişi ben değilim.',
  'Cabo, tu turno.': 'Cabo, sıra sende.',
  'Bien, rico.': 'Pekala, Rico.',
  'Suerte de principiante, creo.': 'Acemi şansı herhalde.',
  'Los juguetes podemos ver todo.': 'Biz oyuncaklar her şeyi görebiliriz.',
  'Digan todos adiós, casa.': 'Herkes "Hoşça kal ev" desin.',
  'Eres todo un rufiano.': 'Tam bir serserisin.',
  'Esperaba que rastreara una ma...': 'Bir plakayı araştırmanızı umuyordum...',
  '¿Seguro que es buena idea?': 'Bunun iyi bir fikir olduğundan emin misin?',
  '¿Salimos a la mitad?': 'Ortada mı çıkıyoruz?',
  'Y Vitaly, él abre.': 'Gösteriyi de Vitaly açıyor.',
  'Ahí llevan a los peces enfermos.': 'Hasta balıkları oraya götürüyorlar.',
  'Y la única manera de que entren a ese edificio es Becky.': 'Ve o binaya girmenizin tek yolu Becky.',
  'Que nunca tenemos que esperar menta.': 'Hiç sıra beklemek zorunda kalmamamız.',
};

const overrideOf = (text: string) => Object.hasOwn(TRANSLATION_OVERRIDES, text) ? TRANSLATION_OVERRIDES[text] : undefined;

// ── Glosses ──────────────────────────────────────────────────────────

/** Hand-written glosses for the most frequent function words, which the
 *  model glosses from whichever sentences it saw ("si" in "Si recuerdan…"
 *  came back as "-ıp -madığı"), and for frequent forms it got wrong:
 *  tener as "sahip" where Turkish says "-im var", commands as nouns or
 *  passives ("espera" = "bekleyiş"), "la" as an article only ("La
 *  escondí" = onu sakladım), "siento" without "Lo siento". Keys are
 *  esGlossKey forms. */
export const GLOSS_OVERRIDES: Record<string, string> = {
  el: '(belirli, eril)', la: '(belirli) / onu', los: '(belirli, çoğul) / onları', las: '(belirli, çoğul) / onları',
  un: 'bir', una: 'bir', unos: 'birkaç', unas: 'birkaç', al: "-e (a + el)", del: "-in (de + el)",
  de: '-in / -den', a: '-e / -a', en: '-de / içinde', con: 'ile', sin: 'olmadan', por: 'için / -den dolayı',
  para: 'için', sobre: 'hakkında / üstünde', desde: '-den beri', hasta: '-e kadar',
  que: 'ki / -en', qué: 'ne', nada: 'hiçbir şey', si: 'eğer', sí: 'evet', no: 'hayır / değil', y: 've', o: 'veya',
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
  tengo: '-im var / (que) -malıyım', tienes: '-in var / (que) -malısın', tiene: '-i var / (que) -malı',
  tenemos: '-imiz var / (que) -malıyız', tienen: '-leri var / (que) -malılar',
  quiero: 'istiyorum', vamos: 'hadi / gidiyoruz', tal: 'öyle (qué tal: nasıl)',
  hace: 'yapıyor / (süre) önce', fue: 'oldu / gitti', importa: 'önemli', veces: 'kez, defa',
  vale: 'tamam / değer', claro: 'tabii', alto: 'dur! / yüksek',
  habla: 'konuş / konuşuyor', ven: 'gel', espera: 'bekle', escucha: 'dinle', corre: 'koş',
  ayuda: 'yardım (et)', dame: 'bana ver', dime: 'bana söyle',
  siento: 'hissediyorum / (lo siento) üzgünüm', listo: 'hazır / zeki', lista: 'hazır / zeki',
  creo: 'sanırım / inanıyorum', espero: 'umarım / bekliyorum',
};

/** Most sentences a word is glossed from. */
const MAX_CONTEXTS = 4;

/** A sentence a word occurs in: how often, and the words either side. */
type Seen = { n: number; frame: [string, string] };

/** Every gloss key with a few different sentences it occurs in, the most
 *  frequent first and then ones where the word stands between other
 *  words ("Lo siento." / "Me siento bien." / "Siento que…"), so the gloss
 *  covers its common senses rather than the first sentence's. */
export function glossContexts(rows: { word: string; text: string }[]): Map<string, string[]> {
  const seen = new Map<string, Map<string, Seen>>();
  for (const r of rows) {
    const k = esGlossKey(r.word);
    if (!k) continue;
    const byText = seen.get(k) ?? new Map<string, Seen>();
    seen.set(k, byText);
    const s = byText.get(r.text);
    if (s) { s.n++; continue; }
    const ws = r.text.split(' ').map(esGlossKey);
    const at = ws.indexOf(k);
    byText.set(r.text, { n: 1, frame: [ws[at - 1] ?? '', ws[at + 1] ?? ''] });
  }
  const out = new Map<string, string[]>();
  for (const [k, byText] of seen) {
    const all = [...byText.entries()].sort((a, b) => b[1].n - a[1].n);
    const picked: [string, Seen][] = [];
    const isNew = ([, s]: [string, Seen], side: 0 | 1) => !picked.some(([, p]) => p.frame[side] === s.frame[side]);
    // New on both sides, then on either side, then whatever is left.
    for (const pass of [(e: [string, Seen]) => isNew(e, 0) && isNew(e, 1),
                        (e: [string, Seen]) => isNew(e, 0) || isNew(e, 1),
                        () => true]) {
      for (const e of all) if (picked.length < MAX_CONTEXTS && !picked.includes(e) && pass(e)) picked.push(e);
    }
    out.set(k, picked.map(([text]) => text));
  }
  return out;
}

export const GLOSS_SYS = `You give Turkish glosses for a Spanish-learning app. Each item is a Spanish word with a few sentences it appears in. Answer with the short Turkish gloss a learner sees under the word: its meaning in these sentences, covering its common senses there. When the word really means different things in them, give the two most common as "a / b" ("siento" in "Lo siento" and "Me siento bien" → "üzgünüm / hissediyorum"); otherwise one meaning. 1-3 words per meaning. Conjugated verbs get the matching conjugated Turkish form ("quiero" → "istiyorum", "está" → "-dir / bulunuyor"). Articles and prepositions get the closest Turkish word or a short hint in parentheses ("el" → "(belirli)", "de" → "-in, -den"). Names get the name itself. Keep each "word" exactly as given.`;

/** A gloss short enough to sit under the word: two senses at most, none
 *  twice (the model's "oluyor / oluyor"), none a bare "…". */
export function cleanGloss(tr: string): string {
  const senses = [...new Set(tr.split(' / ').map(x => x.trim()).filter(x => x && !/^(\.\.\.|…)$/.test(x)))];
  return senses.slice(0, 2).join(' / ');
}

/** Cache key of a word's gloss: the version marks glosses asked from
 *  several sentences, so the old one-sentence answers are asked again. */
export const glossCacheKey = (word: string) => `v2|${word}`;

// ── Starter words ────────────────────────────────────────────────────

/** Function words and the copulas the patterns already teach. */
export const STOPWORDS = new Set(`a al algo algún alguna alguno algunos ante antes aquí así aun aunque bien cada como con cual cuando de del desde donde dos e el ella ellas ello ellos en entonces entre era eres es esa ese eso esta está estaba estamos están estar estás este esto estoy fue fuera ha había han has hasta hay haber he la las le les lo los me mi mis muy más nada ni no nos nosotros o os para pero poco por porque que qué quien se ser si sí sin sobre soy su sus también tan te ti tu tú tus un una uno unos unas usted ustedes y ya yo él ah oh eh mm uh ay sí okay ok vale bueno pues hola adiós`.split(' '));

/** Forms the films use as interjections, not as their verb: "¡Oye!",
 *  "Oigan, …" (hey), "¡Vaya!" (wow). A starter "oír, duymak" or "ir,
 *  gitmek" taught from them teaches the wrong thing. */
export const INTERJECTIONS = new Set(['oye', 'oiga', 'oigan', 'vaya', 'órale', 'ándale', 'híjole', 'caramba', 'caray']);

export type LemmaInfo = { lemma: string; pos: string; tr: string; cefr: string };
export interface StarterGroup { info: LemmaInfo; forms: string[]; count: number }

/** Surface forms grouped by lemma, beginner content words only (A1-A2,
 *  not a function word or interjection), the most frequent first. */
export function groupStarters(forms: { form: string; count: number; info: LemmaInfo }[]): StarterGroup[] {
  const byLemma = new Map<string, StarterGroup>();
  for (const { form, count, info } of forms) {
    if (info.pos === 'other' || !['A1', 'A2'].includes(info.cefr) || STOPWORDS.has(info.lemma) || INTERJECTIONS.has(form)) continue;
    const g = byLemma.get(info.lemma) ?? { info, forms: [], count: 0 };
    g.forms.push(form);
    g.count += count;
    byLemma.set(info.lemma, g);
  }
  return [...byLemma.values()].sort((a, b) => b.count - a.count);
}

/** Starter meanings the model got wrong, doubled ("ahí" = "orada,
 *  orada"; "claro", which the films say as "¡Claro!", as "açık, net") or
 *  gave without how the films use the word: "tener que", "creo que",
 *  "espero que", "lo siento", "muy listo". */
export const STARTER_TR_OVERRIDES: Record<string, string> = {
  ahí: 'orada', claro: 'tabii, açık', pasar: 'geçmek, olmak',
  tener: 'sahip olmak, (que) zorunda olmak', creer: 'sanmak, inanmak', esperar: 'beklemek, ummak',
  sentir: 'hissetmek, (lo siento) üzgünüm', listo: 'hazır, zeki',
};
