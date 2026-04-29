import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  ZoomIn, FadeIn,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { palette, Radius } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

export type NodeState = 'locked' | 'available' | 'completed';
type Ion = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<string, Ion> = {
  structure: 'book-outline', grammar: 'book-outline', vocab: 'chatbubbles-outline',
  scene: 'videocam-outline', review: 'star-outline',
};
const TYPE_LABELS: Record<string, string> = {
  structure: 'grammar', grammar: 'grammar', vocab: 'vocab', scene: 'scene', review: 'review',
};

interface PathNodeProps {
  title: string;
  type: string;
  state: NodeState;
  color: string;
  onPress: () => void;
  onSubTaskPress: (task: 'learn' | 'vocab' | 'watch') => void;
  delay?: number;
  lessonNumber: number;
  subProgress?: {
    learnCompleted: boolean;
    vocabCompleted: boolean;
    watchCompleted: boolean;
    testPassed: boolean;
  } | null;
  isCurrent?: boolean;
}

function subState(sp: any, k: string, ck: string): 'done' | 'on' | 'off' {
  if (!sp) return 'off';
  if (sp[ck]) return 'done';
  if (k === 'learn') return 'on';
  if (k === 'vocab') return sp.learnCompleted ? 'on' : 'off';
  return sp.vocabCompleted ? 'on' : 'off';
}

export default function PathNode({
  title, type, state, color, onPress, onSubTaskPress, delay = 0, subProgress, isCurrent,
}: PathNodeProps) {
  const locked = state === 'locked';
  const done = state === 'completed';
  const { t } = useTranslation();

  // Active lesson uses green as the "go" color, regardless of unit theme
  const accent = isCurrent ? palette.success : color;
  const showBadges = !!isCurrent;

  const nextSub = !locked
    ? subState(subProgress, 'learn', 'learnCompleted') !== 'done' ? 'learn'
    : subState(subProgress, 'vocab', 'vocabCompleted') !== 'done' ? 'vocab'
    : subState(subProgress, 'watch', 'watchCompleted') !== 'done' ? 'watch'
    : 'test'
    : null;

  const pulse = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isCurrent) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }
  }, [isCurrent]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [s.container, pressed && !locked && { transform: [{ scale: 0.94 }] }]}
    >
      <Animated.View entering={ZoomIn.delay(delay).duration(400)} style={s.inner}>
        {/* Outer glow ring (only on active lesson) */}
        {isCurrent && (
          <>
            <View style={[s.outerRingBg, { borderColor: accent + '30' }]} />
            <Animated.View style={[s.outerRing, { borderColor: accent }, pulseStyle]} />
          </>
        )}

        {/* Circle */}
        <View style={[
          s.circle,
          locked && s.circLocked,
          !locked && !done && isCurrent && {
            borderColor: accent, borderWidth: 3, backgroundColor: palette.bgCard,
            shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
          },
          !locked && !done && !isCurrent && {
            backgroundColor: palette.bgSurface, borderWidth: 0,
          },
          done && {
            backgroundColor: accent, borderWidth: 0,
            shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
          },
        ]}>
          {locked ? (
            <Ionicons name="lock-closed" size={28} color={palette.textDisabled} />
          ) : done ? (
            <Ionicons name="checkmark" size={32} color="#fff" />
          ) : (
            <Ionicons
              name={TYPE_ICONS[type] || 'book-outline'}
              size={isCurrent ? 34 : 30}
              color={isCurrent ? accent : palette.textDisabled}
            />
          )}
        </View>

        {/* Title */}
        <Text
          style={[
            s.title,
            (locked || (!isCurrent && !done)) && s.titleMuted,
            isCurrent && s.titleCurrent,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {/* Badges — only on active lesson */}
        {showBadges && (
          <Animated.View entering={FadeIn.delay(delay + 100).duration(200)} style={s.badges}>
            <View style={[s.badge, { backgroundColor: palette.bgSurface }]}>
              <Text style={[s.badgeText, { color: palette.textSecondary }]}>
                {t(TYPE_LABELS[type] || type)}
              </Text>
            </View>
            {nextSub && nextSub !== 'test' && (
              <Pressable onPress={() => onSubTaskPress(nextSub as any)}>
                <View style={[s.badge, { backgroundColor: accent + '22' }]}>
                  <Text style={[s.badgeText, { color: accent }]}>{nextSub.toUpperCase()}</Text>
                </View>
              </Pressable>
            )}
            {nextSub === 'test' && (
              <View style={[s.badge, { backgroundColor: palette.xp + '22' }]}>
                <Text style={[s.badgeText, { color: palette.xp }]}>TEST</Text>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const SZ = 92;
const WIDTH = 150;

const s = StyleSheet.create({
  container: { alignItems: 'center', width: WIDTH },
  inner: { alignItems: 'center', width: WIDTH },
  outerRingBg: {
    position: 'absolute',
    top: -14,
    left: (WIDTH - (SZ + 28)) / 2,
    width: SZ + 28,
    height: SZ + 28,
    borderRadius: (SZ + 28) / 2,
    borderWidth: 3,
    borderStyle: 'solid',
  },
  outerRing: {
    position: 'absolute',
    top: -10,
    left: (WIDTH - (SZ + 20)) / 2,
    width: SZ + 20,
    height: SZ + 20,
    borderRadius: (SZ + 20) / 2,
    borderWidth: 3,
    borderStyle: 'solid',
  },
  circle: {
    width: SZ, height: SZ, borderRadius: SZ / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  circLocked: { backgroundColor: palette.bgSurface, borderWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textPrimary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  titleMuted: { color: palette.textMuted, fontWeight: '600' },
  titleCurrent: { color: palette.textPrimary, fontWeight: '800' },
  badges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
