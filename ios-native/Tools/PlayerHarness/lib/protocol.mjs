// Adapter between the harness tests and the app's Swift <-> JS player
// protocol. Tests express behaviour ("load clip B", "the app was told the
// clip ended"); this file maps that onto whatever the page actually speaks.
//
// PROTOCOL v2 (EnglishLearning/Core/Player/PlayerProtocol.swift):
//   Swift -> JS: window.__player&&window.__player.exec(<json>) with `type` =
//     load{videoId,start,end|null,autoplay,loop} | play | pause | seek{t} |
//     setBounds{start,end|null,loop} | setRate{rate} | setMuted{muted};
//     window.__player.destroy() on teardown.
//   JS -> Swift: postMessage({kind, ...}) with `kind` = bridge | ready |
//     time{t,playing} | state{s} | clipEnd{t} | error{code}
//   One page serves the player's whole lifetime: the next clip is a `load`
//   command, and the page itself enforces the clip window (loop / clipEnd).
//
// The page is the one the app builds (`YouTubeEmbedHTML.make(source:rate:muted:)`),
// printed by the `embed-html` tool. It is built once per test process:
//   EMBED_HTML_BIN       use this prebuilt binary as is
//   SWIFT_BIN            swift executable (default: `swift` on PATH)
//   SWIFT_SCRATCH_PATH   SwiftPM scratch path (default: ios-native/.build)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../../..'); // ios-native/
const swift = process.env.SWIFT_BIN || 'swift';
const scratchPath = process.env.SWIFT_SCRATCH_PATH || path.join(packageRoot, '.build');

let embedHtmlBin = process.env.EMBED_HTML_BIN || null;

function embedHtml() {
  if (embedHtmlBin) return embedHtmlBin;
  const pkg = ['--package-path', packageRoot, '--scratch-path', scratchPath];
  // Build output goes to stderr so it stays out of the test reporter.
  execFileSync(swift, ['build', '-q', ...pkg, '--product', 'embed-html'], { stdio: ['ignore', 2, 2] });
  const binDir = execFileSync(swift, ['build', ...pkg, '--show-bin-path'], { stdio: ['ignore', 'pipe', 2] })
    .toString().trim();
  embedHtmlBin = path.join(binDir, 'embed-html');
  return embedHtmlBin;
}

/** HTML exactly as the app builds it for its WKWebView. */
export function playerHTML({ videoId, start, end = null, autoplay = true, loop = false, rate = 1, muted = false }) {
  const args = [videoId, String(start), end == null ? 'none' : String(end), autoplay ? '1' : '0'];
  if (loop) args.push('--loop');
  if (rate !== 1) args.push('--rate', String(rate));
  if (muted) args.push('--muted');
  return execFileSync(embedHtml(), args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

/** Normalizes a raw bridge message into {type, ...}. */
export function normalize(msg) {
  switch (msg.kind) {
    case 'bridge': return { type: 'bridge', at: msg.at };
    case 'ready': return { type: 'ready', at: msg.at };
    case 'time': return { type: 'time', t: Number(msg.t), playing: msg.playing === true, at: msg.at };
    case 'state': return { type: 'state', state: Number(msg.s), at: msg.at };
    case 'clipEnd': return { type: 'clipEnd', t: Number(msg.t), at: msg.at };
    case 'error': return { type: 'error', code: Number(msg.code), at: msg.at };
    default: return { type: 'other', raw: msg, at: msg.at };
  }
}

/** The statement `PlayerCommand.javaScript` produces for `payload`. */
export function commandJS(payload) {
  return `window.__player&&window.__player.exec(${JSON.stringify(payload)});`;
}

/** Commands, phrased the way the Swift side issues them (evaluateJavaScript). */
export function driver(page) {
  const run = (js) => page.evaluate((code) => {
    try { (0, eval)(code); return null; } catch (e) { return String(e); }
  }, js);
  return {
    play: () => run(commandJS({ type: 'play' })),
    pause: () => run(commandJS({ type: 'pause' })),
    seek: (t) => run(commandJS({ type: 'seek', t })),
    setRate: (rate) => run(commandJS({ type: 'setRate', rate })),
    setMuted: (muted) => run(commandJS({ type: 'setMuted', muted })),
    load: ({ videoId, start, end = null, autoplay = true, loop = false }) =>
      run(commandJS({ type: 'load', videoId, start, end, autoplay, loop })),
    setBounds: ({ start, end = null, loop = false }) => run(commandJS({ type: 'setBounds', start, end, loop })),
    destroy: () => run('window.__player&&window.__player.destroy();'),
    /** Seek + play issued back-to-back in one turn, as the app does. */
    seekAndPlay: (t) => run(commandJS({ type: 'seek', t }) + commandJS({ type: 'play' })),
    supportsLoop: true,
  };
}
