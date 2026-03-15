import React, { useState } from 'react';
import { StyleSheet, ScrollView, Pressable, Text, View, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, FadeIn, ZoomIn } from 'react-native-reanimated';
import { structures } from '@/data/structures';
import DiagramView from '@/components/SentenceDiagram/DiagramView';
import DragExercise from '@/components/SentenceDiagram/DragExercise';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';

type Mode = 'learn' | 'practice';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('learn');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [score, setScore] = useState(0);
  const { nativeLanguage, markLessonComplete, addXP, XP_PER_LESSON } = useAppContext();
  const { t } = useTranslation();

  const structure = structures.find((s) => s.id === id);

  if (!structure) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorEmoji}>{'📭'}</Text>
        <Text style={styles.errorText}>{t('structureNotFound')}</Text>
      </View>
    );
  }

  const currentExample = structure.examples[exampleIndex];

  if (mode === 'practice') {
    const practiceExample = structure.examples[practiceIndex];
    if (!practiceExample) {
      if (structure) {
        markLessonComplete(structure.id);
        addXP(XP_PER_LESSON);
      }
      return (
        <View style={[styles.container, styles.centered]}>
          <Animated.View entering={ZoomIn.duration(500)} style={styles.completionCard}>
            <Text style={styles.completedEmoji}>{'🎉'}</Text>
            <Text style={styles.completedTitle}>{t('practiceComplete')}</Text>
            <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.scoreCircle}>
              <Text style={styles.scoreValue}>{score}/{structure.examples.length}</Text>
              <Text style={styles.scoreLabel}>{t('correct')}</Text>
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.xpPill}>
              <Text style={styles.xpPillText}>+{XP_PER_LESSON} XP</Text>
            </Animated.View>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => router.back()}
            >
              <Text style={styles.primaryButtonText}>{t('backToLessons')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      );
    }

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backBtn}>{'←'}</Text>
          </Pressable>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{t('practiceMode')}</Text>
          </View>
          <Text style={styles.topCount}>{practiceIndex + 1}/{structure.examples.length}</Text>
        </Animated.View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(practiceIndex / structure.examples.length) * 100}%` }]} />
        </View>

        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <Text style={styles.title}>{structure.title}</Text>
        </Animated.View>

        <DragExercise
          key={practiceIndex}
          example={practiceExample}
          onComplete={(correct) => {
            if (correct) setScore((s) => s + 1);
            setTimeout(() => setPracticeIndex((i) => i + 1), 1000);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>{'←'}</Text>
        </Pressable>
        <View style={styles.modeBadge}>
          <Text style={[styles.modeBadgeText, { color: palette.primary }]}>{'📖'} {t('learn')}</Text>
        </View>
        <Text style={styles.topCount}>{exampleIndex + 1}/{structure.examples.length}</Text>
      </Animated.View>

      {/* Title section */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
        <Text style={styles.title}>{structure.title}</Text>
        <Text style={styles.description}>{structure.description}</Text>
      </Animated.View>

      {/* Example dots */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.exampleNav}>
        {structure.examples.map((_, index) => (
          <Pressable
            key={index}
            style={[styles.exampleDot, index === exampleIndex && styles.exampleDotActive]}
            onPress={() => setExampleIndex(index)}
          >
            <Text style={[styles.exampleDotText, index === exampleIndex && styles.exampleDotTextActive]}>
              {index + 1}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      {/* Diagram */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.diagramCard}>
        <DiagramView
          example={currentExample}
          nativeTranslation={currentExample.translations[nativeLanguage]}
          showTranslation={true}
          showArrows={true}
        />
      </Animated.View>

      {/* Navigation */}
      <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.navRow}>
        <Pressable
          style={[styles.navButton, exampleIndex === 0 && styles.navButtonDisabled]}
          onPress={() => setExampleIndex(Math.max(0, exampleIndex - 1))}
          disabled={exampleIndex === 0}
        >
          <Text style={styles.navButtonText}>{'←'} {t('previous')}</Text>
        </Pressable>

        {exampleIndex < structure.examples.length - 1 ? (
          <Pressable
            style={({ pressed }) => [styles.navButtonNext, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => setExampleIndex(exampleIndex + 1)}
          >
            <Text style={styles.navButtonNextText}>{t('next')} {'→'}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              setMode('practice');
              setPracticeIndex(0);
              setScore(0);
            }}
          >
            <Text style={styles.primaryButtonText}>{t('startPractice')} {'→'}</Text>
          </Pressable>
        )}
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
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 56,
    paddingBottom: 40,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    fontSize: 24,
    color: palette.primary,
    fontWeight: '600',
  },
  modeBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.xp,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  topCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
  },

  // Progress bar for practice
  progressBar: {
    height: 4,
    backgroundColor: palette.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },

  // Title
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 15,
    color: palette.textSecondary,
    lineHeight: 22,
  },

  // Example dots
  exampleNav: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  exampleDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  exampleDotActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  exampleDotText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textSecondary,
  },
  exampleDotTextActive: {
    color: '#fff',
  },

  // Diagram card
  diagramCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },

  // Navigation
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  navButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: Radius.sm,
    backgroundColor: palette.bgSurface,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  navButtonNext: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: Radius.sm,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
  },
  navButtonNextText: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primary,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: Radius.sm,
    backgroundColor: palette.primary,
    alignItems: 'center',
    ...Shadows.button,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Completion screen
  completionCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: palette.border,
  },
  completedEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.success,
    marginBottom: 20,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: palette.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.primary,
  },
  scoreLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  xpPill: {
    backgroundColor: palette.xpGlow,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
    marginBottom: 28,
  },
  xpPillText: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.xp,
  },

  // Error
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 18,
    color: palette.error,
    textAlign: 'center',
    fontWeight: '600',
  },
});
