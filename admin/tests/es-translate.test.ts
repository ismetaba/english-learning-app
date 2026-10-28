// Spanish → Turkish translations, glosses and starter words. An audit of
// the live set (250 lines read in context) found errors the pipeline set
// up, not the model; each test below is one of them, with the line from
// the live data:
//   - a sentence split over two lines was translated half by half: the
//     first half took in the second ("Un día, Simba, el sol se pondrá en
//     mi" → the whole sentence, which the next line repeated), or the
//     negation was lost ("…y no | han agregado el parpadeo" → "eklemişler");
//   - broken replies were kept and cached, so every rebuild replayed them:
//     "Hasta hasta hasta…" ×300 (cut off at the token limit), the model's
//     "**Note on translation choice:**", the context lines copied with
//     " / ", a dialogue dash, and an opening quote stripped from
//     `"Gelmeyecek" derken…`;
//   - one gloss per word, taken from the first sentence it appeared in:
//     "la" as an article only ("La escondí" = onu sakladım), "siento" as
//     "hissediyorum" (mostly "Lo siento" = üzgünüm), "listo" as "hazır"
//     ("muy listo" = zeki);
//   - starter words linked to interjections: oír to "¡Oye!", ir to "¡Vaya!".
//
//   npx tsx --test tests/es-translate.test.ts
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTranslation,
  sentenceGroups,
  parseParts,
  translateLines,
  glossContexts,
  groupStarters,
  GLOSS_OVERRIDES,
  STARTER_TR_OVERRIDES,
  TRANSLATION_OVERRIDES,
  type TranslateLine,
} from '../scripts/es/lib/translate';
import { chat } from '../scripts/es/lib/lmstudio';

const line = (id: number, text: string, clip_id = 1): TranslateLine => ({ id, text, clip_id, movie_title: 'Película' });

// ── Replies ──────────────────────────────────────────────────────────

test('a looping reply is rejected', () => {
  const loop = Array(300).fill('Hasta').join(' ');
  assert.equal(cleanTranslation(loop, 'Ahí llevan a los peces enfermos.'), null);
});

test('the model’s own notes are rejected', () => {
  const raw = 'Ve sonunda, tüm hayatım boyunca\n\n***\n\n**Note on translation choice:** Since the sentence is cut…';
  assert.equal(cleanTranslation(raw, 'Ahora ha llegado el momento para el que'), null);
});

test('context lines copied into the reply are rejected', () => {
  const raw = 'Bu yerin en iyi yanı ne biliyor musun? / Ne? / Hiç sıra beklemek zorunda kalmamamız.';
  assert.equal(cleanTranslation(raw, 'Que nunca tenemos que esperar menta.'), null);
});

test('a dialogue dash is dropped, quotes are kept unless they wrap the whole reply', () => {
  assert.equal(cleanTranslation('— Ne?', '¿Qué?'), 'Ne?');
  assert.equal(cleanTranslation('- Tamam.', 'Está bien.'), 'Tamam.');
  assert.equal(cleanTranslation('"Gelmeyecek" derken ne demek istiyorsunuz?', '¿A qué se refiere con que no vendrá?'),
    '"Gelmeyecek" derken ne demek istiyorsunuz?');
  assert.equal(cleanTranslation('"Merhaba."', 'Hola.'), 'Merhaba.');
  assert.equal(cleanTranslation('  Peki.  ', 'Bueno.'), 'Peki.');
});

describeChat();
function describeChat() {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  test('a reply cut off at the token limit counts as no reply', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: 'Hasta hasta hasta hasta' } }],
    }))) as typeof fetch;
    assert.equal(await chat('system', 'user'), null);
  });
}

// ── Sentences split over lines ───────────────────────────────────────

test('lines that end mid-sentence are grouped with the line that ends it', () => {
  const lines = [
    line(1, 'Un día, Simba, el sol se pondrá en mi'),
    line(2, 'reinado y saldrá contigo siendo el nuevo rey.'),
    line(3, '¿Qué?'),
    line(4, 'Le faltan los efectos de sonido y no'),
    line(5, 'han agregado el parpadeo en mi ojo.'),
    line(6, 'Y entonces', 1),
    line(7, 'Otra escena.', 2),                      // another scene: never joined
  ];
  assert.deepEqual(sentenceGroups(lines), [[0, 1], [2], [3, 4], [5], [6]]);
});

test('a group never runs past three lines', () => {
  const lines = [line(1, 'uno'), line(2, 'dos'), line(3, 'tres'), line(4, 'cuatro'), line(5, 'cinco.')];
  assert.deepEqual(sentenceGroups(lines), [[0, 1, 2], [3, 4]]);
});

