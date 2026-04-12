import { NextResponse } from 'next/server';
import fs from 'fs';
import { getDb } from '@/lib/db';

const PID_FILE = '/tmp/pipeline-pid.txt';
const PROGRESS_FILE = '/tmp/pipeline-progress.json';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const defaultStatus = {
    running: false,
    stage: 'idle',
    progress: '',
    started_at: null,
    completed_at: null,
    results: { videos_found: 0, subtitles_extracted: 0, quality_checked: 0, videos_removed: 0, clips_assigned: 0, errors: [] },
    log: [],
  };

  if (!fs.existsSync(PROGRESS_FILE)) {
    return NextResponse.json(defaultStatus);
  }

  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));

    // If stage is done or error, it's not running regardless of PID
    if (data.stage === 'done' || data.stage === 'error') {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
      return NextResponse.json({ ...data, running: false });
    }

    // Check if process is still alive
    let running = false;
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      running = isPidAlive(pid);

      if (!running) {
        // Process died unexpectedly
        data.stage = 'error';
        data.completed_at = new Date().toISOString();
        data.results.errors = data.results.errors || [];
        data.results.errors.push('Pipeline process terminated unexpectedly');
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
        fs.unlinkSync(PID_FILE);
      }
    }

    // Add live DB counts so dashboard always shows real numbers
    let live = undefined;
    try {
      const db = getDb();
      live = {
        total_videos: (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n,
        with_subtitles: (db.prepare('SELECT COUNT(DISTINCT c.video_id) as n FROM clips c JOIN subtitle_lines sl ON sl.clip_id = c.id').get() as any).n,
        total_assignments: (db.prepare('SELECT COUNT(*) as n FROM clip_structures').get() as any).n,
        total_targeted: (db.prepare('SELECT COUNT(*) as n FROM targeted_lines').get() as any).n,
      };
    } catch {}

    return NextResponse.json({ ...data, running, live });
  } catch {
    return NextResponse.json(defaultStatus);
  }
}

export async function DELETE() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {}
  return NextResponse.json({ cleared: true });
}
