import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { reviewStations } from '@/data/reviews';
import { vocabSets } from '@/data/vocab';
import { structures } from '@/data/structures';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius, Shadows } from '@/constants/Colors';
import FillBlankExercise from './FillBlankExercise';
import MatchingExercise from './MatchingExercise';

type ExerciseType = 'fill-blank' | 'matching' | 'vocab-quiz';

interface Exercise {
  type: ExerciseType;
  data: any;
}

interface ReviewStationProps {
  reviewId: string;
}

function generateExercises(reviewId: string, nativeLanguage: string): Exercise[] {
  const station = reviewStations.find(r => r.id === reviewId);
  if (!station) return [];

  const exercises: Exercise[] = [];

  // Get relevant vocab
  const relevantVocab = vocabSets.filter(vs => station.coveredVocab.includes(vs.id));
  const allWords = relevantVocab.flatMap(vs => vs.words);

  // Get relevant structures
  const relevantStructures = structures.filter(s => station.coveredStructures.includes(s.id));

  // Generate fill-blank exercises from structures
  for (const struct of relevantStructures.slice(0, 3)) {
    for (const example of struct.examples.slice(0, 2)) {
      const words = example.parts.map(p => p.word);
      if (words.length < 2) continue;

      const blankIdx = Math.floor(Math.random() * (words.length - 1)) + (words.length > 2 ? 1 : 0);
      const correctWord = words[blankIdx];
      const sentence = words.map((w, i) => i === blankIdx ? '___' : w).join(' ');

      // Create distractors from other words in structures
      const otherWords = relevantStructures
        .flatMap(s => s.examples.flatMap(e => e.parts.map(p => p.word)))
        .filter(w => w !== correctWord && w.length > 1);
      const distractors = [...new Set(otherWords)].sort(() => Math.random() - 0.5).slice(0, 3);

      if (distractors.length >= 2) {
        exercises.push({
          type: 'fill-blank',
          data: {
            sentence,
            correctWord,
            options: [correctWord, ...distractors.slice(0, 3)],
          },
        });
      }
    }
  }

  // Generate vocab-quiz exercises (fill-blank style with translations)
  const shuffledWords = [...allWords].sort(() => Math.random() - 0.5);
  for (const word of shuffledWords.slice(0, 3)) {
    const translation = word.translations[nativeLanguage] || word.translations.tr;
    const distractorWords = allWords
      .filter(w => w.word !== word.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    if (distractorWords.length >= 2) {
      exercises.push({
        type: 'fill-blank',
        data: {
          sentence: `"${translation}" = ___`,
          correctWord: word.word,
          options: [word.word, ...distractorWords.map(w => w.word).slice(0, 3)],
        },
      });
    }
  }

  // Generate matching exercises
  if (allWords.length >= 5) {
    const matchWords = [...allWords].sort(() => Math.random() - 0.5).slice(0, 5);
    exercises.push({
      type: 'matching',
      data: {
        pairs: matchWords.map(w => ({
          english: w.word,
          translation: w.translations[nativeLanguage] || w.translations.tr,
        })),
      },
    });
  }

  // Shuffle and limit to 6
  return exercises.sort(() => Math.random() - 0.5).slice(0, 6);
}

export default function ReviewStation({ reviewId }: ReviewStationProps) {
  const router = useRouter();
  const { nativeLanguage, markReviewComplete, XP_PER_REVIEW } = useAppContext();
  const { t } = useTranslation();

  const exercises = useMemo(() => generateExercises(reviewId, nativeLanguage), [reviewId, nativeLanguage]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  const handleExerciseComplete = (correct: boolean) => {
    if (correct) setScore(s => s + 1);

    setTimeout(() => {
      if (currentIndex + 1 >= exercises.length) {
        markReviewComplete(reviewId);
        setCompleted(true);
      } else {
        setCurrentIndex(i => i + 1);
      }
    }, 300);
  };

  const station = reviewStations.find(r => r.id === reviewId);

  if (completed) {
    const percent = exercises.length > 0 ? Math.round((score / exercises.length) * 100) : 0;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.completionContent}>
        <Animated.View entering={ZoomIn.duration(500)} style={styles.completionCard}>
          <Text style={styles.completedEmoji}>
            {percent >= 80 ? '🏆' : percent >= 50 ? '⭐' : '💪'}
          </Text>
          <Text style={styles.completedTitle}>{t('reviewComplete')}</Text>
          <Text style={styles.completedSubtitle}>
            {percent >= 80 ? t('excellent') : percent >= 50 ? t('greatJob') : t('keepPracticing')}
          </Text>

          <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>{score}/{exercises.length}</Text>
            <Text style={styles.scoreLabel}>{t('correct')}</Text>
          </Animated.View>

          <Animated.View entering={ZoomIn.delay(300).duration(400)} style={styles.xpPill}>
            <Text style={styles.xpPillText}>+{XP_PER_REVIEW} XP</Text>
          </Animated.View>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>{t('backToLessons')}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    );
  }

  if (exercises.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>No exercises available yet.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>{t('backToLessons')}</Text>
        </Pressable>
      </View>
    );
  }

  const exercise = exercises[currentIndex];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>{'←'}</Text>
        </Pressable>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{'⭐'} {t('reviewStation')}</Text>
        </View>
        <Text style={styles.topCount}>{currentIndex + 1}/{exercises.length}</Text>
      </Animated.View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(currentIndex / exercises.length) * 100}%` }]} />
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <Text style={styles.title}>{station?.title || t('reviewStation')}</Text>
      </Animated.View>

      {/* Exercise */}
      {exercise.type === 'fill-blank' && (
        <FillBlankExercise
          key={currentIndex}
          sentence={exercise.data.sentence}
          correctWord={exercise.data.correctWord}
          options={exercise.data.options}
          onComplete={handleExerciseComplete}
        />
      )}

      {exercise.type === 'matching' && (
        <MatchingExercise
          key={currentIndex}
          pairs={exercise.data.pairs}
          onComplete={handleExerciseComplete}
        />
      )}
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
  completionContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
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

  // Progress
  progressBar: {
    height: 4,
    backgroundColor: palette.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.xp,
    borderRadius: 2,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.3,
  },

  // Completion
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
    marginBottom: 8,
  },
  completedSubtitle: {
    fontSize: 16,
    color: palette.textSecondary,
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
  primaryButton: {
    width: '100%',
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
  emptyText: {
    fontSize: 16,
    color: palette.textSecondary,
    marginBottom: 20,
  },
});
