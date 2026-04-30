import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPocVideos, type PocVideo } from '@/services/curriculumService';
import { palette, Radius } from '@/constants/Colors';

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  beginner:     { label: 'Başlangıç',  color: palette.success },
  elementary:   { label: 'Temel',      color: palette.primary },
  intermediate: { label: 'Orta',       color: '#F59E0B' },
  advanced:     { label: 'İleri',      color: palette.error },
};

function thumbnailUrl(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
}

function VideoCard({ video, onPress }: { video: PocVideo; onPress: () => void }) {
  const diff = DIFFICULTY_LABEL[video.difficulty] ?? DIFFICULTY_LABEL.beginner;
  const topWords = video.starter_words.slice(0, 6);
  const moreCount = Math.max(0, video.starter_words.length - 6);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: thumbnailUrl(video.youtube_video_id) }}
          style={styles.thumb}
          resizeMode="cover"
        />
        <View style={[styles.diffBadge, { backgroundColor: diff.color }]}>
          <Text style={styles.diffText}>{diff.label}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.movieTitle} numberOfLines={1}>
          {video.movie_title}
        </Text>
        <Text style={styles.sceneTitle} numberOfLines={2}>
          {video.title}
        </Text>

        {video.wpm != null && video.avg_sentence_len != null && (
          <View style={styles.statsRow}>
            <Text style={styles.stat}>{Math.round(video.wpm)} WPM</Text>
            <Text style={styles.statSep}>·</Text>
            <Text style={styles.stat}>
              {video.avg_sentence_len.toFixed(1)} kelime/cümle
            </Text>
            <Text style={styles.statSep}>·</Text>
            <Text style={styles.stat}>{video.total_lines} satır</Text>
          </View>
        )}

        {topWords.length > 0 && (
          <View style={styles.wordsSection}>
            <Text style={styles.wordsLabel}>Bu videoda öğreneceğin</Text>
            <View style={styles.wordChips}>
              {topWords.map(w => (
                <View key={w.id} style={styles.chip}>
                  <Text style={styles.chipWord}>{w.word}</Text>
                </View>
              ))}
              {moreCount > 0 && (
                <View style={[styles.chip, styles.chipMore]}>
                  <Text style={styles.chipMoreText}>+{moreCount}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function VideoFeed() {
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<PocVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPocVideos()
      .then(v => {
        if (!cancelled) setVideos(v);
      })
      .catch(e => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const topInset = Platform.OS === 'web' ? 24 : insets.top + 16;

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Videolar yüklenemedi.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }
  if (!videos) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }
  if (videos.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Henüz POC videosu yok.</Text>
        <Text style={styles.errorDetail}>
          Admin'de bir video için poc=1 işaretleyin.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset, paddingBottom: 180 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>İzle ve öğren</Text>
      <Text style={styles.subheading}>
        {videos.length} {videos.length === 1 ? 'video' : 'video'} · kolaydan zora
      </Text>
      {videos.map(v => (
        <VideoCard
          key={v.id}
          video={v}
          onPress={() => {
            // Faz 3: navigate to clip player
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 16 },

  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    marginBottom: 20,
    fontWeight: '600',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorText: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  errorDetail: {
    color: palette.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },

  card: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%' },
  diffBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  diffText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  cardBody: { padding: 16 },
  movieTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sceneTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: palette.textPrimary,
    marginTop: 4,
    lineHeight: 24,
    letterSpacing: -0.2,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  stat: { fontSize: 13, color: palette.textMuted, fontWeight: '600' },
  statSep: { color: palette.textMuted, fontSize: 13 },

  wordsSection: { marginTop: 16 },
  wordsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: palette.bgSurface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipWord: { fontSize: 13, fontWeight: '700', color: palette.textPrimary },
  chipMore: { backgroundColor: 'transparent' },
  chipMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
  },
});
