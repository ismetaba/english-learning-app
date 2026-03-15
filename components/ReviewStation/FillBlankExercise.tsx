import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, ZoomIn, FadeIn } from 'react-native-reanimated';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';

interface FillBlankExerciseProps {
  sentence: string;       // "I ___ breakfast every morning."
  correctWord: string;    // "eat"
  options: string[];      // ["eat", "sleep", "run", "walk"]
  onComplete: (correct: boolean) => void;
}

export default function FillBlankExercise({ sentence, correctWord, options, onComplete }: FillBlankExerciseProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const { t } = useTranslation();

  const shuffledOptions = useMemo(() => [...options].sort(() => Math.random() - 0.5), [options]);

  const handleSelect = (word: string) => {
    if (answered) return;
    setSelected(word);
    setAnswered(true);
    const isCorrect = word === correctWord;
    setTimeout(() => onComplete(isCorrect), 1200);
  };

  const parts = sentence.split('___');

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
      <Text style={styles.label}>{t('fillBlank')}</Text>

      <View style={styles.sentenceCard}>
        <Text style={styles.sentenceText}>
          {parts[0]}
          <Text style={[
            styles.blankText,
            answered && selected === correctWord && styles.correctBlank,
            answered && selected !== correctWord && styles.incorrectBlank,
          ]}>
            {selected ? ` ${selected} ` : ' _______ '}
          </Text>
          {parts[1]}
        </Text>
      </View>

      <Text style={styles.instruction}>{t('chooseCorrectWord')}</Text>

      <View style={styles.optionsGrid}>
        {shuffledOptions.map((option, idx) => {
          const isSelected = selected === option;
          const isCorrect = option === correctWord;
          const showCorrect = answered && isCorrect;
          const showIncorrect = answered && isSelected && !isCorrect;

          return (
            <Animated.View key={option} entering={FadeInDown.delay(idx * 80).duration(300)}>
              <Pressable
                style={[
                  styles.optionButton,
                  showCorrect && styles.optionCorrect,
                  showIncorrect && styles.optionIncorrect,
                  !answered && isSelected && styles.optionHover,
                ]}
                onPress={() => handleSelect(option)}
                disabled={answered}
              >
                <Text style={[
                  styles.optionText,
                  showCorrect && styles.optionTextCorrect,
                  showIncorrect && styles.optionTextIncorrect,
                ]}>
                  {option}
                </Text>
                {showCorrect && <Text style={styles.resultIcon}>{'✓'}</Text>}
                {showIncorrect && <Text style={styles.resultIcon}>{'✗'}</Text>}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      {answered && (
        <Animated.View entering={ZoomIn.duration(300)} style={styles.feedbackRow}>
          <Text style={styles.feedbackEmoji}>
            {selected === correctWord ? '🎉' : '💡'}
          </Text>
          <Text style={[
            styles.feedbackText,
            selected === correctWord ? { color: palette.success } : { color: palette.xp },
          ]}>
            {selected === correctWord ? t('excellent') : `${t('correctAnswer')}: ${correctWord}`}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  sentenceCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sentenceText: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },
  blankText: {
    fontWeight: '800',
    color: palette.primary,
    backgroundColor: palette.primarySoft,
    borderRadius: 4,
  },
  correctBlank: {
    color: palette.success,
  },
  incorrectBlank: {
    color: palette.error,
  },
  instruction: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  optionsGrid: {
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: palette.border,
    gap: 8,
  },
  optionHover: {
    borderColor: palette.primary,
  },
  optionCorrect: {
    borderColor: palette.success,
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  optionIncorrect: {
    borderColor: palette.error,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  optionText: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  optionTextCorrect: {
    color: palette.success,
  },
  optionTextIncorrect: {
    color: palette.error,
  },
  resultIcon: {
    fontSize: 18,
    fontWeight: '800',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  feedbackEmoji: {
    fontSize: 24,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
