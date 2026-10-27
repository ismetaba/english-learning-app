// Records the English responses of the v1 API in-process, so the same
// database can be read by two versions of the code and the outputs
// compared byte for byte. Math.random is seeded before every call, which
// makes the shuffled endpoints (vocab feed, pattern scenes) reproducible.
//
//   DATABASE_PATH=<copy of the db> npx tsx scripts/es/golden.ts <out.json>
//
// Run it from each checkout's admin/ directory against its own copy of
// the database (getDb() migrates the file it opens).
import fs from 'node:fs';
import { NextRequest } from 'next/server';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function call(route: string, url: string, params: Record<string, string> = {}) {
  Math.random = seeded(42);
  const { GET } = await import(`../../app/api/v1/${route}/route`);
  const res: Response = await GET(new NextRequest(`http://localhost${url}`), { params: Promise.resolve(params) });
  return { url, status: res.status, body: await res.text() };
}

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('usage: golden.ts <out.json>');
  const results = [];
  results.push(await call('video-sets', '/api/v1/video-sets'));
  const poc = await call('poc-videos', '/api/v1/poc-videos');
  results.push(poc);
  const videos = (JSON.parse(poc.body) as { id: string }[]).slice(0, 8).map(v => v.id);
  for (const id of videos) results.push(await call('poc-videos/[id]/clips', `/api/v1/poc-videos/${id}/clips`, { id }));
  const ids = 'a2-make,a2-life,a2-try,a2-time,a2-thing';
  results.push(await call('starter-words', `/api/v1/starter-words?ids=${ids}`));
  for (const id of ids.split(',')) {
    results.push(await call('starter-words/[id]/contexts', `/api/v1/starter-words/${id}/contexts`, { id }));
  }
  results.push(await call('vocab-feed', `/api/v1/vocab-feed?ids=${ids}&discovery=1&limit=80`));
  results.push(await call('vocab-feed', `/api/v1/vocab-feed?ids=${ids}&discovery=0&limit=80`));
  for (const p of ['be-adj-i', 'be-adj-you', 'be-adj-hesheIt', 'be-adj-wethey']) {
    results.push(await call('patterns/[patternId]/scenes', `/api/v1/patterns/${p}/scenes?limit=100`, { patternId: p }));
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(results.map(r => `${r.status} ${r.body.length.toString().padStart(8)}  ${r.url}`).join('\n'));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
