import { NextRequest, NextResponse } from 'next/server';
import { searchSubtitleLines } from '@/lib/db';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  if (q.length < 2) return NextResponse.json([]);
  const results = searchSubtitleLines(q, 30);
  return NextResponse.json(results);
}
