import { NextResponse } from 'next/server';
import { getAllLessons } from '@/lib/db';

// Public endpoint for mobile app to list lessons
export async function GET() {
  const lessons = getAllLessons();
  return NextResponse.json(lessons, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
