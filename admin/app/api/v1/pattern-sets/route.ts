import { NextResponse } from 'next/server';
import { parseLang } from '@/lib/lang';
import { getPatternSets } from '@/lib/pattern-sets';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

/**
 * The pattern-first sets: one per pattern of the Spanish path, shaped like
 * `/api/v1/video-sets` (plus `pattern_id`, each video's `target_lines`, and
 * the `words` the pattern adds), so the app opens them as any set once the
 * learner finishes the pattern. English has none.
 */
export function GET(req: Request) {
  try {
    return NextResponse.json(getPatternSets(parseLang(req)), { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error building pattern sets:', error);
    return NextResponse.json(
      { error: 'Failed to build pattern sets' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
