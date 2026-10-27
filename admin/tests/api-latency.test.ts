// Latency budget for the public v1 endpoints the iOS app waits on while a
// learner is staring at a spinner. Production (Fly, shared CPU) took 4-60s
// for /poc-videos/{id}/clips; locally the same queries took 2.5-4.2s.
//
// Needs a real database: run with DATABASE_PATH pointing at a COPY of
// data.db (getDb() runs migrations/seeds on open). Skipped otherwise, e.g.
// in CI where data.db is only an LFS pointer.
//
//   cp ../data.db /tmp/api-test.db
//   DATABASE_PATH=/tmp/api-test.db npx tsx --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NextRequest } from 'next/server';

const dbPath = process.env.DATABASE_PATH;
const haveDb = !!dbPath && fs.existsSync(dbPath) && fs.statSync(dbPath).size > 1_000_000;
const skip = haveDb ? false : 'set DATABASE_PATH to a copy of the real data.db';

/** Generous for a dev laptop; the old queries were 5-10x over it. */
const BUDGET_MS = 500;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

async function call(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  url: string,
  params: Record<string, string> = {},
) {
  const res = await handler(new NextRequest(`http://localhost${url}`), { params: Promise.resolve(params) });
  assert.equal(res.status, 200, `${url} → HTTP ${res.status}`);
  return res.json();
}

test('/poc-videos/{id}/clips answers within budget', { skip }, async () => {
  const { GET } = await import('../app/api/v1/poc-videos/[id]/clips/route');
  for (const id of ['elio-first-meet-with-aliens-movie-scene', 'storks-wolves-love-babies', 'beauty-beast-be-guest']) {
    await call(GET as never, `/api/v1/poc-videos/${id}/clips`, { id }); // warm prepared statements / page cache
    const { ms, value } = await timed(() => call(GET as never, `/api/v1/poc-videos/${id}/clips`, { id }));
    assert.ok(Array.isArray(value) && value.length > 0, `${id}: no clips`);
    assert.ok(ms < BUDGET_MS, `${id}: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
  }
});

test('/vocab-feed answers within budget', { skip }, async () => {
  const { GET } = await import('../app/api/v1/vocab-feed/route');
  const url = '/api/v1/vocab-feed?ids=a2-make,a2-life,a2-try,a2-time&discovery=1&limit=80';
  await call(GET as never, url);
  const { ms, value } = await timed(() => call(GET as never, url));
  assert.ok(value.items.length > 0);
  assert.ok(ms < BUDGET_MS, `vocab-feed: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
});

test('/patterns/{id}/scenes answers within budget', { skip }, async () => {
  const { GET } = await import('../app/api/v1/patterns/[patternId]/scenes/route');
  const url = '/api/v1/patterns/be-adj-i/scenes?limit=100';
  await call(GET as never, url, { patternId: 'be-adj-i' });
  const { ms, value } = await timed(() => call(GET as never, url, { patternId: 'be-adj-i' }));
  assert.ok(value.items.length > 0);
  assert.ok(ms < BUDGET_MS, `pattern scenes: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
});

test('/starter-words/{id}/contexts answers within budget', { skip }, async () => {
  const { GET } = await import('../app/api/v1/starter-words/[id]/contexts/route');
  const url = '/api/v1/starter-words/a2-make/contexts';
  await call(GET as never, url, { id: 'a2-make' });
  const { ms, value } = await timed(() => call(GET as never, url, { id: 'a2-make' }));
  assert.ok(value.contexts.length > 0);
  assert.ok(ms < BUDGET_MS, `contexts: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
});

test('/starter-words?ids= answers within budget', { skip }, async () => {
  const { GET } = await import('../app/api/v1/starter-words/route');
  const url = '/api/v1/starter-words?ids=a2-make,a2-life,a2-try,a2-time,a2-thing';
  await call(GET as never, url);
  const { ms, value } = await timed(() => call(GET as never, url));
  assert.ok(Array.isArray(value) && value.length > 0);
  assert.ok(ms < BUDGET_MS, `starter-words: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
});

test('/video-sets and /poc-videos answer within budget', { skip }, async () => {
  for (const path of ['video-sets', 'poc-videos']) {
    const { GET } = await import(`../app/api/v1/${path}/route`);
    await call(GET as never, `/api/v1/${path}`);
    const { ms } = await timed(() => call(GET as never, `/api/v1/${path}`));
    assert.ok(ms < BUDGET_MS, `${path}: ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);
  }
});
