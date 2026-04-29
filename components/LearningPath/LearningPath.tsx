import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { fetchCurriculum, CurriculumUnit, CurriculumLesson } from '@/services/curriculumService';
import { useAppContext } from '@/contexts/AppStateContext';
import { LessonStage } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';
import PathNode, { NodeState } from './PathNode';

function getNodeState(
  lesson: CurriculumLesson,
  completedLessons: string[],
  getLessonStage: (id: string) => LessonStage | null,
  lessonIndex: number,
  allLessons: CurriculumLesson[],
): NodeState {
  const stage = getLessonStage(lesson.id);
  if (stage === 'mastered') return 'completed';
  if (completedLessons.includes(lesson.id)) return 'completed';

  if (lessonIndex === 0) return 'available';

  const prevLesson = allLessons[lessonIndex - 1];
  if (prevLesson) {
    const prevStage = getLessonStage(prevLesson.id);
    if (prevStage === 'mastered' || completedLessons.includes(prevLesson.id)) {
      return 'available';
    }
  }

  return 'locked';
}

const CONNECTOR_H = 80;

function Connector() {
  return (
    <View style={styles.connectorRow} pointerEvents="none">
      <Svg width={4} height={CONNECTOR_H}>
        <Path
          d={`M 2 0 L 2 ${CONNECTOR_H}`}
          stroke={palette.textDisabled}
          strokeWidth={2}
          strokeDasharray="4,7"
          strokeLinecap="round"
          opacity={0.65}
        />
      </Svg>
    </View>
  );
}

export default function LearningPath() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const a1Units = curriculum.filter(u => u.cefr_level === 'a1');
  const a1Lessons = a1Units.flatMap(u => u.lessons);
  const totalLessons = a1Lessons.length;
  const completedCount = a1Lessons.filter((l, idx) =>
    getNodeState(l, progress.completedLessons, getLessonStage, idx, a1Lessons) === 'completed'
  ).length;

  const handleNodePress = (lesson: CurriculumLesson) => {
    router.push(`/learn/${lesson.id}` as any);
  };

  const handleSubTaskPress = (lessonId: string, task: 'learn' | 'vocab' | 'watch') => {
    router.push(`/learn/${lessonId}?mode=${task}` as any);
  };

  const topInset = Platform.OS === 'web' ? 16 : insets.top;

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
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: topInset + 56, paddingBottom: 180 }]}
        showsVerticalScrollIndicator={false}
      >
        {a1Units.map((unit) => {
          const unitColor = unit.color || palette.primary;

          return (
            <View key={unit.id} style={styles.pathContainer}>
              {unit.lessons.map((lesson, lessonIdx) => {
                const state = getNodeState(lesson, progress.completedLessons, getLessonStage, lessonIdx, a1Lessons);
                const prevState = lessonIdx > 0
                  ? getNodeState(unit.lessons[lessonIdx - 1], progress.completedLessons, getLessonStage, lessonIdx - 1, a1Lessons)
                  : null;
                const isCurrent = state === 'available' && (lessonIdx === 0 || prevState === 'completed');
                const isLeft = lessonIdx % 2 === 0;
                const isLast = lessonIdx === unit.lessons.length - 1;

                const node = (
                  <PathNode
                    title={lesson.title}
                    type={lesson.lesson_type as any}
                    state={state}
                    color={unitColor}
                    onPress={() => handleNodePress(lesson)}
                    onSubTaskPress={(task) => handleSubTaskPress(lesson.id, task)}
                    lessonNumber={lessonIdx + 1}
                    subProgress={state !== 'locked' ? getLessonProgress(lesson.id) : null}
                    isCurrent={isCurrent}
                  />
                );

                return (
                  <React.Fragment key={lesson.id}>
                    <View style={styles.nodeRow}>
                      <View style={styles.nodeHalf}>{isLeft ? node : null}</View>
                      <View style={styles.nodeHalf}>{!isLeft ? node : null}</View>
                    </View>
                    {!isLast && <Connector />}
                  </React.Fragment>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <View pointerEvents="none" style={[styles.progressChip, { top: topInset + 4 }]}>
        <Text style={styles.progressChipText}>{completedCount}/{totalLessons}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingBottom: 180,
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
    color: palette.error,
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

  progressChip: {
    position: 'absolute',
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(17,24,39,0.8)',
  },
  progressChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textSecondary,
    letterSpacing: 0.3,
  },

  pathContainer: {
    paddingHorizontal: 8,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  nodeHalf: {
    flex: 1,
    alignItems: 'center',
  },
  connectorRow: {
    alignItems: 'center',
    paddingVertical: 14,
  },
});