test('a group reply needs exactly one part per line', () => {
  assert.deepEqual(parseParts('["Ses efektleri eksik ve", "göz kırpmamı eklememişler."]', 2),
    ['Ses efektleri eksik ve', 'göz kırpmamı eklememişler.']);
  assert.deepEqual(parseParts('```json\n["a", "b"]\n```', 2), ['a', 'b']);
  assert.deepEqual(parseParts('{"parts": ["a", "b"]}', 2), ['a', 'b']);
  assert.equal(parseParts('["a"]', 2), null);
  assert.equal(parseParts('["a", ""]', 2), null);
  assert.equal(parseParts('not json', 2), null);
  assert.equal(parseParts(null, 2), null);
});

/** A model stand-in: answers by what it is asked, and records each ask. */
function fakeModel(answer: (user: string, nth: number) => string | null) {
  const asks: string[] = [];
  const ask = async (_system: string, user: string) => {
    asks.push(user);
    return answer(user, asks.length);
  };
  return { ask, asks };
}

test('the two halves of a sentence are translated together, each line gets its part', async () => {
  const lines = [line(1, 'Le faltan los efectos de sonido y no'), line(2, 'han agregado el parpadeo en mi ojo.')];
  const model = fakeModel(user =>
    user.includes('Le faltan') && user.includes('han agregado')
      ? '["Ses efektleri eksik ve", "gözümdeki kırpmayı eklememişler."]'
      : 'eklemişler.');
  const out = await translateLines(lines, model.ask, new Map());
  assert.equal(out.get(1), 'Ses efektleri eksik ve');
  assert.equal(out.get(2), 'gözümdeki kırpmayı eklememişler.');
  for (const a of model.asks) {
    assert.ok(!(a.includes('Le faltan') !== a.includes('han agregado')), `a half was asked alone: ${a}`);
  }
});

test('a broken reply is asked again and never cached', async () => {
  const lines = [line(1, 'Ahí llevan a los peces enfermos.')];
  const cache = new Map<string, string>();
  const model = fakeModel((_u, nth) => nth === 1 ? Array(300).fill('Hasta').join(' ') : 'Hasta balıkları oraya götürüyorlar.');
  const out = await translateLines(lines, model.ask, cache);
  assert.equal(out.get(1), 'Hasta balıkları oraya götürüyorlar.');
  assert.ok(![...cache.values()].some(v => v.startsWith('Hasta hasta')), 'the loop was cached');
});

test('a broken reply already in the cache is asked again', async () => {
  const lines = [line(1, 'Que nunca tenemos que hacer fila.')];
  const cache = new Map<string, string>();
  await translateLines(lines, fakeModel(() => 'Hiç sıra beklemek zorunda kalmamamız.').ask, cache);
  for (const k of cache.keys()) cache.set(k, 'Ne? / Hiç sıra beklemek zorunda kalmamamız.');
  const model = fakeModel(() => 'Hiç sıra beklemek zorunda kalmamamız.');
  const out = await translateLines(lines, model.ask, cache);
  assert.equal(out.get(1), 'Hiç sıra beklemek zorunda kalmamamız.');
  assert.equal(model.asks.length, 1);
});

test('a good reply is cached and not asked again', async () => {
  const lines = [line(1, '¿Qué?')];
  const cache = new Map<string, string>();
  await translateLines(lines, fakeModel(() => 'Ne?').ask, cache);
  const again = fakeModel(() => 'Ne?');
  const out = await translateLines(lines, again.ask, cache);
  assert.equal(out.get(1), 'Ne?');
  assert.equal(again.asks.length, 0);
});

// The first build with the fixes left 4 of 6,704 lines without Turkish:

test('a sentence that repeats itself across its lines keeps its parts', async () => {
  // "…ultra delgadas, ultra delgadas," | "ultra delgadas." (Red): the second
  // part is inside the first because the Spanish is, not because the first
  // half took in the second.
  const lines = [
    line(1, 'Clásicas, nocturnas, delgadas, ultra delgadas, ultra delgadas, ultra delgadas,'),
    line(2, 'ultra delgadas.'),
  ];
  const model = fakeModel(() =>
    '{"sentence": "Klasik, gece, ince, ultra ince, ultra ince, ultra ince, ultra ince.", ' +
    '"parts": ["Klasik, gece, ince, ultra ince, ultra ince, ultra ince,", "ultra ince."]}');
  const out = await translateLines(lines, model.ask, new Map());
  assert.equal(out.get(1), 'Klasik, gece, ince, ultra ince, ultra ince, ultra ince,');
  assert.equal(out.get(2), 'ultra ince.');
});

