// Behavioural contract of the app's YouTube player page (the HTML/JS that
// runs inside the WKWebView). Each test describes something a learner
// would notice if it broke: the video and the karaoke drifting apart, a
// clip that never advances, a reel that never starts, a black screen.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  launch, openPlayer, sleep, State, timesWhilePlaying, appSawClipEnd, REAL_YT,
} from '../lib/harness.mjs';

const skip = REAL_YT ? 'fake-YouTube contract test (uses synthetic video ids)' : false;
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

test('starts at the exact fractional clip start, not the floored second', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 10.6, end: 14.7, autoplay: true });
  try {
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'first tick while playing');
    const first = timesWhilePlaying(await p.events())[0].t;
    assert.ok(first >= 10.45 && first <= 10.95,
      `first reported time while playing was ${first}; expected ≈10.6 (subtitles are timed to the millisecond)`);
  } finally { await p.close(); }
});

test('tells the app when a clip with a fractional end finishes (no stall at the end)', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 10.6, end: 14.7, autoplay: true });
  try {
    await p.waitFor((e) => appSawClipEnd(e, 14.7), 8000, 'clip end signal the app can act on');
    const evts = await p.events();
    const maxT = Math.max(...evts.filter((e) => e.type === 'time').map((e) => e.t));
    assert.ok(maxT >= 14.5, `playback stopped at ${maxT}s, before the clip's last words (end 14.7)`);
  } finally { await p.close(); }
});

test('reports the playhead at least every ~100ms while playing', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 5, end: null, autoplay: true });
  try {
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'playback');
    await sleep(2500);
    const ticks = timesWhilePlaying(await p.events());
    const gaps = ticks.slice(1).map((e, i) => e.at - ticks[i].at).sort((a, b) => a - b);
    const p90 = gaps[Math.floor(gaps.length * 0.9)];
    assert.ok(p90 <= 130, `90th percentile tick gap ${p90.toFixed(0)}ms — words last ~160ms (median), so ticks must be denser`);
  } finally { await p.close(); }
});

test('a play command sent before the YouTube player is ready is not lost', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 3.2, end: null, autoplay: false }, { fakeYT: { readyDelayMs: 600 } });
  try {
    await p.driver.play();
    await p.waitFor((e) => e.some((x) => x.type === 'state' && x.state === State.PLAYING), 4000,
      'PLAYING after an early play command (reel that became visible while still loading)');
  } finally { await p.close(); }
});

test('loading the next clip switches to its video and time window', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 5.25, end: 30, autoplay: true });
  try {
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'clip A playing');
    const before = (await p.events()).length;
    await p.driver.load({ videoId: 'vidB', start: 42.35, end: 47.0, autoplay: true });
    await p.waitFor((e) => e.slice(before).some((x) => x.type === 'time' && x.t >= 42.2 && x.t <= 47.1), 4000,
      'time inside clip B window');
    assert.equal(await p.fake('p.getVideoData().video_id'), 'vidB', 'player is still showing the previous video');
  } finally { await p.close(); }
});

test('the chosen playback speed survives loading the next clip', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 5, end: 30, autoplay: true });
  try {
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'clip A playing');
    await p.driver.setRate(0.75);
    await sleep(200);
    await p.driver.load({ videoId: 'vidB', start: 40, end: 50, autoplay: true });
    await sleep(1200);
    assert.equal(await p.fake('p.getPlaybackRate()'), 0.75, 'speed snapped back to 1× after the clip change');
  } finally { await p.close(); }
});

test('seek and play issued together both take effect', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 5, end: null, autoplay: true });
  try {
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'playing');
    await p.driver.pause();
    await sleep(300);
    const before = (await p.events()).length;
    await p.driver.seekAndPlay(20.5);
    await p.waitFor((e) => e.slice(before).some((x) => x.type === 'time' && x.t >= 20.4 && x.t <= 21.8), 2500,
      'playing from the tapped line');
    assert.equal(await p.fake('p.getPlayerState()'), State.PLAYING);
  } finally { await p.close(); }
});

test('a looping sentence window wraps without stalling or drifting', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'vidA', start: 2, end: null, autoplay: true });
  try {
    assert.ok(p.driver.supportsLoop, 'page has no native loop window; the app emulates it from late ticks');
    await p.waitFor((e) => timesWhilePlaying(e).length > 0, 5000, 'playing');
    const before = (await p.events()).length;
    await p.driver.load({ videoId: 'vidC', start: 20.5, end: 22.0, autoplay: true, loop: true });
    await sleep(5000);
    const ts = (await p.events()).slice(before).filter((e) => e.type === 'time').map((e) => e.t);
    const settled = ts.slice(ts.findIndex((t) => t >= 20.3 && t <= 22.1));
    assert.ok(settled.length > 10, 'no ticks inside the loop window');
    assert.ok(settled.every((t) => t >= 20.3 && t <= 22.15), `tick outside the loop window: ${settled.find((t) => t < 20.3 || t > 22.15)}`);
    const wraps = settled.slice(1).filter((t, i) => t < settled[i] - 0.5).length;
    assert.ok(wraps >= 2, `expected ≥2 wraps in 5s of a 1.5s loop, saw ${wraps}`);
  } finally { await p.close(); }
});

test('an unplayable video surfaces an error instead of a silent black frame', { skip }, async () => {
  const p = await openPlayer(browser, { videoId: 'BLOCKED0001', start: 0, end: 20, autoplay: true });
  try {
    await p.waitFor((e) => e.some((x) => x.type === 'error' && x.code === 150), 3000, 'error 150');
    const errAt = (await p.events()).find((x) => x.type === 'error').at;
    await sleep(800);
    const late = (await p.events()).filter((x) => x.type === 'time' && x.at > errAt + 50);
    assert.equal(late.length, 0, `bridge kept streaming ${late.length} time ticks (t=${late[0]?.t}) after the error, resetting the karaoke to 0`);
  } finally { await p.close(); }
});
