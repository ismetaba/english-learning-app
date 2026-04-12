import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CoursePlayer from '@/components/CoursePlayer/CoursePlayer';
import { fetchLesson, fetchLessonClipsPaginated, LessonClip } from '@/services/curriculumService';
import { useAppContext } from '@/contexts/AppStateContext';
import { palette } from '@/constants/Colors';

const CLIPS_PER_PAGE = 10;

function clipToPlayerFormat(clip: LessonClip) {
  return {
    clip_id: clip.id,
    youtube_video_id: clip.youtubeVideoId,
    movie_title: clip.movieTitle,
    start_time: clip.startTime,
    end_time: clip.endTime,
    target_count: clip.lines.filter(l => l.isTarget).length,
    lines: clip.lines.map(line => ({
      id: line.id,
      text: line.text,
      speaker: line.speaker || 'Speaker',
      start_time: line.startTime,
      end_time: line.endTime,
      words: line.words?.map((w, wi) => ({
        word: w.word,
        word_index: wi,
        start_time: w.startTime,
        end_time: w.endTime,
      })) || [],
      is_target: line.isTarget || false,
      grammar_annotations: null,
      translations: null,
    })),
  };
}

export default function LessonClipsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { progress, markClipWatched } = useAppContext();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalClipsOverall, setTotalClipsOverall] = useState(0);
  const nextPageRef = useRef(2);
  const isResetRef = useRef(false); // true when all clips were watched and we reset

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const watchedIds = progress.watchedClips;

        const [lessonData, clipResponse] = await Promise.all([
          fetchLesson(id),
          fetchLessonClipsPaginated(id, 1, CLIPS_PER_PAGE, watchedIds),
        ]);

        let clips = clipResponse.clips;
        let total = clipResponse.total;

        // If no unwatched clips remain, all have been watched — start over
        if (clips.length === 0 && watchedIds.length > 0) {
          isResetRef.current = true;
          const freshResponse = await fetchLessonClipsPaginated(id, 1, CLIPS_PER_PAGE);
          clips = freshResponse.clips;
          total = freshResponse.total;
        }

        if (clips.length === 0) {
          setError('Bu ders için klip bulunamadı');
          setLoading(false);
          return;
        }

        setTotalClipsOverall(total);
        nextPageRef.current = 2;

        const courseClips = clips.map(clipToPlayerFormat);

        setCourse({
          id: 0,
          title: lessonData.title,
          title_tr: lessonData.title_tr,
          level: 'beginner',
          grammar_focus: lessonData.grammar_pattern,
          total_targets: courseClips.reduce((sum: number, c: any) => sum + c.target_count, 0),
          clips: courseClips,
        });
      } catch (e: any) {
        setError(e.message || 'Failed to load clips');
      }
      setLoading(false);
    })();
  }, [id]);

  const handleLoadMore = useCallback(async () => {
    if (!id || loadingMore) return;
    setLoadingMore(true);
    try {
      const watchedIds = isResetRef.current ? [] : progress.watchedClips;
      const response = await fetchLessonClipsPaginated(
        id,
        nextPageRef.current,
        CLIPS_PER_PAGE,
        watchedIds,
      );

      if (response.clips.length > 0) {
        nextPageRef.current += 1;
        const newClips = response.clips.map(clipToPlayerFormat);

        setCourse((prev: any) => {
          if (!prev) return prev;
          const allClips = [...prev.clips, ...newClips];
          return {
            ...prev,
            total_targets: allClips.reduce((sum: number, c: any) => sum + c.target_count, 0),
            clips: allClips,
          };
        });
      }
    } catch (e) {
      console.error('Failed to load more clips:', e);
    }
    setLoadingMore(false);
  }, [id, loadingMore, progress.watchedClips]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Klipler yükleniyor...</Text>
      </View>
    );
  }

  if (error || !course || course.clips.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📭</Text>
        <Text style={styles.errorText}>{error || 'Bu ders için klip bulunamadı'}</Text>
      </View>
    );
  }

  return (
    <CoursePlayer
      course={course}
      totalClipsOverall={totalClipsOverall}
      loadingMore={loadingMore}
      onLoadMore={handleLoadMore}
      onClipComplete={(clipId) => {
        markClipWatched(String(clipId));
      }}
      onComplete={() => router.back()}
      onBack={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bg,
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.textMuted,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: palette.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
