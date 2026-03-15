import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { learningPath, LessonNode } from '@/data/learningPath';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';
import PathNode, { NodeState } from './PathNode';

function getNodeState(
  lesson: LessonNode,
  completedLessons: string[],
  learnedWords: string[],
  watchedScenes: string[],
  allLessons: LessonNode[],
): NodeState {
  if (lesson.type === 'structure' && completedLessons.includes(lesson.contentId)) return 'completed';
  if (lesson.type === 'vocab' && completedLessons.includes(lesson.id)) return 'completed';
  if (lesson.type === 'scene' && watchedScenes.includes(lesson.contentId)) return 'completed';
  if (completedLessons.includes(lesson.id)) return 'completed';

  const prereqsMet = lesson.requiredLessonIds.every((reqId) => {
    const reqLesson = allLessons.find(l => l.id === reqId);
    if (!reqLesson) return true;
    return getNodeState(reqLesson, completedLessons, learnedWords, watchedScenes, allLessons) === 'completed';
  });

  if (lesson.requiredLessonIds.length === 0) return 'available';
  return prereqsMet ? 'available' : 'locked';
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
  const { progress } = useAppContext();
  const { t } = useTranslation();

  const allLessons = learningPath.flatMap(u => u.lessons);
  const totalLessons = allLessons.length;
  const completedCount = allLessons.filter(l =>
    getNodeState(l, progress.completedLessons, progress.learnedWords, progress.watchedScenes, allLessons) === 'completed'
  ).length;
  const progressPercent = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  const handleNodePress = (lesson: LessonNode) => {
    if (lesson.type === 'structure') {
      router.push(`/lessons/${lesson.contentId}` as any);
    } else if (lesson.type === 'vocab') {
      router.push('/(tabs)/vocab' as any);
    } else if (lesson.type === 'scene') {
      router.push(`/scenes/${lesson.contentId}` as any);
    }
  };

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
                  <Text style={styles.streakEmoji}>{'🔥'}</Text>
                  <Text style={styles.streakCount}>{progress.streak}</Text>
                </View>
              )}
              <View style={styles.xpPill}>
                <Text style={styles.xpIcon}>{'⚡'}</Text>
                <Text style={styles.xpCount}>{progress.xp}</Text>
              </View>
            </View>
          </View>

          {/* Progress bar */}
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

      {/* ─── Units ─────────────── */}
      {learningPath.map((unit, unitIdx) => {
        const unitCompleted = unit.lessons.filter(l =>
          getNodeState(l, progress.completedLessons, progress.learnedWords, progress.watchedScenes, allLessons) === 'completed'
        ).length;
        const unitTotal = unit.lessons.length;

        return (
          <Animated.View
            key={unit.id}
            entering={FadeInDown.delay(200 + unitIdx * 150).duration(500)}
            style={styles.unitContainer}
          >
            {/* Unit header card */}
            <View style={[styles.unitHeader, { borderLeftColor: unit.color }]}>
              <View style={styles.unitHeaderInner}>
                <View style={[styles.unitBadge, { backgroundColor: unit.color + '20' }]}>
                  <Text style={[styles.unitBadgeText, { color: unit.color }]}>{t('unit')} {unitIdx + 1}</Text>
                </View>
                <Text style={styles.unitTitle}>{unit.title}</Text>
                <Text style={styles.unitDescription}>{unit.description}</Text>
                <View style={styles.unitProgressRow}>
                  <View style={styles.unitProgressBar}>
                    <View
                      style={[
                        styles.unitProgressFill,
                        {
                          width: `${unitTotal > 0 ? (unitCompleted / unitTotal) * 100 : 0}%`,
                          backgroundColor: unit.color,
                          shadowColor: unit.color,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 6,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.unitProgressText}>{unitCompleted}/{unitTotal}</Text>
                </View>
              </View>
            </View>

            {/* Lesson nodes */}
            <View style={styles.pathContainer}>
              {unit.lessons.map((lesson, lessonIdx) => {
                const state = getNodeState(lesson, progress.completedLessons, progress.learnedWords, progress.watchedScenes, allLessons);
                const isLeft = lessonIdx % 2 === 0;
                const isLast = lessonIdx === unit.lessons.length - 1;

                return (
                  <View key={lesson.id}>
                    <Animated.View
                      entering={FadeInUp.delay(lessonIdx * 80).duration(400)}
                      style={[
                        styles.nodeRow,
                        isLeft ? styles.nodeLeft : styles.nodeRight,
                      ]}
                    >
                      <PathNode
                        title={lesson.title}
                        icon={lesson.icon}
                        type={lesson.type}
                        state={state}
                        color={unit.color}
                        onPress={() => handleNodePress(lesson)}
                        delay={lessonIdx * 80}
                      />
                    </Animated.View>
                    {/* Connector */}
                    {!isLast && (
                      <View style={styles.connectorWrap}>
                        <View
                          style={[
                            styles.connectorLine,
                            {
                              backgroundColor: state === 'completed'
                                ? unit.color + '4D'
                                : palette.border,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.connectorDot,
                            {
                              backgroundColor: state === 'completed'
                                ? unit.color
                                : palette.textDisabled,
                            },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </Animated.View>
        );
      })}

      {/* Footer */}
      <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.footer}>
        <View style={styles.footerCard}>
          <Text style={styles.footerEmoji}>{'🚀'}</Text>
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
  streakEmoji: {
    fontSize: 14,
  },
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
  xpIcon: {
    fontSize: 13,
  },
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
    height: 8,
    backgroundColor: palette.bgSurface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: palette.success,
    borderRadius: 4,
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
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  nodeRow: {
    paddingVertical: 6,
  },
  nodeLeft: {
    alignItems: 'flex-start',
    paddingLeft: 32,
  },
  nodeRight: {
    alignItems: 'flex-end',
    paddingRight: 32,
  },
  connectorWrap: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
  },
  connectorLine: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  connectorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    position: 'absolute',
    bottom: 0,
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
  footerEmoji: {
    fontSize: 18,
  },
  footerText: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: '600',
  },
});
