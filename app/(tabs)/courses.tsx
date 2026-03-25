import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform,
  ActivityIndicator, Image,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { palette, Radius, Shadows } from '@/constants/Colors';

// On physical devices, localhost doesn't work — use the Mac's LAN IP.
// On web/simulator, localhost is fine.
const DEV_HOST = Platform.OS === 'web' ? 'localhost' : '10.40.16.20';
const ADMIN_API = __DEV__ ? `http://${DEV_HOST}:3000` : 'https://english-learning-admin.fly.dev';

interface LessonSummary {
  id: number;
  title: string;
  title_tr: string | null;
  description: string | null;
  level: string;
  grammar_focus: string | null;
  sentence_count: number;
}

const LEVEL_COLORS: Record<string, string> = {
  elementary: '#47C9FF',
  beginner: '#00D4AA',
  intermediate: '#FFB347',
  advanced: '#FF6B6B',
};

const LEVEL_LABELS: Record<string, string> = {
  elementary: 'A2',
  beginner: 'A1',
  intermediate: 'B1',
  advanced: 'B2+',
};

export default function CoursesScreen() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ADMIN_API}/api/lessons/list`);
        if (!res.ok) throw new Error('Failed to load courses');
        const data = await res.json();
        setLessons(data);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Loading courses...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.title}>Video Dersler</Text>
        <Text style={styles.subtitle}>Dizi ve filmlerden gramer öğren</Text>
      </Animated.View>

      {/* Grammar focus card */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={styles.focusCard}>
          <View style={styles.focusIcon}>
            <Text style={styles.focusIconText}>🎯</Text>
          </View>
          <View style={styles.focusContent}>
            <Text style={styles.focusTitle}>Gramer Odağı</Text>
            <Text style={styles.focusDesc}>
              Her derste hedef cümleler renkli vurgulanır. Video otomatik durur ve cümle yapısını gösterir.
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Color legend */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={styles.legendCard}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#A594FF' }]} />
            <Text style={styles.legendText}>Özne (Subject)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FFB347' }]} />
            <Text style={styles.legendText}>Yrd. Fiil (Aux)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#5DFFC8' }]} />
            <Text style={styles.legendText}>Devamı (Pred.)</Text>
          </View>
        </View>
      </Animated.View>

      {/* Course cards */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Text style={styles.errorHint}>Admin panel çalışıyor mu kontrol edin</Text>
        </View>
      )}

      {lessons.map((lesson, idx) => {
        const levelColor = LEVEL_COLORS[lesson.level] || palette.primary;
        const levelLabel = LEVEL_LABELS[lesson.level] || lesson.level;

        return (
          <Animated.View key={lesson.id} entering={FadeInDown.delay(300 + idx * 80).duration(400)}>
            <Pressable
              style={({ pressed }) => [
                styles.courseCard,
                pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
              ]}
              onPress={() => router.push(`/video-lessons/${lesson.id}` as any)}
            >
              {/* Card accent */}
              <View style={[styles.cardAccent, { backgroundColor: levelColor }]} />

              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <View style={[styles.levelBadge, { backgroundColor: levelColor + '20' }]}>
                      <Text style={[styles.levelBadgeText, { color: levelColor }]}>{levelLabel}</Text>
                    </View>
                    {lesson.grammar_focus && (
                      <View style={styles.grammarBadge}>
                        <Text style={styles.grammarBadgeText}>{lesson.grammar_focus}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.cardTitle}>{lesson.title}</Text>
                {lesson.title_tr && (
                  <Text style={styles.cardTitleTr}>{lesson.title_tr}</Text>
                )}

                {lesson.description && (
                  <Text style={styles.cardDesc} numberOfLines={2}>{lesson.description}</Text>
                )}

                <View style={styles.cardBottom}>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatIcon}>🎬</Text>
                    <Text style={styles.cardStatText}>{lesson.sentence_count} cümle</Text>
                  </View>
                  <View style={styles.cardPlay}>
                    <Text style={styles.cardPlayText}>Başla →</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}

      {lessons.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyText}>Henüz ders eklenmemiş</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bg,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.textMuted,
  },

  // Header
  header: {
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: palette.textSecondary,
    marginTop: 4,
    lineHeight: 22,
  },

  // Focus card
  focusCard: {
    flexDirection: 'row',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  focusIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusIconText: {
    fontSize: 20,
  },
  focusContent: {
    flex: 1,
  },
  focusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  focusDesc: {
    fontSize: 12,
    color: palette.textSecondary,
    lineHeight: 18,
  },

  // Legend
  legendCard: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textSecondary,
  },

  // Error
  errorCard: {
    backgroundColor: palette.errorSoft,
    borderRadius: Radius.md,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: palette.error,
    fontWeight: '600',
  },
  errorHint: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 4,
  },

  // Course cards
  courseCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    ...Shadows.card,
  },
  cardAccent: {
    height: 4,
  },
  cardBody: {
    padding: 20,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardInfo: {
    flexDirection: 'row',
    gap: 8,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  grammarBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  grammarBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.primary,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 2,
  },
  cardTitleTr: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: palette.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardStatIcon: {
    fontSize: 14,
  },
  cardStatText: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  cardPlay: {
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  cardPlayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: palette.textMuted,
  },
});
