import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette, Radius, Shadows } from '@/constants/Colors';
import { useAppContext } from '@/contexts/AppStateContext';
import { calculateCompletionPercent } from '@/services/dailyTaskGenerator';

function MiniProgressRing({ percent, size = 44 }: { percent: number; size?: number }) {
  const strokeWidth = 4;
  const isComplete = percent >= 100;
  const activeColor = isComplete ? palette.success : palette.primary;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: activeColor,
          borderTopColor: percent > 0 ? activeColor : palette.bgSurface,
          borderRightColor: percent > 25 ? activeColor : palette.bgSurface,
          borderBottomColor: percent > 50 ? activeColor : palette.bgSurface,
          borderLeftColor: percent > 75 ? activeColor : palette.bgSurface,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      {isComplete ? (
        <Ionicons name="checkmark" size={18} color={palette.success} />
      ) : (
        <Text style={styles.ringPercent}>{percent}%</Text>
      )}
    </View>
  );
}

export default function DailyTaskCard() {
  const router = useRouter();
  const { progress } = useAppContext();
  const dailyTasks = progress.dailyTasks;

  const today = new Date().toISOString().slice(0, 10);
  const isToday = dailyTasks?.date === today;
  const hasData = dailyTasks && isToday;

  const completedCount = hasData ? dailyTasks.completedItemIds.length : 0;
  const totalCount = hasData ? dailyTasks.items.length : 0;
  const percent = hasData ? calculateCompletionPercent(dailyTasks) : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/daily-tasks' as any)}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <View style={styles.textSection}>
          <View style={styles.titleRow}>
            <Ionicons name="calendar" size={20} color={palette.primary} />
            <Text style={styles.title}>Today's Tasks</Text>
          </View>
          {hasData ? (
            <Text style={styles.subtitle}>
              {completedCount} of {totalCount} completed
            </Text>
          ) : (
            <Text style={styles.subtitle}>Tap to generate your daily plan</Text>
          )}
        </View>
        <View style={styles.rightSection}>
          {hasData ? (
            <MiniProgressRing percent={percent} />
          ) : (
            <View style={styles.goCircle}>
              <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.borderAccent,
    ...Shadows.cardSmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textSection: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  rightSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  goCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
