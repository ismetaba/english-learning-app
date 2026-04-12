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
    process.kill(pid, 0);
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

const PROMPT = `You are a video processing agent for an English learning app. You process EXISTING videos only — do NOT search for new ones. Execute the 3 stages below sequentially. Be concise — focus on actions.

## Environment
- Database: ${DB_PATH} (SQLite, use sqlite3 CLI)
- Progress file: ${PROGRESS_FILE} — write JSON after EVERY SINGLE video processed
- yt-dlp: ${findYtDlp()}
- Admin API: http://localhost:3000
- Project root: ${PROJECT_ROOT}

## Progress File Format
Write this JSON to ${PROGRESS_FILE} after EVERY SINGLE video processed:
{"stage":"<stage>","progress":"<what you just did>","started_at":"<iso>","completed_at":null,"results":{"videos_found":0,"subtitles_extracted":0,"quality_checked":0,"videos_removed":0,"clips_assigned":0,"errors":[]},"log":["timestamped entries..."]}

Stages: extract_subtitles, quality_check, assign_lessons, done, error

## Stage 1: Extract Subtitles
Find ALL videos without subtitle lines:
sqlite3 ${DB_PATH} "SELECT v.id FROM videos v JOIN clips c ON c.video_id = v.id LEFT JOIN subtitle_lines sl ON sl.clip_id = c.id GROUP BY v.id HAVING COUNT(sl.id) = 0"

IMPORTANT: Run extractions in PARALLEL (4 at a time) for speed. Process videos in batches of 4 using background processes:

curl -s -X POST "http://localhost:3000/api/videos/<ID1>/auto-subtitle" --max-time 300 &
curl -s -X POST "http://localhost:3000/api/videos/<ID2>/auto-subtitle" --max-time 300 &
curl -s -X POST "http://localhost:3000/api/videos/<ID3>/auto-subtitle" --max-time 300 &
curl -s -X POST "http://localhost:3000/api/videos/<ID4>/auto-subtitle" --max-time 300 &
wait

After each batch, update progress and increment subtitles_extracted by the number that succeeded. If curl fails, log the error and continue.

## Stage 2: Quality Check
Get videos with subtitles that still have clips in 'draft' status (unreviewed):
sqlite3 ${DB_PATH} "SELECT v.id, v.title, v.movie_title, v.difficulty FROM videos v JOIN clips c ON c.video_id = v.id JOIN subtitle_lines sl ON sl.clip_id = c.id WHERE c.status = 'draft' GROUP BY v.id HAVING COUNT(sl.id) > 0"

For each, read the subtitle text:
sqlite3 ${DB_PATH} "SELECT sl.text FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = '<id>' ORDER BY sl.start_time"

BAD quality (delete): mostly [Music]/sound effects, <3 spoken words, garbled/non-English
GOOD quality — assign difficulty:
- beginner: Short simple sentences, basic vocab, slow/clear speech
- elementary: Simple compound sentences, everyday topics
- intermediate: Complex sentences, varied tenses, idioms
- advanced: Sophisticated vocab, complex grammar, rapid speech

For BAD: sqlite3 ${DB_PATH} "DELETE FROM videos WHERE id='<id>'"
For GOOD: sqlite3 ${DB_PATH} "UPDATE videos SET difficulty='<level>' WHERE id='<id>'"
Also: sqlite3 ${DB_PATH} "UPDATE clips SET status='approved' WHERE video_id='<id>'"

Update progress after EACH video.

## Stage 3: Assign to A1 Lessons
Get ALL approved clips not yet assigned to any lesson:
sqlite3 ${DB_PATH} "SELECT v.id, c.id as clip_id, v.title, v.movie_title, v.difficulty FROM videos v JOIN clips c ON c.video_id = v.id WHERE NOT EXISTS (SELECT 1 FROM clip_structures cs WHERE cs.clip_id = c.id) AND c.status = 'approved'"

For each, read subtitle text and check against A1 lessons:
- lesson-01-greetings: Hello/Hi/Good morning/My name is/Nice to meet/Goodbye/Bye
- lesson-02-courtesy-phrases: Please/Thank you/Sorry/Excuse me/You're welcome
- lesson-03-subject-pronouns: I am/I'm/you are/he is/she is/we are/they are
- lesson-04-to-be-noun: I am a/He is a/She is a + noun
- lesson-05-to-be-adjective: I'm happy/is beautiful/is good/is ready
- lesson-06-to-be-negative: I'm not/isn't/aren't/is not
- lesson-07-to-be-questions: Are you/Is he/Is this/Am I + ?
- lesson-08-wh-questions-to-be: What is/Where is/Who is/How are
- lesson-09-articles: a/an/the usage
- lesson-10-demonstratives: This is/That is/These are/Those are
- lesson-11-possessive-adjectives: my/your/his/her/our/their + noun
- lesson-12-basic-vocabulary: colors, family, body parts
- lesson-13-simple-commands: Come/Go/Look/Stop/Run/Don't

IMPORTANT: Each lesson gets its OWN separate clip. Do NOT share one clip across lessons.

For each lesson match:
1. Create NEW clip: INSERT INTO clips (video_id, start_time, end_time, status) VALUES ('<video_id>', 0, 9999, 'approved')
2. Copy subtitle lines to new clip
3. Link: INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (<new_clip_id>, '<lesson_id>')
4. Save targeted lines: INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id)
5. Auto-trim: UPDATE clips SET start_time = MAX(0, MIN(target_start) - 30), end_time = MAX(target_end) + 30
6. If no targeted lines found, DELETE the new clip

RULES:
- Every clip MUST have targeted lines
- Bounds = earliest_target - 30s to latest_target + 30s
- One clip per lesson assignment. But a video CAN have multiple clips for the SAME lesson if targets are far apart.
- SPLITTING: If targets for one lesson have a gap > 60s between consecutive ones, create SEPARATE clips per cluster.
- Never create a clip longer than 2 minutes unless targets are all within range with no 60s+ gaps.

Update progress after each clip.

## Finishing
Set stage to "done", set completed_at, write final results.
`;

export async function POST(req: NextRequest) {
  if (isRunning()) {
    return NextResponse.json({ error: 'A pipeline is already running' }, { status: 409 });
  }

  const initial = {
    stage: 'extract_subtitles',
    progress: 'Starting processing...',
    started_at: new Date().toISOString(),
    completed_at: null,
    results: { videos_found: 0, subtitles_extracted: 0, quality_checked: 0, videos_removed: 0, clips_assigned: 0, errors: [] },
    log: [`[${new Date().toISOString()}] Process triggered (extract → review → assign)`],
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initial, null, 2));

  const logOut = fs.openSync('/tmp/pipeline-claude.log', 'w');
  const child = spawn(CLAUDE_BIN, ['-p', PROMPT, '--dangerously-skip-permissions'], {
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
