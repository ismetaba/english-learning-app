import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';

export type NodeState = 'locked' | 'available' | 'completed';

interface PathNodeProps {
  title: string;
  icon: string;
  type: 'structure' | 'vocab' | 'scene' | 'review';
  state: NodeState;
  color: string;
  onPress: () => void;
  delay?: number;
}

const TYPE_ICONS: Record<string, string> = {
  structure: '📖',
  vocab: '💬',
  scene: '🎬',
  review: '⭐',
};

const TYPE_LABELS: Record<string, string> = {
  structure: 'grammar',
  vocab: 'vocab',
  scene: 'scene',
  review: 'review',
};

export default function PathNode({ title, icon, type, state, color, onPress, delay = 0 }: PathNodeProps) {
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
          <View style={[styles.outerRing, { borderColor: color + '40' }]} />
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
            <Text style={styles.lockIcon}>{'🔒'}</Text>
          ) : isCompleted ? (
            <Text style={styles.checkIcon}>{'✓'}</Text>
          ) : (
            <Text style={styles.nodeIcon}>{TYPE_ICONS[type] || icon}</Text>
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
              {t(TYPE_LABELS[type])}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 100,
  },
  innerWrap: {
    alignItems: 'center',
    width: 100,
  },
  outerRing: {
    position: 'absolute',
    top: -6,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedCircle: {
    backgroundColor: palette.bgSurface,
    borderWidth: 0,
  },
  lockIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  checkIcon: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  nodeIcon: {
    fontSize: 24,
  },
  title: {
    fontSize: 12,
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
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginTop: 5,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
