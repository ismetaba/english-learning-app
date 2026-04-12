import { NextRequest, NextResponse } from 'next/server';
import { getClipsByStructure, addStructureToClip, getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const clips = getClipsByStructure(lessonId);
    return NextResponse.json(clips, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const body = await request.json();
    const { clipId } = body;

    if (!clipId) {
      return NextResponse.json({ error: 'clipId is required' }, { status: 400, headers: CORS_HEADERS });
    }

    addStructureToClip(clipId, lessonId);
    return NextResponse.json({ message: 'Clip linked to lesson' }, { status: 201, headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const body = await request.json();
    const { clipId } = body;

    if (!clipId) {
      return NextResponse.json({ error: 'clipId is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    db.prepare('DELETE FROM clip_structures WHERE clip_id = ? AND lesson_id = ?').run(clipId, lessonId);

    // If clip has no more lesson assignments, delete it entirely
    const remaining = (db.prepare('SELECT COUNT(*) as n FROM clip_structures WHERE clip_id = ?').get(clipId) as any).n;
    if (remaining === 0) {
      db.prepare('DELETE FROM targeted_lines WHERE clip_id = ?').run(clipId);
      db.prepare('DELETE FROM word_timestamps WHERE line_id IN (SELECT id FROM subtitle_lines WHERE clip_id = ?)').run(clipId);
      db.prepare('DELETE FROM subtitle_lines WHERE clip_id = ?').run(clipId);
      db.prepare('DELETE FROM clips WHERE id = ?').run(clipId);
    }

    return NextResponse.json({ message: 'Clip removed from lesson' }, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
