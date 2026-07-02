import { NextResponse } from 'next/server';
import { getVideoSets } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

/**
 * Returns the curated learning sets, each populated with the ordered
 * list of POC videos it contains. The companion endpoint to
 * `/api/v1/poc-videos` — that one is a flat list, this one groups the
 * same videos under set headers so the iOS feed can render them as a
 * curriculum.
 */
export function GET() {
  try {
    const sets = getVideoSets();
    return NextResponse.json(sets, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching video sets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video sets' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
