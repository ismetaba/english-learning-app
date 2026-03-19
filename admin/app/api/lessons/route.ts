import { NextRequest, NextResponse } from 'next/server';
import { getAllLessons, createLesson } from '@/lib/db';

export async function GET() {
  return NextResponse.json(getAllLessons());
}

export async function POST(request: NextRequest) {
  const { title, title_tr, description, level, grammar_focus } = await request.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const id = createLesson(title, title_tr || null, description || null, level || 'elementary', grammar_focus || null);
  return NextResponse.json({ id }, { status: 201 });
}
