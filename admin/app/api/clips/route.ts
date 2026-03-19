import { NextRequest, NextResponse } from 'next/server';
import { getAllApprovedClips, getClipsByTag } from '@/lib/db';

export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get('tag');

  const clips = tag ? getClipsByTag(tag) : getAllApprovedClips();

  // Transform to API format
  const result = clips.map(clip => ({
    id: clip.id,
    youtubeVideoId: clip.youtube_video_id,
    movieTitle: clip.movie_title,
    startTime: clip.start_time,
    endTime: clip.end_time,
    lines: clip.lines.map(line => ({
      speaker: line.speaker,
      text: line.text,
      lineStartTime: line.start_time,
      lineEndTime: line.end_time,
      wordTimestamps: (line.words || []).map(w => ({
        word: w.word,
        startTime: w.start_time,
        endTime: w.end_time,
      })),
    })),
  }));

  return NextResponse.json(result, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
