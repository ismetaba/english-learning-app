import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchCurriculum, CurriculumUnit, CurriculumLesson } from '@/services/curriculumService';
import { useAppContext } from '@/contexts/AppStateContext';
import { LessonStage, LessonProgress } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';
import PathNode, { NodeState } from './PathNode';
import RoadPath, { useRoadPositions, NODE_SPACING } from './RoadPath';
import DailyTaskCard from '@/components/DailyTaskCard/DailyTaskCard';

function getNodeState(
  lesson: CurriculumLesson,
  completedLessons: string[],
  getLessonStage: (id: string) => LessonStage | null,
  lessonIndex: number,
  allLessons: CurriculumLesson[],
): NodeState {
  // Check mastery stage first
  const stage = getLessonStage(lesson.id);
  if (stage === 'mastered') return 'completed';
  if (completedLessons.includes(lesson.id)) return 'completed';

  // First lesson in unit is always available
  if (lessonIndex === 0) return 'available';

  // Check if all preceding lessons in the unit are completed
  const prevLesson = allLessons[lessonIndex - 1];
  if (prevLesson) {
    const prevStage = getLessonStage(prevLesson.id);
    if (prevStage === 'mastered' || completedLessons.includes(prevLesson.id)) {
      return 'available';
    }
  }

  return 'locked';
}

