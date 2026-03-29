import { NextRequest, NextResponse } from 'next/server';
import { getVocabSet } from '@/lib/db';

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
    const set = getVocabSet(id);
    if (!set) {
      return NextResponse.json({ error: 'Vocab set not found' }, { status: 404, headers: CORS_HEADERS });
    }
    return NextResponse.json(set, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching vocab set:', error);
    return NextResponse.json({ error: 'Failed to fetch vocab set' }, { status: 500, headers: CORS_HEADERS });
  }
}
