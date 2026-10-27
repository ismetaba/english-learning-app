// Screens candidate Spanish videos before any of them enters the
// database: availability and embedding, then a WhisperX transcript to
// measure how a beginner would experience it (speech rate, sentence
// length, how many ser/estar + adjective scenes it would feed) and to
// flag English narration or Spain-only forms (the track teaches Latin
// American Spanish).
//
//   npx tsx scripts/es/check-candidates.ts scripts/es/candidates.json <work-dir>
//
// Writes <work-dir>/report.json and <work-dir>/report.md. Audio and
// transcripts are cached per video under <work-dir>/<youtubeId>/.
import fs from 'node:fs';
import path from 'node:path';
import { ADJ_AFTER_COPULA, COPULAS_BY_PATTERN, COPULA_INTENSIFIERS } from '../../lib/es-copula';
import { esGlossKey } from '../../lib/word-gloss';
import { audioWav, fetchMeta, oembedOk, transcribe, type WhisperSegment } from './lib/media';

interface Candidate {
  youtubeId: string;
  kind: string;
  title: string;
  source: string;
  startSec?: number;
  maxSec?: number;
}

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'you', 'is', 'are', 'to', 'of', 'this', 'that', 'what', 'with', 'it', 'we', 'i',
]);
/** vosotros forms and other Spain-only markers. */
const PENINSULAR_MARKERS = new Set([
  'vosotros', 'vosotras', 'os', 'sois', 'estáis', 'tenéis', 'habéis', 'queréis', 'podéis', 'vale',
]);

const ADJ = new Set(ADJ_AFTER_COPULA);
const INTENS = new Set(COPULA_INTENSIFIERS);

/** ser/estar + adjective hits per pattern, mirroring the scenes route's
 *  adjacency rule on the transcript's word sequence. */
function copulaScenes(segments: WhisperSegment[]): Record<string, number> {
  const hits: Record<string, number> = {};
  for (const [pattern, forms] of Object.entries(COPULAS_BY_PATTERN)) {
    const copulas = new Set(forms);
    hits[pattern] = segments.filter(seg => {
      const w = seg.words.map(x => esGlossKey(x.word));
      return w.some(
        (t, i) => copulas.has(t) && (ADJ.has(w[i + 1]) || (INTENS.has(w[i + 1]) && ADJ.has(w[i + 2]))),
      );
    }).length;
  }
  return hits;
}

function measure(segments: WhisperSegment[]) {
  const timed = segments.filter(s => s.words.some(w => w.start != null));
  let speechSec = 0;
  let words = 0;
  for (const s of timed) {
    const t = s.words.filter(w => w.start != null && w.end != null);
    speechSec += (t[t.length - 1].end as number) - (t[0].start as number);
    words += s.words.length;
  }
  const tokens = segments.flatMap(s => s.words.map(w => esGlossKey(w.word))).filter(Boolean);
  const lengths = segments.map(s => s.words.length);
  return {
    segments: segments.length,
    words,
    speechMin: +(speechSec / 60).toFixed(1),
    wpm: speechSec > 0 ? Math.round((words / speechSec) * 60) : 0,
    avgWords: lengths.length ? +(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) : 0,
    shortLines: lengths.filter(n => n >= 2 && n <= 8).length,
    untimed: segments.reduce((n, s) => n + s.words.filter(w => w.start == null).length, 0),
    englishShare: +(tokens.filter(t => ENGLISH_MARKERS.has(t)).length / Math.max(1, tokens.length)).toFixed(3),
    peninsular: tokens.filter(t => PENINSULAR_MARKERS.has(t)).length,
    scenes: copulaScenes(segments),
  };
}

async function main() {
  const [listPath, workDir] = process.argv.slice(2);
  if (!listPath || !workDir) {
    console.error('usage: check-candidates.ts <candidates.json> <work-dir>');
    process.exit(1);
  }
  const candidates = JSON.parse(fs.readFileSync(listPath, 'utf8')) as Candidate[];
  const report = [];
  for (const c of candidates) {
    const dir = path.join(workDir, c.youtubeId);
    process.stdout.write(`${c.youtubeId} ${c.title}… `);
    try {
      const meta = fetchMeta(c.youtubeId);
      const embeddable = meta.playableInEmbed && (await oembedOk(c.youtubeId));
      const segments = transcribe(audioWav(c.youtubeId, dir, c.startSec ?? 0, c.maxSec));
      const m = measure(segments);
      report.push({ ...c, ok: true, channel: meta.channel, durationSec: meta.duration, embeddable,
        availability: meta.availability, ageLimit: meta.ageLimit, ...m,
        sample: segments.slice(0, 6).map(s => s.text) });
      console.log(`${m.wpm} wpm, ${m.segments} lines`);
    } catch (e) {
      report.push({ ...c, ok: false, error: String(e).slice(0, 300) });
      console.log('FAILED');
    }
  }
  fs.writeFileSync(path.join(workDir, 'report.json'), JSON.stringify(report, null, 2));

  const rows = report.map(r =>
    'error' in r
      ? `| ${r.title} | ${r.kind} | — | — | — | — | — | hata: ${r.error} |`
      : `| ${r.title} | ${r.kind} | ${r.embeddable ? 'evet' : 'HAYIR'} | ${r.speechMin} dk | ${r.wpm} | ${r.avgWords} | ${Object.values(r.scenes).reduce((a, b) => a + b, 0)} | ${[
          r.englishShare > 0.05 ? `İngilizce %${Math.round(r.englishShare * 100)}` : '',
          r.peninsular > 2 ? `İspanya biçimi ×${r.peninsular}` : '',
        ].filter(Boolean).join(', ')} |`,
  );
  fs.writeFileSync(
    path.join(workDir, 'report.md'),
    ['| Video | Tür | Gömülebilir | Konuşma | wpm | Kelime/satır | ser/estar+sıfat | Uyarı |',
      '|---|---|---|---|---|---|---|---|', ...rows].join('\n') + '\n',
  );
}

main();
