// Reads a database through the real v1 route handlers the way the app's
// Spanish mode does, and reports what a learner would get: the set and
// its scenes, scenes per pattern, the vocab feed, glosses.
//
//   DATABASE_PATH=<copy of the db> npx tsx scripts/es/check-api.ts
import { NextRequest } from 'next/server';
import { SPANISH_PATTERN_IDS } from '../../lib/pattern-filters';

async function call(route: string, url: string, params: Record<string, string> = {}) {
  const { GET } = await import(`../../app/api/v1/${route}/route`);
  const res: Response = await GET(new NextRequest(`http://localhost${url}`), { params: Promise.resolve(params) });
  if (res.status !== 200) throw new Error(`${url} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  const sets = await call('video-sets', '/api/v1/video-sets?lang=es');
  for (const s of sets) {
    console.log(`set ${s.id} "${s.title_tr}": ${s.videos.length} videos`);
    for (const v of s.videos) {
      console.log(`  ${v.id.padEnd(44)} ${String(v.total_lines).padStart(3)} lines, ${v.tagged_lines} tagged, ` +
        `wpm ${v.wpm == null ? '—' : Math.round(v.wpm)}, ${v.starter_words.length} starters`);
    }
  }
  const english = await call('video-sets', '/api/v1/video-sets');
  console.log(`English sets without ?lang: ${english.map((s: { id: string }) => s.id).join(', ') || '(none)'}`);

  const first = sets[0]?.videos[0];
  if (first) {
    const clips = await call('poc-videos/[id]/clips', `/api/v1/poc-videos/${first.id}/clips`, { id: first.id });
    const line = clips[0].lines.find((l: { words: unknown[] }) => l.words.length >= 4) ?? clips[0].lines[0];
    console.log(`\nclip of ${first.id}: ${clips.length} clip(s), ${clips[0].lines.length} lines, ` +
      `${clips[0].endTime - clips[0].startTime | 0}s`);
    console.log(`  "${line.text}" → ${line.translationTr}`);
    console.log('  ' + line.words.map((w: { word: string; translationTr: string | null }) => `${w.word}=${w.translationTr ?? '∅'}`).join('  '));
  }

  console.log('\nscenes per pattern:');
  for (const p of SPANISH_PATTERN_IDS) {
    const r = await call('patterns/[patternId]/scenes', `/api/v1/patterns/${p}/scenes?limit=300`, { patternId: p });
    console.log(`  ${p.padEnd(24)} ${String(r.total).padStart(3)}  e.g. ${r.items.slice(0, 2).map((i: { text: string }) => `"${i.text}"`).join(', ')}`);
  }

  const starters = sets[0]?.videos.flatMap((v: { starter_words: { id: string }[] }) => v.starter_words.map(w => w.id)) ?? [];
  const pool = [...new Set(starters)].slice(0, 6) as string[];
  const feed = await call('vocab-feed', `/api/v1/vocab-feed?lang=es&discovery=0&ids=${pool.join(',')}`);
  console.log(`\nvocab feed for ${pool.join(', ')}: ${feed.total} cards`);
  if (pool[0]) {
    const ctx = await call('starter-words/[id]/contexts', `/api/v1/starter-words/${pool[0]}/contexts`, { id: pool[0] });
    console.log(`  ${ctx.word} (${ctx.translationTr}): ${ctx.contextCount} contexts, e.g. "${ctx.contexts[0]?.text}"`);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
