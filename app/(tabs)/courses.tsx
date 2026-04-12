import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform,
  ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchCurriculum, CurriculumUnit } from '@/services/curriculumService';
import { useAppContext } from '@/contexts/AppStateContext';
import { getCompletedCount } from '@/contexts/AppStateContext';
import { palette, Radius } from '@/constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 150;

export default function VideoScreen() {
  const [curriculum, setCurriculum] = useState<CurriculumUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { getLessonStage, getLessonProgress } = useAppContext();

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchCurriculum();
        setCurriculum(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.title}>Video</Text>
        <Text style={styles.subtitle}>Derslere ait klipleri izle</Text>
      </Animated.View>

      {curriculum.map((unit, unitIdx) => {
        const unitColor = unit.color || palette.primary;

        return (
          <View key={unit.id} style={styles.section}>
            {/* Section label */}
            <View style={styles.sectionHeader}>
              <View style={[styles.levelPill, { backgroundColor: unitColor + '15', borderColor: unitColor + '30' }]}>
                <Text style={[styles.levelText, { color: unitColor }]}>
                  {unit.cefr_level?.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.sectionTitle}>{unit.title_tr || unit.title}</Text>
              <Text style={styles.sectionCount}>{unit.lessons.length}</Text>
            </View>

            {/* Cards */}
            <FlatList
              data={unit.lessons}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              keyExtractor={(item) => item.id}
              renderItem={({ item: lesson, index }) => {
                const stage = getLessonStage(lesson.id);
                const isMastered = stage === 'mastered';
                const subProgress = getLessonProgress(lesson.id);
                const done = getCompletedCount(subProgress);

                return (
                  <Animated.View entering={FadeInRight.delay(index * 40).duration(250)}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.card,
                        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                      ]}
                      onPress={() => router.push(`/lesson-clips/${lesson.id}` as any)}
                    >
                      {/* Top area with icon */}
                      <View style={[styles.cardIcon, { backgroundColor: unitColor + '12' }]}>
                        {isMastered ? (
                          <Ionicons name="checkmark-circle" size={22} color={palette.success} />
                        ) : (
                          <Ionicons name="play-circle" size={22} color={unitColor} />
                        )}
                      </View>

                      {/* Title */}
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {lesson.title}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {lesson.title_tr}
                      </Text>

                      {/* Progress */}
                      {done > 0 && !isMastered && (
                        <View style={styles.cardProgress}>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${(done / 3) * 100}%`, backgroundColor: unitColor }]} />
                          </View>
                        </View>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              }}
            />
          </View>
        );
      })}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bg,
  },
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
    fontSize: 14,
    color: palette.textSecondary,
    marginTop: 4,
  },

  // Section
  section: {
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  sectionCount: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '500',
  },

  // Carousel
  carousel: {
    paddingHorizontal: 20,
    gap: 10,
  },

  // Card
  card: {
    width: CARD_WIDTH,
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textPrimary,
    lineHeight: 18,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 11,
    color: palette.textMuted,
    lineHeight: 15,
  },
  cardProgress: {
    marginTop: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: palette.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
