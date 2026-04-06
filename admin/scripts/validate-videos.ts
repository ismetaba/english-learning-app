/**
 * Validate all YouTube videos in the database.
 * Checks: availability, quality (duration, embeddability).
 * Removes clips/videos that are broken or low quality.
 *
 * Usage: npx tsx scripts/validate-videos.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import path from 'path';
import https from 'https';
import http from 'http';

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data.db');
const dryRun = process.argv.includes('--dry-run');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface VideoCheck {
  youtubeId: string;
  videoIds: string[];     // DB video IDs using this YouTube ID
  clipIds: number[];      // clip IDs
  movieTitle: string;
  title: string;
  status: 'ok' | 'unavailable' | 'age_restricted' | 'low_quality' | 'too_short' | 'error';
  reason?: string;
}

function checkYouTube(ytId: string): Promise<{ available: boolean; embeddable: boolean; title: string; duration: number; reason?: string }> {
  return new Promise((resolve) => {
    // Use oEmbed API — simple, no API key needed
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`;

    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({
              available: true,
              embeddable: json.type === 'video',
              title: json.title || '',
              duration: 0, // oEmbed doesn't give duration
            });
          } catch {
            resolve({ available: false, embeddable: false, title: '', duration: 0, reason: 'Parse error' });
          }
        } else if (res.statusCode === 401) {
          resolve({ available: false, embeddable: false, title: '', duration: 0, reason: 'Embedding disabled' });
        } else if (res.statusCode === 403) {
          resolve({ available: false, embeddable: false, title: '', duration: 0, reason: 'Forbidden/age-restricted' });
        } else {
          resolve({ available: false, embeddable: false, title: '', duration: 0, reason: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e: Error) => {
      resolve({ available: false, embeddable: false, title: '', duration: 0, reason: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, embeddable: false, title: '', duration: 0, reason: 'Timeout' });
    });
  });
}

// Also check via noembed for a second opinion
function checkNoembed(ytId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`;

    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(!json.error);
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  // Get unique YouTube video IDs with their DB info
  const rows = db.prepare(`
    SELECT DISTINCT v.youtube_video_id, v.id as video_id, v.title, v.movie_title, c.id as clip_id
    FROM videos v
    JOIN clips c ON c.video_id = v.id
    JOIN clip_structures cs ON cs.clip_id = c.id
    ORDER BY v.movie_title, v.title
  `).all() as any[];

  // Group by YouTube ID
  const byYtId = new Map<string, { videoIds: Set<string>; clipIds: Set<number>; movieTitle: string; title: string }>();
  for (const r of rows) {
    const existing = byYtId.get(r.youtube_video_id) || {
      videoIds: new Set<string>(),
      clipIds: new Set<number>(),
      movieTitle: r.movie_title,
      title: r.title,
    };
    existing.videoIds.add(r.video_id);
    existing.clipIds.add(r.clip_id);
    byYtId.set(r.youtube_video_id, existing);
  }

  console.log(`\n🔍 Validating ${byYtId.size} unique YouTube videos...\n`);

  const results: VideoCheck[] = [];
  let checked = 0;

  for (const [ytId, info] of byYtId) {
    checked++;
    process.stdout.write(`  [${checked}/${byYtId.size}] ${info.movieTitle} — ${info.title} (${ytId})... `);

    const result = await checkYouTube(ytId);

    let status: VideoCheck['status'] = 'ok';
    let reason: string | undefined;

    if (!result.available) {
      // Double-check with noembed
      const noembedOk = await checkNoembed(ytId);
      if (!noembedOk) {
        status = result.reason?.includes('age') || result.reason?.includes('403')
          ? 'age_restricted'
          : 'unavailable';
        reason = result.reason;
      }
    }

    if (status === 'ok') {
      console.log('✅');
    } else {
      console.log(`❌ ${status}: ${reason}`);
    }

    results.push({
      youtubeId: ytId,
      videoIds: [...info.videoIds],
      clipIds: [...info.clipIds],
      movieTitle: info.movieTitle,
      title: info.title,
      status,
      reason,
    });

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  const ok = results.filter(r => r.status === 'ok');
  const bad = results.filter(r => r.status !== 'ok');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Working: ${ok.length}`);
  console.log(`  ❌ Broken:  ${bad.length}`);
  console.log(`${'═'.repeat(60)}`);

  if (bad.length > 0) {
    console.log('\n🗑  Videos to remove:');
    for (const b of bad) {
      console.log(`  ${b.movieTitle} — ${b.title} (${b.youtubeId}) [${b.status}: ${b.reason}]`);
      console.log(`    DB videos: ${b.videoIds.join(', ')}`);
      console.log(`    Clips: ${b.clipIds.join(', ')}`);
    }

    if (!dryRun) {
      console.log('\n🔧 Removing broken clips and videos...');

      for (const b of bad) {
        for (const clipId of b.clipIds) {
          // Remove clip_structures, word_timestamps, subtitle_lines (cascade), then clip
          db.prepare('DELETE FROM clip_structures WHERE clip_id = ?').run(clipId);
          const lines = db.prepare('SELECT id FROM subtitle_lines WHERE clip_id = ?').all(clipId) as any[];
          for (const line of lines) {
            db.prepare('DELETE FROM word_timestamps WHERE line_id = ?').run(line.id);
          }
          db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(clipId);
          db.prepare('DELETE FROM clips WHERE id = ?').run(clipId);
          console.log(`    Removed clip #${clipId}`);
        }

        for (const videoId of b.videoIds) {
          // Only delete video if no more clips reference it
          const remaining = db.prepare('SELECT COUNT(*) as n FROM clips WHERE video_id = ?').get(videoId) as any;
          if (remaining.n === 0) {
            db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
            console.log(`    Removed video: ${videoId}`);
          }
        }
      }

      console.log('\n✅ Cleanup complete.');
    } else {
      console.log('\n⚠ Dry run — no changes made. Run without --dry-run to remove.');
    }
  }

  // Final clip counts per lesson
  console.log('\n\n📊 Final clip counts per lesson:');
  console.log('─'.repeat(50));
  const counts = db.prepare(`
    SELECT cs.lesson_id, cl.title, COUNT(DISTINCT cs.clip_id) as clips
    FROM clip_structures cs
    JOIN curriculum_lessons cl ON cl.id = cs.lesson_id
    GROUP BY cs.lesson_id
    ORDER BY cl.sort_order
  `).all() as any[];

  for (const c of counts) {
    const icon = c.clips >= 10 ? '✅' : '⚠️';
    console.log(`  ${icon} ${c.lesson_id}: ${c.clips} clips — ${c.title}`);
  }
}

main().catch(console.error);
