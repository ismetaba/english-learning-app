import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette, Radius, Shadows } from '@/constants/Colors';
import { useAppContext } from '@/contexts/AppStateContext';
import {
  generateDailyPlan,
  calculateCompletionPercent,
  type DailyTaskItem,
} from '@/services/dailyTaskGenerator';

const XP_PER_TASK = 10;

const TASK_META: Record<
  DailyTaskItem['type'],
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; description: string }
> = {
  'grammar-clip': {
    label: 'Grammar',
    color: palette.primary,
    icon: 'book',
    description: 'Review a grammar pattern with a short video clip',
  },
  'vocab-review': {
    label: 'Vocab',
    color: palette.accent,
    icon: 'chatbubbles',
    description: 'Practice vocabulary with spaced repetition flashcards',
  },
  'new-content': {
    label: 'New',
    color: palette.warning,
    icon: 'sparkles',
    description: 'Learn new material from your next lesson',
  },
  listening: {
    label: 'Listening',
    color: palette.error,
    icon: 'headset',
    description: 'Improve listening comprehension with audio exercises',
  },
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `~${mins}m`;
}

function ProgressRing({
  percent,
  size = 80,
  strokeWidth = 6,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: palette.bgSurface,
        }}
      />
      {/* Filled ring - approximate with a bordered view + rotation trick */}
      {/* For a simple MVP, show a filled circle overlay based on percent */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: percent >= 100 ? palette.success : palette.primary,
          borderTopColor: percent > 0 ? (percent >= 100 ? palette.success : palette.primary) : palette.bgSurface,
          borderRightColor: percent > 25 ? (percent >= 100 ? palette.success : palette.primary) : palette.bgSurface,
          borderBottomColor: percent > 50 ? (percent >= 100 ? palette.success : palette.primary) : palette.bgSurface,
          borderLeftColor: percent > 75 ? (percent >= 100 ? palette.success : palette.primary) : palette.bgSurface,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <Text style={styles.ringText}>{percent}%</Text>
    </View>
  );
}

export default function DailyTasksScreen() {
  const router = useRouter();
  const { progress, setDailyTasks, completeDailyTaskItem, addXP } = useAppContext();

  // On mount, check if daily tasks exist for today; if not, generate placeholder tasks
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (progress.dailyTasks?.date === today) return;

    const plan = generateDailyPlan({
      completedLessons: progress.completedLessons,
      lessonMastery: progress.lessonMastery,
      watchedClips: progress.watchedClips,
      dailyGoalMinutes: progress.dailyGoalMinutes || 10,
      vocabWordsDue: [], // MVP: no real vocab scheduling yet
      availableClipsByLesson: {}, // MVP: no clips tagged yet
      nextUncompletedLessonId: null, // MVP placeholder
    });

    // If the generator returns no items (no real data), create placeholder tasks
    if (plan.items.length === 0) {
      const placeholderItems: DailyTaskItem[] = [
        {
          id: `grammar-clip-${today}-0`,
          type: 'grammar-clip',
          estimatedSeconds: 30,
        },
        {
          id: `vocab-review-${today}-0`,
          type: 'vocab-review',
          estimatedSeconds: 15,
        },
        {
          id: `vocab-review-${today}-1`,
          type: 'vocab-review',
          estimatedSeconds: 15,
        },
        {
          id: `new-content-${today}-0`,
          type: 'new-content',
          estimatedSeconds: 30,
        },
        {
          id: `listening-${today}-0`,
          type: 'listening',
          estimatedSeconds: 45,
        },
      ];
      setDailyTasks({ date: today, items: placeholderItems, completedItemIds: [] });
    } else {
      setDailyTasks(plan);
    }
  }, []);

  const dailyTasks = progress.dailyTasks;
  const completedIds = new Set(dailyTasks?.completedItemIds ?? []);
  const completedCount = completedIds.size;
  const totalCount = dailyTasks?.items.length ?? 0;
  const percent = dailyTasks ? calculateCompletionPercent(dailyTasks) : 0;
  const earnedXP = completedCount * XP_PER_TASK;

  const handleToggleComplete = (itemId: string) => {
    if (completedIds.has(itemId)) return; // already completed
    completeDailyTaskItem(itemId);
    addXP(XP_PER_TASK);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today's Tasks</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Progress Section */}
        <View style={styles.progressCard}>
          <ProgressRing percent={percent} />
          <View style={styles.progressInfo}>
            <Text style={styles.progressTitle}>
              {completedCount} of {totalCount} completed
            </Text>
            <Text style={styles.progressSubtitle}>
              {percent >= 100 ? 'All done for today!' : 'Keep going, you got this!'}
            </Text>
            <View style={styles.xpRow}>
              <Ionicons name="flash" size={16} color={palette.xp} />
              <Text style={styles.xpText}>{earnedXP} XP earned</Text>
            </View>
          </View>
        </View>

        {/* MVP Notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={18} color={palette.textSecondary} />
          <Text style={styles.noticeText}>
            These are placeholder tasks. As you complete lessons and add clips, your daily plan will
            be personalized automatically.
          </Text>
        </View>

        {/* Task List */}
        {dailyTasks?.items.map((item) => {
          const meta = TASK_META[item.type];
          const isCompleted = completedIds.has(item.id);

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.taskItem, { borderLeftWidth: 3, borderLeftColor: meta.color }, isCompleted && styles.taskItemCompleted]}
              onPress={() => handleToggleComplete(item.id)}
              activeOpacity={0.7}
            >
              {/* Checkbox */}
              {isCompleted ? (
                <Ionicons name="checkmark-circle" size={24} color={palette.success} style={{ marginRight: 12, marginTop: 2 }} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={palette.textMuted} style={{ marginRight: 12, marginTop: 2 }} />
              )}

              {/* Task Content */}
              <View style={styles.taskContent}>
                <View style={styles.taskTopRow}>
                  <View style={[styles.badge, { backgroundColor: meta.color + '20' }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.color} />
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.timeText}>{formatTime(item.estimatedSeconds)}</Text>
                </View>
                <Text style={[styles.taskDescription, isCompleted && styles.taskDescriptionCompleted]}>
                  {meta.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 16,
    ...Shadows.card,
  },
  progressInfo: {
    flex: 1,
    marginLeft: 20,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  progressSubtitle: {
    fontSize: 14,
    color: palette.textSecondary,
    marginBottom: 8,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  xpText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.xp,
  },
  ringText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.sm,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: palette.textSecondary,
    lineHeight: 18,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 10,
    ...Shadows.cardSmall,
  },
  taskItemCompleted: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '500',
  },
  taskDescription: {
    fontSize: 14,
    color: palette.textSecondary,
    lineHeight: 20,
  },
  taskDescriptionCompleted: {
    textDecorationLine: 'line-through',
    color: palette.textMuted,
  },
});
