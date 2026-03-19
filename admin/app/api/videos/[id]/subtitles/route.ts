import { NextRequest, NextResponse } from 'next/server';
import {
  getClipsForVideo, getLinesForClip, getClipWithDetails,
  updateSubtitleLine, deleteSubtitleLine, createSubtitleLine,
  deleteWordsForLine, createWordTimestamp,
} from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clips = getClipsForVideo(id);
  const result = clips.map(clip => ({
    ...clip,
    lines: getLinesForClip(clip.id),
  }));
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { lineId, speaker, text, start_time, end_time, words } = body;

  if (!lineId) {
    return NextResponse.json({ error: 'lineId required' }, { status: 400 });
  }

  updateSubtitleLine(lineId, { speaker, text, start_time, end_time });

  if (words && Array.isArray(words)) {
    deleteWordsForLine(lineId);
    words.forEach((w: any, i: number) => {
      createWordTimestamp(lineId, i, w.word, w.start_time, w.end_time);
    });
  }

  return NextResponse.json({ message: 'Updated' });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clipId, speaker, text, start_time, end_time, line_index } = body;

  if (!clipId || !text || start_time == null || end_time == null) {
    return NextResponse.json({ error: 'clipId, text, start_time, end_time required' }, { status: 400 });
  }

  const lineId = createSubtitleLine(clipId, line_index ?? 999, speaker || 'Speaker', text, start_time, end_time);
  return NextResponse.json({ id: lineId, message: 'Created' }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { lineId } = await request.json();
  if (!lineId) return NextResponse.json({ error: 'lineId required' }, { status: 400 });
  deleteSubtitleLine(lineId);
  return NextResponse.json({ message: 'Deleted' });
}
