/**
 * Detector: which YouTube videos serving the pattern (kalıplar) routes
 * are no longer playable? Reproduces the bug where the pattern reels
 * shows an "unavailable video" tile.
 *
 * For each distinct `youtube_video_id` whose approved clips would be
 * picked by any of the 4 BE+adjective pattern filters, ping YouTube's
 * oEmbed endpoint. A non-2xx response is the signal that the video is
 * removed/private/region-locked at the platform level — the embedded
 * iframe in CinemaPlayerView will fail the same way.
 *
 * Read-only. Prints a JSON line per unavailable video plus a final
 * summary. The companion script `disable-unavailable-pattern-clips.ts`
 * consumes that list to flip clip status.
 *
 * Run:
 *   cd admin && npx tsx scripts/check-pattern-video-availability.ts
 *
 * Options:
 *   --concurrency=N   parallel HTTP fetches (default 8)
 *   --json            emit a single JSON array instead of per-line logs
 *
 * Mirrors the SQL prefix list in
 * `app/api/v1/patterns/[patternId]/scenes/route.ts` so the detector
 * always tracks the live filter set.
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const CONCURRENCY = (() => {
  const flag = args.find(a => a.startsWith('--concurrency='));
  if (!flag) return 8;
  const n = parseInt(flag.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 8;
})();
const JSON_ONLY = args.includes('--json');

const DB_PATH = process.env.DATABASE_PATH ?? path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH, { readonly: true });

// LIKE prefixes the patterns route uses — keep this list in sync with
// PATTERN_FILTERS in app/api/v1/patterns/[patternId]/scenes/route.ts.
const PREFIXES = [
  'i am ', "i'm ",
  'you are ', "you're ",
  'he is ', 'she is ', 'it is ',
  "he's ", "she's ", "it's ",
  'we are ', 'they are ',
  "we're ", "they're ",
];

function collectPatternVideos(): Array<{
  videoId: string;
  youtubeVideoId: string;
  movieTitle: string;
  title: string;
  sentenceCount: number;
}> {
  const likeClauses = PREFIXES.map(p => {
    const esc = p.replace(/'/g, "''");
    return `LOWER(TRIM(sl.text)) LIKE '${esc}%'`;
  }).join(' OR ');

  return db
    .prepare(
      `SELECT
         v.id           AS videoId,
         v.youtube_video_id AS youtubeVideoId,
         v.movie_title  AS movieTitle,
         v.title        AS title,
         COUNT(DISTINCT sl.id) AS sentenceCount
       FROM subtitle_lines sl
       JOIN clips c  ON c.id = sl.clip_id
       JOIN videos v ON v.id = c.video_id
       WHERE c.status = 'approved'
         AND sl.text IS NOT NULL
         AND length(trim(sl.text)) > 0
         AND sl.translation_tr IS NOT NULL
         AND sl.structure IS NOT NULL
         AND (${likeClauses})
       GROUP BY v.id
       ORDER BY v.movie_title, v.id`,
    )
    .all() as Array<{
    videoId: string;
    youtubeVideoId: string;
    movieTitle: string;
    title: string;
    sentenceCount: number;
  }>;
}

interface AvailabilityResult {
  videoId: string;
  youtubeVideoId: string;
  movieTitle: string;
  title: string;
  sentenceCount: number;
  status: 'ok' | 'unavailable' | 'network_error';
  httpStatus?: number;
  reason?: string;
}

async function checkOne(
  v: ReturnType<typeof collectPatternVideos>[number],
): Promise<AvailabilityResult> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}&format=json`;
  try {
    const res = await fetch(url, {
      // No body, no redirect-follow concerns — oEmbed returns directly.
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { ...v, status: 'ok', httpStatus: res.status };
    }
    // 401 = private, 404 = removed/never-existed. Both are unplayable.
    return {
      ...v,
      status: 'unavailable',
      httpStatus: res.status,
      reason: res.status === 401 ? 'private' : res.status === 404 ? 'removed' : `http ${res.status}`,
    };
  } catch (err) {
    return {
      ...v,
      status: 'network_error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onResult?: (r: R, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const r = await worker(items[i], i);
      results[i] = r;
      if (onResult) onResult(r, i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => pump()));
  return results;
}

async function main() {
  const videos = collectPatternVideos();
  if (!JSON_ONLY) {
    console.error(`[check] ${videos.length} distinct YouTube videos feed the 4 pattern routes`);
    console.error(`[check] checking with concurrency=${CONCURRENCY} via youtube.com/oembed`);
  }

  let done = 0;
  const results = await runWithConcurrency(
    videos,
    checkOne,
    CONCURRENCY,
    r => {
      done += 1;
      if (!JSON_ONLY && (r.status !== 'ok' || done % 25 === 0)) {
        const tag =
          r.status === 'ok' ? 'ok' : r.status === 'unavailable' ? `UNAVAILABLE(${r.reason})` : `ERR(${r.reason?.slice(0, 40)})`;
        console.error(`[${done}/${videos.length}] ${tag}  ${r.youtubeVideoId}  ${r.movieTitle}  (${r.sentenceCount} sentences)`);
      }
    },
  );

  const unavailable = results.filter(r => r.status === 'unavailable');
  const errors = results.filter(r => r.status === 'network_error');

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(unavailable, null, 2) + '\n');
  } else {
    console.error('');
    console.error(`Summary:`);
    console.error(`  ok:           ${results.filter(r => r.status === 'ok').length}`);
    console.error(`  unavailable:  ${unavailable.length}`);
    console.error(`  network err:  ${errors.length}`);
    if (unavailable.length > 0) {
      console.error('');
      console.error(`Unavailable videos:`);
      for (const u of unavailable) {
        console.error(`  - ${u.youtubeVideoId}  [${u.reason}]  ${u.movieTitle} — ${u.title} (${u.sentenceCount} sentences)`);
      }
    }
    if (errors.length > 0) {
      console.error('');
      console.error(`Network errors (re-run to retry):`);
      for (const e of errors) {
        console.error(`  - ${e.youtubeVideoId}  ${e.reason?.slice(0, 80)}`);
      }
    }
    process.stdout.write(JSON.stringify(unavailable, null, 2) + '\n');
  }
}

main().catch(err => {
  console.error('fatal:', err);
  process.exit(1);
});
