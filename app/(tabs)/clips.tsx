import React from 'react';
import { StyleSheet, ScrollView, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { playlists } from '@/data/clips';
import { palette, Shadows, Radius } from '@/constants/Colors';

export default function ClipsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Kesitler</Text>
        <Text style={styles.screenSubtitle}>Farklı filmlerden kısa kesitlerle öğren</Text>
      </Animated.View>

      {playlists.map((playlist, idx) => (
        <Animated.View key={playlist.id} entering={FadeInDown.delay(100 + idx * 100).duration(500)}>
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={() => router.push(`/clips/${playlist.id}`)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>{'🎞️'}</Text>
              <View style={styles.clipCount}>
                <Text style={styles.clipCountText}>{playlist.clips.length} clips</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>{playlist.title}</Text>
            <Text style={styles.cardDescription}>{playlist.description}</Text>

            <View style={styles.movieList}>
              {[...new Set(playlist.clips.map(c => c.movieTitle))].map((title, i) => (
                <View key={i} style={styles.movieChip}>
                  <Text style={styles.movieChipText}>{title}</Text>
                </View>
              ))}
            </View>

            <View style={styles.vocabRow}>
              {playlist.vocabFocus.slice(0, 6).map((word, i) => (
                <View key={i} style={styles.vocabChip}>
                  <Text style={styles.vocabChipText}>{word}</Text>
                </View>
              ))}
              {playlist.vocabFocus.length > 6 && (
                <Text style={styles.moreText}>+{playlist.vocabFocus.length - 6}</Text>
              )}
            </View>

            <View style={styles.playButton}>
              <Text style={styles.playButtonText}>{'▶  Başla'}</Text>
            </View>
          </Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },

  screenHeader: { marginBottom: 24 },
  screenTitle: { color: palette.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 6 },
  screenSubtitle: { color: palette.textMuted, fontSize: 14 },

  card: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
    ...Shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardEmoji: { fontSize: 32 },
  clipCount: { backgroundColor: palette.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  clipCountText: { color: palette.accent, fontSize: 12, fontWeight: '700' },

  cardTitle: { color: palette.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 6 },
  cardDescription: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 },

  movieList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  movieChip: { backgroundColor: palette.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  movieChipText: { color: palette.primaryLight, fontSize: 11, fontWeight: '600' },

  vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  vocabChip: { backgroundColor: palette.bgSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: palette.border },
  vocabChipText: { color: palette.xp, fontSize: 11, fontWeight: '600' },
  moreText: { color: palette.textMuted, fontSize: 11, alignSelf: 'center' },

  playButton: { backgroundColor: palette.accent, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
  playButtonText: { color: palette.bg, fontSize: 15, fontWeight: '700' },
});
