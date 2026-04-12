import Link from 'next/link';
import { getVideo, getClipsForVideo, getLinesForClip } from '@/lib/db';
import { notFound } from 'next/navigation';
import SubtitleEditor from '@/components/SubtitleEditor';
import AutoSubtitleButton from '@/components/AutoSubtitleButton';

export const dynamic = 'force-dynamic';

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) notFound();

  const allClips = getClipsForVideo(id);
  // Show one consolidated clip with deduplicated subtitle lines
  // Per-lesson clips have the same subtitles — just pick one clip and show its lines
  const primaryClip = allClips[0];
  const clips = primaryClip ? [primaryClip] : [];
  const clipsWithLines = clips.map(clip => ({
    ...clip,
    lines: getLinesForClip(clip.id),
  }));

  const hasClips = clipsWithLines.length > 0;
  const difficultyBadge = (d: string) => <span className={`badge badge-${d}`}>{d}</span>;

  return (
    <div className="p-6">
      {/* Breadcrumb + Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/videos" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{video.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-zinc-500">{video.movie_title}</span>
              <span className="text-zinc-800">&#183;</span>
              <span className="text-xs text-zinc-600">{video.genre}</span>
              <span className="text-zinc-800">&#183;</span>
              {difficultyBadge(video.difficulty)}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <AutoSubtitleButton videoId={id} hasClips={hasClips} />
      </div>

      <SubtitleEditor video={video} clips={clipsWithLines} />
    </div>
  );
}
