import { NextRequest, NextResponse } from 'next/server';
import { getClipsByVocabWord } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ word: string }> }) {
  try {
    const { word } = await params;
    const clips = getClipsByVocabWord(word);
    const formatted = clips.map(clip => ({
      id: clip.id,
      youtubeVideoId: clip.youtube_video_id,
      movieTitle: clip.movie_title,
      startTime: clip.start_time,
      endTime: clip.end_time,
      lines: clip.lines.map(line => ({
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        startTime: line.start_time,
        endTime: line.end_time,
        words: line.words?.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
        })) ?? [],
      })),
    }));
    return NextResponse.json(formatted, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching clips by vocab:', error);
    return NextResponse.json({ error: 'Failed to fetch clips' }, { status: 500, headers: CORS_HEADERS });
  }
}
