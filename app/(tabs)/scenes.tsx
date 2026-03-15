import React, { useState } from 'react';
import { StyleSheet, ScrollView, Pressable, Text, View, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, FadeIn, ZoomIn } from 'react-native-reanimated';
import { scenes } from '@/data/scenes';
import { vocabSets } from '@/data/vocab';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';

export default function ScenesScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);
  const { progress } = useAppContext();
  const { t } = useTranslation();

  const filteredScenes = filter
    ? scenes.filter((s) => s.vocabSetId === filter)
    : scenes;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('movieScenes')}</Text>
        <Text style={styles.screenSubtitle}>{t('scenesSubtitle')}</Text>
      </Animated.View>

      {/* Watched stats */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.watchedStats}>
        <View style={styles.watchedPill}>
          <Text style={styles.watchedPillIcon}>{'🎬'}</Text>
          <Text style={styles.watchedPillText}>{progress.watchedScenes.length}/{scenes.length} {t('watched')}</Text>
        </View>
      </Animated.View>

      {/* Filter chips */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          <Pressable
            style={[styles.filterChip, !filter && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterText, !filter && styles.filterTextActive]}>{t('all')}</Text>
          </Pressable>
          {vocabSets.map((set) => (
            <Pressable
              key={set.id}
              style={[styles.filterChip, filter === set.id && styles.filterChipActive]}
              onPress={() => setFilter(set.id)}
            >
              <Text style={[styles.filterText, filter === set.id && styles.filterTextActive]}>
                {set.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Scene cards */}
      {filteredScenes.map((scene, index) => {
        const isWatched = progress.watchedScenes.includes(scene.id);
        return (
          <Animated.View key={scene.id} entering={FadeInDown.delay(index * 80).duration(500)}>
            <Pressable
              style={({ pressed }) => [
                styles.sceneCard,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => router.push(`/scenes/${scene.id}` as any)}
            >
              {/* Thumbnail */}
              <View style={styles.thumbnail}>
                <Image
                  source={{ uri: `https://img.youtube.com/vi/${scene.youtubeVideoId}/mqdefault.jpg` }}
                  style={styles.thumbnailImage}
                />
                <View style={styles.thumbnailOverlay} />
                <View style={styles.playButton}>
                  <Text style={styles.playIcon}>{'▶'}</Text>
                </View>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{scene.endTime - scene.startTime}s</Text>
                </View>
                {isWatched && (
                  <View style={styles.watchedBadge}>
                    <Text style={styles.watchedBadgeText}>{'✓ '}{t('watched')}</Text>
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={styles.sceneInfo}>
                <Text style={styles.movieTitle}>{scene.movieTitle}</Text>
                <Text style={styles.sceneDescription} numberOfLines={2}>{scene.description}</Text>

                <View style={styles.metaRow}>
                  <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[scene.difficulty] || palette.textMuted }]}>
                    <Text style={styles.diffText}>{scene.difficulty}</Text>
                  </View>
                  <Text style={styles.genreText}>{scene.genre}</Text>
                </View>

                <View style={styles.vocabRow}>
                  {scene.vocabCoverage.slice(0, 4).map((word, i) => (
                    <View key={i} style={styles.vocabChip}>
                      <Text style={styles.vocabChipText}>{word}</Text>
                    </View>
                  ))}
                  {scene.vocabCoverage.length > 4 && (
                    <Text style={styles.moreText}>+{scene.vocabCoverage.length - 4}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}

      {filteredScenes.length === 0 && (
        <Animated.View entering={FadeIn.duration(400)} style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{'🔍'}</Text>
          <Text style={styles.emptyText}>{t('noScenesFound')}</Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const DIFF_COLORS: Record<string, string> = {
  beginner: '#00B894',
  elementary: '#00CEC9',
  intermediate: '#FDCB6E',
  'upper-intermediate': '#FF9F43',
  advanced: '#FF6B6B',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingBottom: 32,
  },

  // Header
  screenHeader: {
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: palette.textSecondary,
    marginTop: 4,
    lineHeight: 22,
  },

  // Watched stats
  watchedStats: {
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
  },
  watchedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  watchedPillIcon: {
    fontSize: 16,
  },
  watchedPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primary,
  },

  // Filters
  filterRow: {
    flexGrow: 0,
    marginBottom: 20,
    marginTop: 14,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: palette.bgSurface,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
  },

  // Scene card
  sceneCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -24,
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: palette.primaryGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  playIcon: {
    fontSize: 18,
    color: palette.primary,
    marginLeft: 3,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  watchedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: palette.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  watchedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Scene info
  sceneInfo: {
    padding: 18,
  },
  movieTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  sceneDescription: {
    fontSize: 14,
    color: palette.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  diffBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  diffText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  genreText: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: '500',
  },
  vocabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  vocabChip: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vocabChipText: {
    fontSize: 12,
    color: palette.primary,
    fontWeight: '600',
  },
  moreText: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '600',
  },

  // Empty
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: palette.textMuted,
    fontWeight: '500',
  },
});