// Greeting based on time
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function LearningPath() {
  const router = useRouter();
  const { progress, getLessonStage, getLessonProgress } = useAppContext();
  const { t } = useTranslation();

  const [curriculum, setCurriculum] = useState<CurriculumUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCurriculum = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCurriculum();
      setCurriculum(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load curriculum');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurriculum();
  }, []);

  const allLessons = curriculum.flatMap(u => u.lessons);
  const totalLessons = allLessons.length;
  const completedCount = allLessons.filter((l, idx) =>
    getNodeState(l, progress.completedLessons, getLessonStage, idx, allLessons) === 'completed'
  ).length;
  const progressPercent = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  const handleNodePress = (lesson: CurriculumLesson) => {
    router.push(`/learn/${lesson.id}` as any);
  };

  // Road positions for A1 unit (first unit)
  const a1Unit = curriculum.find(u => u.cefr_level === 'a1');
  const { positions: roadPositions } = useRoadPositions(a1Unit?.lessons?.length || 0);

  const handleSubTaskPress = (lessonId: string, task: 'learn' | 'vocab' | 'watch') => {
    router.push(`/learn/${lessonId}?mode=${task}` as any);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorEmoji}>{'!'}</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadCurriculum}>
          <Text style={styles.retryButtonText}>{t('retry') || 'Retry'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ─── Hero Header ─────────────── */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.heroHeader}>
        <View style={styles.heroGradient}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{getGreeting()} !</Text>
              <Text style={styles.heroTitle}>{t('yourJourney')}</Text>
            </View>
            <View style={styles.heroStats}>
              {progress.streak > 0 && (
                <View style={styles.streakPill}>
                  <Ionicons name="flame" size={16} color={palette.streak} />
                  <Text style={styles.streakCount}>{progress.streak}</Text>
                </View>
              )}
              <View style={styles.xpPill}>
                <Ionicons name="flash" size={15} color={palette.xp} />
                <Text style={styles.xpCount}>{progress.xp}</Text>
              </View>
            </View>
          </View>
          <View style={styles.heroProgressSection}>
            <View style={styles.heroProgressBar}>
              <View style={[styles.heroProgressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.heroProgressText}>
              {completedCount}/{totalLessons} {t('lessonsCompleted')}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ─── Units (A1 only) ─────────────── */}
      {curriculum.filter(u => u.cefr_level === 'a1').map((unit, unitIdx) => {
        const unitLessonsStartIdx = curriculum.slice(0, curriculum.indexOf(unit)).reduce((sum, u) => sum + u.lessons.length, 0);
        const unitCompleted = unit.lessons.filter((l, idx) =>
          getNodeState(l, progress.completedLessons, getLessonStage, unitLessonsStartIdx + idx, allLessons) === 'completed'
        ).length;
        const unitTotal = unit.lessons.length;

        return (
          <Animated.View
            key={unit.id}
            entering={FadeInDown.delay(200 + unitIdx * 150).duration(500)}
            style={styles.unitContainer}
          >
            {/* Unit header */}
            <View style={[styles.unitHeader, { borderLeftColor: unit.color || palette.primary }]}>
              <View style={styles.unitHeaderInner}>
                <View style={[styles.unitBadge, { backgroundColor: (unit.color || palette.primary) + '20' }]}>
                  <Text style={[styles.unitBadgeText, { color: unit.color || palette.primary }]}>{t('unit')} {unitIdx + 1}</Text>
                </View>
                <Text style={styles.unitTitle}>{unit.title}</Text>
                <Text style={styles.unitDescription}>{unit.description || ''}</Text>
                <View style={styles.unitProgressRow}>
                  <View style={styles.unitProgressBar}>
                    <View style={[styles.unitProgressFill, { width: `${unitTotal > 0 ? (unitCompleted / unitTotal) * 100 : 0}%`, backgroundColor: unit.color || palette.primary }]} />
                  </View>
                  <Text style={styles.unitProgressText}>{unitCompleted}/{unitTotal}</Text>
                </View>
              </View>
            </View>

            {/* Lesson nodes with simple connecting lines */}
            <View style={styles.pathContainer}>
              {unit.lessons.map((lesson, lessonIdx) => {
                    const globalIdx = unitLessonsStartIdx + lessonIdx;
                    const state = getNodeState(lesson, progress.completedLessons, getLessonStage, globalIdx, allLessons);
                    const prevState = lessonIdx > 0 ? getNodeState(unit.lessons[lessonIdx - 1], progress.completedLessons, getLessonStage, globalIdx - 1, allLessons) : null;
                    const isCurrent = state === 'available' && (lessonIdx === 0 || prevState === 'completed');
                    const unitColor = unit.color || palette.primary;
                    const isLast = lessonIdx === unit.lessons.length - 1;
                    const isLeft = lessonIdx % 2 === 0;
                    const done = state === 'completed';

                    return (
                      <View key={lesson.id}>
                        {/* Node */}
                        <View style={[styles.nodeRow, isLeft ? styles.nodeLeft : styles.nodeRight]}>
                          <PathNode
                            title={lesson.title}
                            type={lesson.lesson_type as any}
                            state={state}
                            color={unitColor}
                            onPress={() => handleNodePress(lesson)}
                            onSubTaskPress={(task) => handleSubTaskPress(lesson.id, task)}
                            delay={lessonIdx * 50}
                            lessonNumber={lessonIdx + 1}
                            subProgress={state !== 'locked' ? getLessonProgress(lesson.id) : null}
                            isCurrent={isCurrent}
                          />
                        </View>
                        {/* Connecting line */}
                        {!isLast && (
                          <View style={styles.lineWrap}>
                            <View style={[
                              styles.lineBar,
                              done ? { backgroundColor: unitColor + '40' } : { backgroundColor: palette.border + '30' },
                              done ? {} : styles.lineDashed,
                            ]} />
                          </View>
                        )}
                      </View>
                    );
                  })}
            </View>
          </Animated.View>
        );
      })}

      {/* ─── Coming Soon for A2+ ─────────────── */}
      <View style={styles.comingSoonCard}>
        <Ionicons name="lock-closed" size={24} color={palette.textMuted} />
        <Text style={styles.comingSoonTitle}>A2 - C2 Coming Soon</Text>
        <Text style={styles.comingSoonText}>Complete A1 to unlock more levels</Text>
      </View>

      {/* Footer */}
      <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.footer}>
        <View style={styles.footerCard}>
          <Ionicons name="rocket" size={20} color={palette.textSecondary} />
          <Text style={styles.footerText}>{t('moreLessonsComing')}</Text>
        </View>
      </Animated.View>
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

  // Clean header (no box)
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerPills: {
    flexDirection: 'row',
    gap: 8,
  },
  headerProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: palette.bgSurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.success,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
  },

  // Section label (replaces big unit card)
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: palette.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMuted,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: palette.textSecondary,
    fontWeight: '600',
  },
  errorEmoji: {
    fontSize: 40,
    fontWeight: '800',
    color: palette.error || '#EF4444',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ─── Hero Header ───
  heroHeader: {
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  heroGradient: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.primaryGlow,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 99, 72, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 4,
  },
  streakEmoji: {},
  streakCount: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.streak,
  },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.xpGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 4,
  },
  xpIcon: {},
  xpCount: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.xp,
  },

  // Hero progress
  heroProgressSection: {
    gap: 8,
  },
  heroProgressBar: {
    height: 10,
    backgroundColor: palette.bgSurface,
    borderRadius: 5,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: palette.success,
    borderRadius: 5,
    shadowColor: palette.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  heroProgressText: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: '600',
  },

  // ─── Units ───
  unitContainer: {
    marginBottom: 4,
  },
  unitHeader: {
    marginHorizontal: 16,
    borderRadius: Radius.xl,
    padding: 0,
    marginBottom: 20,
    marginTop: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: palette.bgCard,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  unitHeaderInner: {
    padding: 22,
    zIndex: 2,
  },
  unitBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: 10,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  unitTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  unitDescription: {
    fontSize: 14,
    color: palette.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  unitProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unitProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: palette.bgSurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  unitProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  unitProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textSecondary,
  },

  // ─── Path ───
  pathContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lineWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  lineBar: {
    width: 2.5,
    height: 30,
    borderRadius: 2,
  },
  lineDashed: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'transparent',
    width: 0,
    height: 30,
  },
  nodeRow: {
    paddingVertical: 4,
  },
  nodeLeft: {
    alignItems: 'flex-start',
    paddingLeft: 24,
  },
  nodeRight: {
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  roadWrap: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  roadDash: {
    width: 4,
    height: 6,
    borderRadius: 2,
  },

  // ─── Coming Soon ───
  comingSoonCard: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 32,
    borderRadius: Radius.xl,
    backgroundColor: palette.bgCard,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    gap: 8,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: palette.textSecondary,
  },
  comingSoonText: {
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center' as const,
  },

  // ─── Footer ───
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.bgCard,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: palette.border,
  },
  footerEmoji: {},
  footerText: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: '600',
  },
});
