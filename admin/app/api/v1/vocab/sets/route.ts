import { NextResponse } from 'next/server';
import { getAllVocabSets } from '@/lib/db';

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
    const sets = getAllVocabSets();
    return NextResponse.json(sets, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching vocab sets:', error);
    return NextResponse.json({ error: 'Failed to fetch vocab sets' }, { status: 500, headers: CORS_HEADERS });
  }
}
