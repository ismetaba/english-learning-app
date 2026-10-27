// Finds candidate Spanish scenes for check-candidates.ts: searches YouTube
// for Latin American dubbed scenes of the given films and keeps the ones
// worth measuring. A keeper is a 1-8 minute scene (not a song, trailer,
// Spain dub or full movie) that YouTube has Spanish auto captions for,
// since subtitles are timed against those (lib/lines.ts), and that may be
// embedded. Videos already screened (any candidates*.json next to this
// script) are skipped.
//
//   npx tsx scripts/es/find-candidates.ts films.txt out.json [perFilm]
//
// films.txt: one film title per line, as it is known in Latin America.
// Requests are spaced out: YouTube answers a burst with HTTP 429.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [filmsPath, outPath, perFilmArg] = process.argv.slice(2);
if (!filmsPath || !outPath) {
  console.error('usage: find-candidates.ts films.txt out.json [perFilm]');
  process.exit(1);
}
const perFilm = Number(perFilmArg ?? 3);
const films = fs.readFileSync(filmsPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);

const REJECT = /castellano|españa|espana|tr[áa]iler|canci[óo]n|song|letra|lyrics|completa|full movie|reacci[óo]n|#shorts|karaoke|fandub|doblaje de|parte \d+\/\d+/i;
const pause = (ms: number) => execFileSync('sleep', [String(ms / 1000)]);

function ytdlp(args: string[]): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync('yt-dlp', ['--no-warnings', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr ?? e);
      if (!/429/.test(msg)) return '';
      pause(20000 * (attempt + 1));
    }
  }
  return '';
}

const screened = new Set(
  fs.readdirSync(__dirname)
    .filter(f => /^candidates.*\.json$/.test(f))
    .flatMap(f => (JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')) as { youtubeId: string }[]).map(c => c.youtubeId)),
);

const found: { youtubeId: string; kind: string; title: string; source: string }[] = [];
for (const film of films) {
  const hits = ytdlp(['--flat-playlist', '--print', '%(id)s\t%(duration)s\t%(channel)s\t%(title)s',
    `ytsearch15:${film} escena español latino`])
    .split('\n').map(l => l.split('\t')).filter(r => r.length >= 4)
    .map(([id, dur, channel, title]) => ({ id, dur: Number(dur), channel, title }))
    .filter(h => h.dur >= 60 && h.dur <= 480 && !REJECT.test(h.title) && !screened.has(h.id))
    .filter(h => /latino/i.test(h.title) || /latinoam|m[ée]xico/i.test(h.channel));
  let kept = 0;
  for (const h of hits) {
    if (kept >= perFilm) break;
    pause(2500);
    const subs = ytdlp(['--list-subs', '--skip-download', `https://www.youtube.com/watch?v=${h.id}`]);
    if (!/^es-orig\b/m.test(subs)) continue;
    pause(1500);
    const embeddable = ytdlp(['--print', '%(playable_in_embed)s', '--skip-download', `https://www.youtube.com/watch?v=${h.id}`]).trim();
    if (embeddable === 'False') continue;
    found.push({ youtubeId: h.id, kind: 'animation', title: `${film} — ${h.title}`, source: h.channel });
    screened.add(h.id);
    kept++;
  }
  console.log(`${film}: ${kept} kept of ${hits.length} scene hits`);
  pause(3000);
}
fs.writeFileSync(outPath, JSON.stringify(found, null, 2));
console.log(`${found.length} candidates → ${outPath}`);
