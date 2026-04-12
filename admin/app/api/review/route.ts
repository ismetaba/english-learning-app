import { NextRequest, NextResponse } from 'next/server';
import { getDb, enforceClipBounds } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clipId, lessonId, lineId, action, startTime, endTime } = body;
  const db = getDb();

  if (action === 'add-target') {
    db.prepare('INSERT OR IGNORE INTO targeted_lines (clip_id, lesson_id, line_id) VALUES (?, ?, ?)').run(clipId, lessonId, lineId);
    enforceClipBounds(clipId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'remove-target') {
    db.prepare('DELETE FROM targeted_lines WHERE clip_id = ? AND lesson_id = ? AND line_id = ?').run(clipId, lessonId, lineId);
    enforceClipBounds(clipId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete-line') {
    db.prepare('DELETE FROM word_timestamps WHERE line_id = ?').run(lineId);
    db.prepare('DELETE FROM targeted_lines WHERE line_id = ?').run(lineId);
    db.prepare('DELETE FROM subtitle_lines WHERE id = ?').run(lineId);
    if (clipId) enforceClipBounds(clipId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'trim') {
    // Manual trim override — still allowed for fine-tuning
    db.prepare('UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?').run(startTime, endTime, clipId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
