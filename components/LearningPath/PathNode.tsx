import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';
import type { LessonStage } from '@/contexts/AppStateContext';

export type NodeState = 'locked' | 'available' | 'completed';

interface PathNodeProps {
  title: string;
  icon: string;
  type: string;
  state: NodeState;
  color: string;
  onPress: () => void;
  delay?: number;
  masteryStage?: LessonStage | null;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<string, IoniconsName> = {
  structure: 'book-outline',
  grammar: 'book-outline',
  vocab: 'chatbubbles-outline',
  scene: 'videocam-outline',
  review: 'star-outline',
};

const TYPE_LABELS: Record<string, string> = {
  structure: 'grammar',
  grammar: 'grammar',
  vocab: 'vocab',
  scene: 'scene',
  review: 'review',
};

const STAGE_LABELS: Record<string, string> = {
  learn: 'Learn',
  watch: 'Watch',
  practice: 'Practice',
  reinforce: 'Reinforce',
  mastered: 'Mastered',
  review_needed: 'Review',
};

const STAGE_COLORS: Record<string, string> = {
  learn: '#3B82F6',
  watch: '#8B5CF6',
  practice: '#F59E0B',
  reinforce: '#EC4899',
  mastered: '#10B981',
  review_needed: '#EF4444',
};

export default function PathNode({ title, icon, type, state, color, onPress, delay = 0, masteryStage }: PathNodeProps) {
  const isLocked = state === 'locked';
  const isCompleted = state === 'completed';
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      disabled={isLocked}
      style={({ pressed }) => [
        styles.container,
        pressed && !isLocked && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <Animated.View entering={ZoomIn.delay(delay).duration(400)} style={styles.innerWrap}>
        {/* Outer ring for available state */}
        {!isLocked && !isCompleted && (
          <View style={[styles.outerRing, { borderColor: color }]} />
        )}

        <View
          style={[
            styles.circle,
            isLocked && styles.lockedCircle,
            !isLocked && !isCompleted && {
              borderColor: color,
              borderWidth: 3,
              backgroundColor: palette.bgCard,
              shadowColor: color,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            },
            isCompleted && {
              backgroundColor: color,
              borderWidth: 0,
              shadowColor: color,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 8,
            },
          ]}
        >
          {isLocked ? (
            <Ionicons name="lock-closed" size={20} color={palette.textDisabled} />
          ) : isCompleted ? (
            <Ionicons name="checkmark" size={28} color="#fff" />
          ) : (
            <Ionicons name={TYPE_ICONS[type] || 'help-circle-outline'} size={24} color={color} />
          )}
        </View>

        <Text
          style={[
            styles.title,
            isLocked && styles.lockedTitle,
            isCompleted && styles.completedTitle,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {!isLocked && (
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.typeBadge,
                isCompleted
                  ? { backgroundColor: color + '18' }
                  : { backgroundColor: palette.bgSurface },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  isCompleted ? { color } : { color: palette.textMuted },
                ]}
              >
                {t(TYPE_LABELS[type] || type)}
              </Text>
            </View>
            {masteryStage && masteryStage !== 'mastered' && (
              <View
                style={[
                  styles.stageBadge,
                  { backgroundColor: (STAGE_COLORS[masteryStage] || palette.primary) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.stageBadgeText,
                    { color: STAGE_COLORS[masteryStage] || palette.primary },
                  ]}
                >
                  {STAGE_LABELS[masteryStage] || masteryStage}
                </Text>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 120,
  },
  innerWrap: {
    alignItems: 'center',
    width: 120,
  },
  outerRing: {
    position: 'absolute',
    top: -6,
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderStyle: 'solid',
    opacity: 0.15,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedCircle: {
    backgroundColor: palette.bgSurface,
    borderWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textPrimary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  lockedTitle: {
    color: palette.textMuted,
    fontWeight: '500',
  },
  completedTitle: {
    color: palette.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  stageBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
