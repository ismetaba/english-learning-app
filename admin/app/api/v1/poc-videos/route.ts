import { NextResponse } from 'next/server';
import { getPocVideos } from '@/lib/db';
import { parseLang } from '@/lib/lang';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export function GET(req: Request) {
  try {
    const videos = getPocVideos(parseLang(req));
    return NextResponse.json(videos, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching POC videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch POC videos' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
