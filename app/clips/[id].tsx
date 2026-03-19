import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { ZoomIn, FadeInUp } from 'react-native-reanimated';
import ClipPlayer from '@/components/ClipPlayer/ClipPlayer';
import { playlists } from '@/data/clips';
import { palette, Radius } from '@/constants/Colors';

export default function ClipPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [completed, setCompleted] = useState(false);

  const playlist = playlists.find(p => p.id === id);

  if (!playlist) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorEmoji}>{'🎞️'}</Text>
        <Text style={styles.errorText}>Playlist not found</Text>
      </View>
    );
  }

  if (completed) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Animated.View entering={ZoomIn.duration(500)} style={styles.completionCard}>
          <Text style={styles.completedEmoji}>{'🎉'}</Text>
          <Text style={styles.completedTitle}>Playlist Complete!</Text>
          <Text style={styles.completedSubtitle}>
            {playlist.clips.length} clips from {[...new Set(playlist.clips.map(c => c.movieTitle))].length} movies
          </Text>
          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.vocabSummary}>
            <Text style={styles.vocabSummaryLabel}>Words practiced:</Text>
            <View style={styles.vocabRow}>
              {playlist.vocabFocus.map((word, i) => (
                <View key={i} style={styles.vocabChip}>
                  <Text style={styles.vocabChipText}>{word}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back to Clips</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const clip = playlist.clips[currentClipIndex];

  const handleClipEnd = () => {
    if (currentClipIndex < playlist.clips.length - 1) {
      setCurrentClipIndex(prev => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  return (
    <ClipPlayer
      key={clip.id}
      clip={clip}
      clipIndex={currentClipIndex}
      totalClips={playlist.clips.length}
      vocabFocus={playlist.vocabFocus}
      onClipEnd={handleClipEnd}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 32 },

  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { color: palette.textMuted, fontSize: 16 },

  completionCard: { alignItems: 'center', maxWidth: 360, width: '100%' },
  completedEmoji: { fontSize: 64, marginBottom: 16 },
  completedTitle: { color: palette.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  completedSubtitle: { color: palette.textSecondary, fontSize: 14, marginBottom: 24 },

  vocabSummary: { width: '100%', marginBottom: 32 },
  vocabSummaryLabel: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  vocabChip: { backgroundColor: palette.bgSurface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: palette.border },
  vocabChipText: { color: palette.xp, fontSize: 12, fontWeight: '600' },

  backButton: { backgroundColor: palette.accent, paddingVertical: 16, paddingHorizontal: 48, borderRadius: Radius.lg },
  backButtonText: { color: palette.bg, fontSize: 16, fontWeight: '700' },
});
