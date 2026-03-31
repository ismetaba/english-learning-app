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
  title, type, state, color, onPress, onSubTaskPress, delay = 0, lessonNumber, subProgress, isCurrent,
}: PathNodeProps) {
  const locked = state === 'locked';
  const done = state === 'completed';
  const { t } = useTranslation();

  const nextSub = !locked
    ? subState(subProgress, 'learn', 'learnCompleted') !== 'done' ? 'learn'
    : subState(subProgress, 'vocab', 'vocabCompleted') !== 'done' ? 'vocab'
    : subState(subProgress, 'watch', 'watchCompleted') !== 'done' ? 'watch'
    : 'test'
    : null;

  // Pulsing animation for outer ring
  const pulse = useSharedValue(1);
  const glowOpacity = useSharedValue(0.25);

  useEffect(() => {
    if (!locked) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // infinite
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }
  }, [locked]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [s.container, pressed && !locked && { transform: [{ scale: 0.92 }] }]}
    >
      <Animated.View entering={ZoomIn.delay(delay).duration(400)} style={s.inner}>
        {/* Outer dark ring (background ring) */}
        {!locked && (
          <View style={[s.outerRingBg, { borderColor: done ? color + '20' : color + '15' }]} />
        )}

        {/* Animated glow ring */}
        {!locked && (
          <Animated.View style={[
            s.outerRing,
            { borderColor: done ? color : color },
            pulseStyle,
          ]} />
        )}

        {/* Circle */}
        <View style={[
          s.circle,
          locked && s.circLocked,
          !locked && !done && { borderColor: color, borderWidth: 3, backgroundColor: palette.bgCard,
            shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
          done && { backgroundColor: color, borderWidth: 0,
            shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
        ]}>
          {locked ? (
            <Ionicons name="lock-closed" size={22} color={palette.textDisabled} />
          ) : done ? (
            <Ionicons name="checkmark" size={28} color="#fff" />
          ) : (
            <Ionicons name={TYPE_ICONS[type] || 'book-outline'} size={26} color={color} />
          )}
        </View>

        {/* Title */}
        <Text style={[s.title, locked && s.titleLocked, done && s.titleDone]} numberOfLines={2}>{title}</Text>

        {/* Badges */}
        {!locked && (
          <Animated.View entering={FadeIn.delay(delay + 100).duration(200)} style={s.badges}>
            <View style={[s.badge, { backgroundColor: palette.bgSurface }]}>
              <Text style={[s.badgeText, { color: palette.textMuted }]}>{t(TYPE_LABELS[type] || type)}</Text>
            </View>
            {nextSub && nextSub !== 'test' && (
              <Pressable onPress={() => onSubTaskPress(nextSub as any)}>
                <View style={[s.badge, { backgroundColor: color + '20' }]}>
                  <Text style={[s.badgeText, { color }]}>{nextSub.toUpperCase()}</Text>
                </View>
              </Pressable>
            )}
            {nextSub === 'test' && (
              <View style={[s.badge, { backgroundColor: palette.xp + '20' }]}>
                <Text style={[s.badgeText, { color: palette.xp }]}>TEST</Text>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const SZ = 72;

const s = StyleSheet.create({
  container: { alignItems: 'center', width: 130 },
  inner: { alignItems: 'center', width: 130 },
  outerRingBg: {
    position: 'absolute', top: -10, left: (130 - SZ - 20) / 2, width: SZ + 20, height: SZ + 20,
    borderRadius: (SZ + 20) / 2, borderWidth: 3, borderStyle: 'solid', opacity: 0.15,
  },
  outerRing: {
    position: 'absolute', top: -6, left: (130 - SZ - 12) / 2, width: SZ + 12, height: SZ + 12,
    borderRadius: (SZ + 12) / 2, borderWidth: 2.5, borderStyle: 'solid',
  },
  circle: {
    width: SZ, height: SZ, borderRadius: SZ / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  circLocked: { backgroundColor: palette.bgSurface, borderWidth: 0 },
  title: {
    fontSize: 13, fontWeight: '700', color: palette.textPrimary,
    textAlign: 'center', marginTop: 8, lineHeight: 17, letterSpacing: -0.2,
  },
  titleLocked: { color: palette.textMuted, fontWeight: '500' },
  titleDone: { color: palette.textSecondary },
  badges: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
