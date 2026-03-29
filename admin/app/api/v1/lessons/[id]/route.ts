import { NextRequest, NextResponse } from 'next/server';
import { getCurriculumLesson, getPrerequisites } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lesson = getCurriculumLesson(id);
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404, headers: CORS_HEADERS });
    }
    const prerequisites = getPrerequisites(id);
    return NextResponse.json({
      ...lesson,
      examples: lesson.examples ? JSON.parse(lesson.examples) : [],
      exercises: lesson.exercises ? JSON.parse(lesson.exercises) : [],
      sections: lesson.sections ? JSON.parse(lesson.sections) : null,
      prerequisites,
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500, headers: CORS_HEADERS });
  }
}