test('a line the model keeps answering with its context still gets its Turkish', async () => {
  // "Que nunca tenemos que esperar menta." answers the question before it;
  // with that exchange in view the model translates all of it, every time.
  const lines = [
    line(1, '¿Sabes qué es lo bueno de este lugar?'),
    line(2, '¿Qué?'),
    line(3, 'Que nunca tenemos que esperar menta.'),
  ];
  const model = fakeModel(user => {
    if (!user.includes('LINE: Que nunca')) return user.includes('LINE: ¿Qué?') ? 'Ne?' : 'Burada en iyi şey ne biliyor musun?';
    return user.includes('¿Qué?')
      ? 'Bu yerin en iyi yanı ne biliyor musun? / Ne?\nHiç sıra beklemek zorunda kalmamamız.'
      : 'Hiç sıra beklemek zorunda kalmamamız.';
  });
  const out = await translateLines(lines, model.ask, new Map());
  assert.equal(out.get(3), 'Hiç sıra beklemek zorunda kalmamamız.');
});

test('a hand correction wins and is not asked', async () => {
  // The model loops on "hasta" (sick) in this line; the audit's corrections
  // of wrong meanings are kept by line text.
  assert.equal(TRANSLATION_OVERRIDES['Ahí llevan a los peces enfermos.'], 'Hasta balıkları oraya götürüyorlar.');
  assert.equal(TRANSLATION_OVERRIDES['Los juguetes podemos ver todo.'], 'Biz oyuncaklar her şeyi görebiliriz.');
  const lines = [line(1, 'Oye, tu amiga será llevada a cuarentena.'), line(2, 'Ahí llevan a los peces enfermos.')];
  const model = fakeModel(() => 'Hey, arkadaşın karantinaya alınacak.');
  const out = await translateLines(lines, model.ask, new Map());
  assert.equal(out.get(2), 'Hasta balıkları oraya götürüyorlar.');
  assert.ok(model.asks.every(a => !a.includes('LINE: Ahí llevan')), 'the corrected line was asked');
});

// ── Glosses ──────────────────────────────────────────────────────────

test('function words carry both their senses', () => {
  assert.match(GLOSS_OVERRIDES.la, /onu/);
  assert.match(GLOSS_OVERRIDES.los, /onları/);
  assert.match(GLOSS_OVERRIDES.las, /onları/);
  assert.match(GLOSS_OVERRIDES.siento, /üzgünüm/);
  assert.match(GLOSS_OVERRIDES.listo, /zeki/);
});

test('a word is glossed from several different sentences, not the first one', () => {
  const rows = [
    ...Array(10).fill({ word: 'siento', text: 'Lo siento.' }),
    { word: 'Siento', text: 'Siento que algo pasa.' },
    { word: 'siento', text: 'Me siento bien.' },
    { word: 'siento', text: 'Lo siento mucho, amigo.' },
  ];
  const ctx = glossContexts(rows).get('siento')!;
  assert.ok(ctx.length >= 3 && ctx.length <= 5, `${ctx.length} sentences`);
  assert.equal(new Set(ctx).size, ctx.length, 'sentences repeat');
  assert.ok(ctx.includes('Siento que algo pasa.') && ctx.includes('Me siento bien.'), ctx.join(' | '));
});

// ── Starter words ────────────────────────────────────────────────────

test('interjections do not count as their verb', () => {
  const info = (lemma: string) => ({ lemma, pos: 'verb', tr: '-', cefr: 'A1' });
  const groups = groupStarters([
    { form: 'oye', count: 116, info: info('oír') },
    { form: 'oiga', count: 9, info: info('oír') },
    { form: 'voy', count: 40, info: info('ir') },
    { form: 'vaya', count: 13, info: info('ir') },
    { form: 'siento', count: 25, info: info('sentir') },
  ]);
  const byLemma = new Map(groups.map(g => [g.info.lemma, g.forms]));
  assert.equal(byLemma.has('oír'), false);
  assert.deepEqual(byLemma.get('ir'), ['voy']);
  assert.deepEqual(byLemma.get('sentir'), ['siento']);
});

test('starter meanings cover how the films use the word', () => {
  assert.match(STARTER_TR_OVERRIDES.tener, /zorunda/);
  assert.match(STARTER_TR_OVERRIDES.esperar, /ummak/);
  assert.match(STARTER_TR_OVERRIDES.sentir, /üzgünüm/);
  assert.match(STARTER_TR_OVERRIDES.creer, /sanmak/);
  assert.match(STARTER_TR_OVERRIDES.listo, /zeki/);
});
