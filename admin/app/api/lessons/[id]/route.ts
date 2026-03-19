import { NextRequest, NextResponse } from 'next/server';
import { getLesson, deleteLesson, getLessonSentences, addSentenceToLesson, updateSentenceAnnotations, removeSentenceFromLesson } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sentences = getLessonSentences(Number(id));
  return NextResponse.json({ ...lesson, sentences });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { line_id, sort_order, grammar_annotations, translations } = await request.json();
  if (!line_id) return NextResponse.json({ error: 'line_id required' }, { status: 400 });
  const sentenceId = addSentenceToLesson(Number(id), line_id, sort_order ?? 0, grammar_annotations ? JSON.stringify(grammar_annotations) : null, translations ? JSON.stringify(translations) : null);
  return NextResponse.json({ id: sentenceId }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const { sentence_id, grammar_annotations, translations } = await request.json();
  if (!sentence_id) return NextResponse.json({ error: 'sentence_id required' }, { status: 400 });
  updateSentenceAnnotations(sentence_id, JSON.stringify(grammar_annotations), JSON.stringify(translations));
  return NextResponse.json({ message: 'Updated' });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.sentence_id) {
    removeSentenceFromLesson(body.sentence_id);
    return NextResponse.json({ message: 'Sentence removed' });
  }
  deleteLesson(Number(id));
  return NextResponse.json({ message: 'Lesson deleted' });
}
