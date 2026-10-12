// Adapter between the harness tests and the app's Swift <-> JS player
// protocol. Tests express behaviour ("load clip B", "the app was told the
// clip ended"); this file maps that onto whatever the page actually speaks.
//
// PROTOCOL v1 (app as of 1.0.1):
//   Swift -> JS: window.__cmd({type:'play'|'pause'|'seek'|'reload'|'setSpeed'|'setMuted'|'loop', ...})
//   JS -> Swift: {kind:'ready'|'time'|'state'|'ended'|'error', data}
//   The page is generated once per mounted view; later clip changes can only
//   send 'reload', which replays the clip baked into the page.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../../..'); // ios-native/
const swift = process.env.SWIFT_BIN || 'swift';

/** HTML exactly as the app builds it for its WKWebView. */
export function playerHTML({ videoId, start, end = null, autoplay = true }) {
  return execFileSync(swift, [
    'run', '-q', '--package-path', packageRoot, 'embed-html',
    videoId, String(start), end == null ? 'none' : String(end), autoplay ? '1' : '0',
  ], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

/** Normalizes a raw bridge message into {type, ...}. */
export function normalize(msg) {
  switch (msg.kind) {
    case 'ready': return { type: 'ready', at: msg.at };
    case 'time': return { type: 'time', t: Number(msg.data), at: msg.at };
    case 'state': return { type: 'state', state: Number(msg.data), at: msg.at };
    case 'ended': return { type: 'clipEnd', at: msg.at };
    case 'error': return { type: 'error', code: Number(msg.data), at: msg.at };
    default: return { type: 'other', raw: msg, at: msg.at };
  }
}

/** Commands, phrased the way the Swift side issues them (evaluateJavaScript). */
export function driver(page) {
  const run = (js) => page.evaluate((code) => {
    try { (0, eval)(code); return null; } catch (e) { return String(e); }
  }, js);
  return {
    play: () => run("window.__cmd({ type: 'play' });"),
    pause: () => run("window.__cmd({ type: 'pause' });"),
    seek: (t) => run(`window.__cmd({ type: 'seek', t: ${t} });`),
    setRate: (r) => run(`window.__cmd({ type: 'setSpeed', r: ${r} });`),
    setMuted: (m) => run(`window.__cmd({ type: 'setMuted', m: ${m} });`),
    /** v1 has no way to hand the page a new clip: the app sends 'reload'. */
    load: (_clip) => run("window.__cmd({ type: 'reload' });"),
    /** Seek + play issued back-to-back in one turn, as the app does. */
    seekAndPlay: (t) => run(`window.__cmd({ type: 'seek', t: ${t} }); window.__cmd({ type: 'play' });`),
    supportsLoop: false,
  };
}
