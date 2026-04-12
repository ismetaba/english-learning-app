import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PID_FILE = '/tmp/pipeline-pid.txt';
const PROGRESS_FILE = '/tmp/pipeline-progress.json';
const PROJECT_ROOT = path.join(process.cwd(), '..');
const DB_PATH = path.join(PROJECT_ROOT, 'data.db');
const CLAUDE_BIN = path.join(process.env.HOME || '', '.local', 'bin', 'claude');

function isRunning(): boolean {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
    process.kill(pid, 0); // check if alive
    return true;
  } catch {
    return false;
  }
}

function findYtDlp(): string {
  const candidates = [
    path.join(process.env.HOME || '', 'Library', 'Python', '3.14', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.13', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.12', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.11', 'bin', 'yt-dlp'),
    path.join(process.env.HOME || '', 'Library', 'Python', '3.9', 'bin', 'yt-dlp'),
    '/opt/homebrew/bin/yt-dlp',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'yt-dlp';
}

const PROMPT = `You are a video pipeline agent for an English learning app. Execute all 4 stages below sequentially. Be concise in reasoning — focus on actions.

## Environment
- Database: ${DB_PATH} (SQLite, use sqlite3 CLI)
- Progress file: ${PROGRESS_FILE} — write JSON after EVERY meaningful step
- yt-dlp: ${findYtDlp()}
- Admin API: http://localhost:3000
- Project root: ${PROJECT_ROOT}

## Progress File Format
Write this JSON to ${PROGRESS_FILE} after EVERY SINGLE video/clip processed (not just at the end of each stage).
The dashboard polls this file every 3 seconds to show live progress. If you only update at the end of a stage, the user sees stale numbers.

IMPORTANT: After each individual video found, each subtitle extracted, each quality check, each clip assigned — increment the counter and write the progress file immediately.

{"stage":"<stage>","progress":"<description of what you just did>","started_at":"<iso>","completed_at":null,"results":{"videos_found":0,"subtitles_extracted":0,"quality_checked":0,"videos_removed":0,"clips_assigned":0,"errors":[]},"log":["timestamped entries..."]}

Stages: find_videos, extract_subtitles, quality_check, assign_lessons, done, error

## Stage 1: Find Videos (target: 20 new videos)
Search YouTube for short (30s-5min) movie/TV clips with clear English dialogue.

Run multiple searches with yt-dlp. Use ytsearch30 per query to get enough results:
${findYtDlp()} --flat-playlist -j "ytsearch30:<query>" 2>/dev/null

Use as many varied queries as needed to reach the target. Examples:
"movieclips famous scene HD", "movieclips comedy scene", "movieclips drama scene", "animated movie clip scene", "movie monologue clip", "iconic movie dialogue scene", "movieclips thriller scene", "movieclips romantic scene", "movie clip oscar scene", "classic movie clip HD", "funny movie scene clip", "movie confrontation scene", "movie chase scene clip", "heartwarming movie scene", "movie scene emotional clip", "best movie dialogues clip"

Stop searching once you've found enough new videos to reach the target. If you run out of queries, try more specific ones like "movieclips 2020 scene", "movieclips adventure scene", etc.

For each result:
1. Extract: id, title, duration from the JSON
2. Skip if duration > 300 or < 15 seconds
3. Skip if youtube_video_id already in DB: sqlite3 ${DB_PATH} "SELECT 1 FROM videos WHERE youtube_video_id='<id>'" — if found, skip (do NOT count as "found")
4. Also skip if generated video id already exists: sqlite3 ${DB_PATH} "SELECT 1 FROM videos WHERE id='<id>'" — if found, skip
5. Parse title to get movie_title and scene_title (pattern: "Movie (X/Y) CLIP - Scene (Year) HD")
6. Generate video id: kebab-case of movie-title-scene-title, max 80 chars
7. Guess genre from keywords (action/comedy/drama/horror/scifi/animation/thriller/adventure/fantasy/romance)
8. Insert: sqlite3 ${DB_PATH} "INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES ('<id>', '<yt_id>', '<title>', '<movie>', '<genre>', 'intermediate')"
9. Insert clip: sqlite3 ${DB_PATH} "INSERT INTO clips (video_id, start_time, end_time, status) VALUES ('<id>', 0, 9999, 'draft')"
10. Only increment videos_found AFTER successful insert

Update progress after each batch of searches.

## Stage 2: Extract Subtitles
Find ALL videos without subtitle lines:
sqlite3 ${DB_PATH} "SELECT v.id FROM videos v JOIN clips c ON c.video_id = v.id LEFT JOIN subtitle_lines sl ON sl.clip_id = c.id GROUP BY v.id HAVING COUNT(sl.id) = 0"

For each, extract subtitles via the admin API:
curl -s -X POST "http://localhost:3000/api/videos/<VIDEO_ID>/auto-subtitle" --max-time 300

If curl fails (server not running), skip and log the error. Update progress after each video.

## Stage 3: Quality Check
Get videos that were just subtitled in Stage 2 (check only the ones processed in this run, not old ones):
sqlite3 ${DB_PATH} "SELECT v.id, v.title, v.movie_title, v.difficulty FROM videos v JOIN clips c ON c.video_id = v.id JOIN subtitle_lines sl ON sl.clip_id = c.id WHERE c.status = 'draft' GROUP BY v.id HAVING COUNT(sl.id) > 0"

For each, read the subtitle text:
sqlite3 ${DB_PATH} "SELECT sl.text FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = '<id>' ORDER BY sl.start_time"

Evaluate quality and difficulty:

BAD quality (delete the video): mostly [Music]/sound effects, <3 spoken words, garbled/non-English, inappropriate
GOOD quality — assign difficulty:
- beginner: Short simple sentences, basic vocab (hello, thank you, I am, this is), slow/clear speech
- elementary: Simple compound sentences, everyday topics, common expressions
- intermediate: Complex sentences, varied tenses, idioms, faster speech
- advanced: Sophisticated vocab, complex grammar, rapid speech, slang

For BAD: sqlite3 ${DB_PATH} "DELETE FROM videos WHERE id='<id>'"
For GOOD: sqlite3 ${DB_PATH} "UPDATE videos SET difficulty='<level>' WHERE id='<id>'"
Also approve clips: sqlite3 ${DB_PATH} "UPDATE clips SET status='approved' WHERE video_id='<id>'"

Update progress after each video.

## Stage 4: Assign to A1 Lessons
Get ALL approved clips not yet assigned to any lesson (any difficulty level — even intermediate clips can have lines that fit A1 patterns):
sqlite3 ${DB_PATH} "SELECT v.id, c.id as clip_id, v.title, v.movie_title, v.difficulty FROM videos v JOIN clips c ON c.video_id = v.id WHERE NOT EXISTS (SELECT 1 FROM clip_structures cs WHERE cs.clip_id = c.id) AND c.status = 'approved'"

For each, read subtitle text and check against these A1 lessons:
- lesson-01-greetings: Dialogue has Hello/Hi/Good morning|afternoon|evening/My name is/Nice to meet you/Goodbye/Bye
- lesson-02-courtesy-phrases: Please/Thank you/Sorry/Excuse me/You're welcome
- lesson-03-subject-pronouns: Uses I/you/he/she/it/we/they as sentence subjects clearly
- lesson-04-to-be-noun: Has "I am a/an ___" or "He/She is a ___" or "They are ___s" patterns
- lesson-05-to-be-adjective: Has "I am happy/sad/tired" or "She is beautiful/smart" patterns
- lesson-06-to-be-negative: Has "I'm not" / "He isn't" / "They aren't" patterns
- lesson-07-to-be-questions: Has "Are you ___?" / "Is he ___?" question patterns
- lesson-08-wh-questions-to-be: Has "What is ___?" / "Where are ___?" / "Who is ___?" patterns
- lesson-09-articles: Clear usage of a/an/the in context
- lesson-10-demonstratives: Has "This is" / "That is" / "These are" / "Those are" patterns
- lesson-11-possessive-adjectives: Has my/your/his/her/our/their + noun patterns
- lesson-12-basic-vocabulary: Mentions colors, family members, or body parts
- lesson-13-simple-commands: Has imperative verbs: "Come here" / "Look at" / "Don't + verb"

IMPORTANT: Each lesson gets its OWN separate clip. Do NOT share one clip across multiple lessons.

For each lesson match:
1. Create a NEW clip for this specific lesson:
   sqlite3 ${DB_PATH} "INSERT INTO clips (video_id, start_time, end_time, status) VALUES ('<video_id>', 0, 9999, 'approved')"
   Get the new clip ID: sqlite3 ${DB_PATH} "SELECT last_insert_rowid()"
2. Copy subtitle lines from the original clip to the new clip:
   sqlite3 ${DB_PATH} "INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) SELECT <new_clip_id>, line_index, speaker, text, start_time, end_time FROM subtitle_lines WHERE clip_id = <original_clip_id>"
3. Link new clip to lesson:
   sqlite3 ${DB_PATH} "INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (<new_clip_id>, '<lesson_id>')"
4. For each subtitle line that matches the lesson pattern, find the NEW line ID and save as targeted:
   sqlite3 ${DB_PATH} "INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id) VALUES (<new_clip_id>, '<lesson_id>', <new_line_id>)"
5. CRITICAL - Auto-trim: set start_time = earliest targeted line start_time - 30 seconds (min 0), end_time = latest targeted line end_time + 30 seconds:
   sqlite3 ${DB_PATH} "UPDATE clips SET start_time = MAX(0, (SELECT MIN(sl.start_time) FROM targeted_lines tl JOIN subtitle_lines sl ON sl.id = tl.line_id WHERE tl.clip_id = <new_clip_id>) - 30), end_time = (SELECT MAX(sl.end_time) FROM targeted_lines tl JOIN subtitle_lines sl ON sl.id = tl.line_id WHERE tl.clip_id = <new_clip_id>) + 30 WHERE id = <new_clip_id>"
6. If no targeted lines were found for this lesson, DELETE the new clip and do NOT link it.

RULES that must NEVER be violated:
- Every assigned clip MUST have at least one targeted line
- Every clip's bounds MUST be: start = earliest_target - 30s, end = latest_target + 30s
- One clip = one lesson. Never share a clip across multiple lessons.

Update progress after each clip.

## Finishing
When all stages complete, set stage to "done", set completed_at, and write final results to progress file. Ensure all counts are accurate.
`;

export async function POST(req: NextRequest) {
  if (isRunning()) {
    return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 });
  }

  let limit = 50;
  try {
    const body = await req.json();
    if (body.limit && typeof body.limit === 'number') {
      limit = Math.max(1, Math.min(500, body.limit));
    }
  } catch { /* no body */ }

  const initial = {
    stage: 'find_videos',
    progress: 'Starting pipeline...',
    started_at: new Date().toISOString(),
    completed_at: null,
    results: { videos_found: 0, subtitles_extracted: 0, quality_checked: 0, videos_removed: 0, clips_assigned: 0, errors: [] },
    log: [`[${new Date().toISOString()}] Pipeline triggered (target: ${limit} videos)`],
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initial, null, 2));

  const prompt = PROMPT.replace('target: 20 new videos', `target: ${limit} new videos`);

  const logOut = fs.openSync('/tmp/pipeline-claude.log', 'w');
  const child = spawn(CLAUDE_BIN, ['-p', prompt, '--dangerously-skip-permissions'], {
    detached: true,
    stdio: ['ignore', logOut, logOut],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PATH: `${path.dirname(CLAUDE_BIN)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
    },
  });
  child.unref();

  if (child.pid) {
    fs.writeFileSync(PID_FILE, String(child.pid));
  }

  return NextResponse.json({ started: true, pid: child.pid });
}

export async function GET() {
  // Redirect to status endpoint
  return NextResponse.json({ running: isRunning() });
}
