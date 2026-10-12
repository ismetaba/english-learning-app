import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerHTML, normalize, driver } from './protocol.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeApi = fs.readFileSync(path.join(here, '..', 'fake-iframe-api.js'), 'utf8');
export const REAL_YT = process.env.HARNESS_REAL_YT === '1';
const PAGE_URL = 'https://www.youtube-nocookie.com/__harness';

export const State = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

/**
 * Opens the app's player page for `clip` in a fresh context. The WKWebView
 * script-message bridge is emulated by recording every postMessage with a
 * page-clock timestamp.
 */
export async function openPlayer(browser, clip, { fakeYT = {} } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((knobs) => {
    window.__fakeYT = knobs;
    window.__msgs = [];
    window.webkit = { messageHandlers: { ytBridge: {
      postMessage: (m) => window.__msgs.push(Object.assign({}, m, { at: performance.now() })),
    } } };
  }, fakeYT);
  if (!REAL_YT) {
    await page.route('https://www.youtube.com/iframe_api', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: fakeApi }));
  }
  const html = playerHTML(clip);
  await page.route(PAGE_URL, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(PAGE_URL);
  const d = driver(page);
  const events = async () => (await page.evaluate(() => window.__msgs)).map(normalize);
  const fake = (expr) => page.evaluate((e) => {
    const p = (window.__fakePlayers || []).slice(-1)[0];
    return p ? (0, eval)(`(function(p){ return ${e}; })`)(p) : undefined;
  }, expr);
  return {
    page, driver: d, events, fake,
    now: () => page.evaluate(() => performance.now()),
    waitFor: (pred, timeoutMs, label) => waitFor(async () => pred(await events()), timeoutMs, label),
    close: () => context.close(),
  };
}

export async function waitFor(check, timeoutMs, label = 'condition') {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Time events received after the player first reported PLAYING. */
export function timesWhilePlaying(evts) {
  const firstPlaying = evts.findIndex((e) => e.type === 'state' && e.state === State.PLAYING);
  if (firstPlaying < 0) return [];
  return evts.slice(firstPlaying).filter((e) => e.type === 'time');
}

/** True when the app-side sequencer would treat the clip as finished. */
export function appSawClipEnd(evts, end) {
  return evts.some((e) => e.type === 'clipEnd' || (e.type === 'time' && e.t >= end - 0.05));
}
