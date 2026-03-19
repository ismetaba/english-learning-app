import { NextRequest, NextResponse } from 'next/server';
import { getAllVideos, createVideo, deleteVideo, getVideo, getClipsForVideo, getLinesForClip } from '@/lib/db';

export async function GET() {
  const videos = getAllVideos();
  return NextResponse.json(videos);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { youtube_video_id, title, movie_title, genre, difficulty } = body;

  if (!youtube_video_id || !title || !movie_title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  try {
    createVideo({
      id,
      youtube_video_id,
      title,
      movie_title,
      genre: genre || null,
      difficulty: difficulty || 'intermediate',
      duration_seconds: null,
    });
    return NextResponse.json({ id, message: 'Video created' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    deleteVideo(id);
    return NextResponse.json({ message: 'Video deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
