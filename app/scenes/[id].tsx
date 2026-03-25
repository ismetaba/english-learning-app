import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, FadeIn, ZoomIn } from 'react-native-reanimated';
import ScenePlayer from '@/components/ScenePlayer/ScenePlayer';
import { scenes } from '@/data/scenes';
import { vocabSets } from '@/data/vocab';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SceneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const { nativeLanguage, markSceneWatched, addXP, XP_PER_SCENE, XP_PER_QUIZ_CORRECT } = useAppContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const scene = scenes.find((s) => s.id === id);

  if (!scene) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorEmoji}>{'🎬'}</Text>
        <Text style={styles.errorText}>Scene not found</Text>
      </View>
    );
  }

  const vocabSet = vocabSets.find((vs) => vs.id === scene.vocabSetId);
  const quizWords = vocabSet?.words.filter((w) =>
    scene.vocabCoverage.includes(w.word)
  ) || [];

  if (showQuiz) {
    if (quizIndex >= quizWords.length) {
      const totalXp = XP_PER_SCENE + quizScore * XP_PER_QUIZ_CORRECT;
      return (
        <View style={[styles.container, styles.centered]}>
          <Animated.View entering={ZoomIn.duration(500)} style={styles.completionCard}>
            <Text style={styles.completedEmoji}>{'🎬'}</Text>
            <Text style={styles.completedTitle}>{t('quizComplete')}</Text>
            <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.scoreCircle}>
              <Text style={styles.scoreValue}>{quizScore}/{quizWords.length}</Text>
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.xpPill}>
              <Text style={styles.xpPillText}>+{totalXp} XP</Text>
            </Animated.View>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => router.back()}
            >
              <Text style={styles.primaryButtonText}>{t('backToScenes')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      );
    }

    const currentWord = quizWords[quizIndex];
    const allWords = vocabSet?.words || [];
    const distractors = allWords
      .filter((w) => w.word !== currentWord.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [currentWord, ...distractors].sort(() => Math.random() - 0.5);

    const handleAnswer = (word: string) => {
      if (selectedAnswer) return;
      setSelectedAnswer(word);
      const correct = word === currentWord.word;
      if (correct) {
        setQuizScore((s) => s + 1);
        addXP(XP_PER_QUIZ_CORRECT);
      }
      setTimeout(() => {
        setSelectedAnswer(null);
        setQuizIndex((i) => i + 1);
      }, 1500);
    };

    return (
      <View style={styles.quizContainer}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.quizTopBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.quizBackBtn}>{'←'}</Text>
          </Pressable>
          <Text style={styles.quizTopTitle}>{t('sceneQuiz')}</Text>
          <Text style={styles.quizTopCount}>{quizIndex + 1}/{quizWords.length}</Text>
        </Animated.View>

        <View style={styles.quizProgressBar}>
          <View style={[styles.quizProgressFill, { width: `${(quizIndex / quizWords.length) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.quizBody} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.questionCard}>
            <Text style={styles.questionLabel}>{t('whichWordMeans')}</Text>
            <Text style={styles.questionWord}>
              "{currentWord.translations[nativeLanguage] || currentWord.translations.tr}"
            </Text>
          </Animated.View>

          <View style={styles.optionsGrid}>
            {options.map((option, index) => {
              const isCorrect = option.word === currentWord.word;
              const isSelected = option.word === selectedAnswer;
              const showCorrect = selectedAnswer && isCorrect;
              const showWrong = isSelected && !isCorrect;

              return (
                <Animated.View key={option.word} entering={FadeInDown.delay(200 + index * 60).duration(400)}>
                  <Pressable
                    style={[
                      styles.optionBtn,
                      showCorrect && styles.optionCorrect,
                      showWrong && styles.optionWrong,
                    ]}
                    onPress={() => handleAnswer(option.word)}
                    disabled={!!selectedAnswer}
                  >
                    <Text style={[
                      styles.optionText,
                      showCorrect && { color: palette.success, fontWeight: '800' },
                      showWrong && { color: palette.error },
                    ]}>
                      {option.word}
                    </Text>
                    {showCorrect && <Text style={styles.feedbackIcon}>{'✓'}</Text>}
                    {showWrong && <Text style={[styles.feedbackIcon, { color: palette.error }]}>{'✗'}</Text>}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          {selectedAnswer && selectedAnswer !== currentWord.word && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.explanationCard}>
              <Text style={styles.explanationText}>
                {t('correctAnswer')} <Text style={styles.explanationWord}>"{currentWord.word}"</Text>
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backText}>{'←'} Geri</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{scene.movieTitle}</Text>
        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>{scene.difficulty}</Text>
        </View>
      </View>
      <ScenePlayer
        scene={scene}
        onComplete={() => {
          markSceneWatched(scene.id);
          addXP(XP_PER_SCENE);
          setShowQuiz(true);
        }}
      />

      <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.skipWrap}>
        <Pressable
          style={({ pressed }) => [styles.skipButton, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={() => {
            markSceneWatched(scene.id);
            addXP(XP_PER_SCENE);
            setShowQuiz(true);
          }}
        >
          <Text style={styles.skipIcon}>{'🧠'}</Text>
          <Text style={styles.skipText}>{t('skipToQuiz')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: palette.bgCard,
    gap: 12,
  },
  backText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  topTitle: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  topBadgeText: {
    color: palette.primaryLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Skip to quiz
  skipWrap: {
    padding: 16,
  },
  skipButton: {
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: palette.primaryGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  skipIcon: {
    fontSize: 18,
  },
  skipText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Quiz container
  quizContainer: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  quizTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 12,
  },
  quizBackBtn: {
    fontSize: 24,
    color: palette.primary,
    fontWeight: '600',
  },
  quizTopTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  quizTopCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
  },
  quizProgressBar: {
    height: 4,
    backgroundColor: palette.bgSurface,
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  quizProgressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
  quizBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Question card
  questionCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  questionLabel: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '500',
    marginBottom: 12,
  },
  questionWord: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.primary,
    textAlign: 'center',
  },

  // Options
  optionsGrid: {
    gap: 12,
  },
  optionBtn: {
    backgroundColor: palette.bgSurface,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: palette.border,
  },
  optionCorrect: {
    borderColor: palette.success,
    backgroundColor: palette.successSoft,
  },
  optionWrong: {
    borderColor: palette.error,
    backgroundColor: palette.errorSoft,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  feedbackIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.success,
  },

  // Explanation
  explanationCard: {
    backgroundColor: palette.warningSoft,
    borderRadius: Radius.sm,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  explanationText: {
    fontSize: 15,
    color: palette.warning,
    fontWeight: '500',
  },
  explanationWord: {
    fontWeight: '800',
    color: palette.primary,
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
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: Radius.sm,
    backgroundColor: palette.primary,
    ...Shadows.button,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
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
