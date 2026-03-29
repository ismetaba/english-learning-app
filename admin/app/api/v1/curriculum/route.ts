import { NextResponse } from 'next/server';
import { getFullCurriculum } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export function GET() {
  try {
    const curriculum = getFullCurriculum();
    return NextResponse.json(curriculum, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching curriculum:', error);
    return NextResponse.json({ error: 'Failed to fetch curriculum' }, { status: 500, headers: CORS_HEADERS });
  }
}
