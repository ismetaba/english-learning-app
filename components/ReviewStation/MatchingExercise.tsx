import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, ZoomIn, FadeIn } from 'react-native-reanimated';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';

interface MatchPair {
  english: string;
  translation: string;
}

interface MatchingExerciseProps {
  pairs: MatchPair[];
  onComplete: (correct: boolean) => void;
}

export default function MatchingExercise({ pairs, onComplete }: MatchingExerciseProps) {
  const { t } = useTranslation();
  const [selectedEnglish, setSelectedEnglish] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrongPair, setWrongPair] = useState<{ eng: string; tr: string } | null>(null);
  const [score, setScore] = useState(0);

  const shuffledEnglish = useMemo(() => [...pairs].sort(() => Math.random() - 0.5), [pairs]);
  const shuffledTranslations = useMemo(() => [...pairs].sort(() => Math.random() - 0.5), [pairs]);

  const handleEnglishPress = (word: string) => {
    if (matched.includes(word)) return;
    setSelectedEnglish(word);
    setWrongPair(null);

    if (selectedTranslation) {
      checkMatch(word, selectedTranslation);
    }
  };

  const handleTranslationPress = (translation: string) => {
    const pairWord = pairs.find(p => p.translation === translation)?.english;
    if (pairWord && matched.includes(pairWord)) return;
    setSelectedTranslation(translation);
    setWrongPair(null);

    if (selectedEnglish) {
      checkMatch(selectedEnglish, translation);
    }
  };

  const checkMatch = (eng: string, tr: string) => {
    const pair = pairs.find(p => p.english === eng);
    if (pair && pair.translation === tr) {
      const newMatched = [...matched, eng];
      setMatched(newMatched);
      setScore(s => s + 1);
      setSelectedEnglish(null);
      setSelectedTranslation(null);

      if (newMatched.length === pairs.length) {
        setTimeout(() => onComplete(true), 800);
      }
    } else {
      setWrongPair({ eng, tr });
      setTimeout(() => {
        setSelectedEnglish(null);
        setSelectedTranslation(null);
        setWrongPair(null);
      }, 600);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
      <Text style={styles.label}>{t('matchWords')}</Text>
      <Text style={styles.subtitle}>{t('matchWordsDesc')}</Text>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{matched.length}/{pairs.length}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(matched.length / pairs.length) * 100}%` }]} />
        </View>
      </View>

      <View style={styles.columnsWrap}>
        {/* English column */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>English</Text>
          {shuffledEnglish.map((pair, idx) => {
            const isMatched = matched.includes(pair.english);
            const isSelected = selectedEnglish === pair.english;
            const isWrong = wrongPair?.eng === pair.english;

            return (
              <Animated.View key={pair.english} entering={FadeInDown.delay(idx * 60).duration(300)}>
                <Pressable
                  style={[
                    styles.wordBtn,
                    isMatched && styles.wordBtnMatched,
                    isSelected && styles.wordBtnSelected,
                    isWrong && styles.wordBtnWrong,
                  ]}
                  onPress={() => handleEnglishPress(pair.english)}
                  disabled={isMatched}
                >
                  <Text style={[
                    styles.wordText,
                    isMatched && styles.wordTextMatched,
                    isSelected && styles.wordTextSelected,
                  ]}>
                    {isMatched ? `${pair.english} ✓` : pair.english}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {/* Translation column */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>Translation</Text>
          {shuffledTranslations.map((pair, idx) => {
            const isMatched = matched.includes(pair.english);
            const isSelected = selectedTranslation === pair.translation;
            const isWrong = wrongPair?.tr === pair.translation;

            return (
              <Animated.View key={pair.translation} entering={FadeInDown.delay(idx * 60 + 30).duration(300)}>
                <Pressable
                  style={[
                    styles.wordBtn,
                    isMatched && styles.wordBtnMatched,
                    isSelected && styles.wordBtnSelected,
                    isWrong && styles.wordBtnWrong,
                  ]}
                  onPress={() => handleTranslationPress(pair.translation)}
                  disabled={isMatched}
                >
                  <Text style={[
                    styles.wordText,
                    isMatched && styles.wordTextMatched,
                    isSelected && styles.wordTextSelected,
                  ]}>
                    {isMatched ? `${pair.translation} ✓` : pair.translation}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
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
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: palette.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textSecondary,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: palette.bgSurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.success,
    borderRadius: 3,
  },
  columnsWrap: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
    gap: 8,
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 4,
  },
  wordBtn: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
  },
  wordBtnSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  wordBtnMatched: {
    borderColor: palette.success,
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    opacity: 0.7,
  },
  wordBtnWrong: {
    borderColor: palette.error,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  wordText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textPrimary,
    textAlign: 'center',
  },
  wordTextSelected: {
    color: palette.primary,
    fontWeight: '700',
  },
  wordTextMatched: {
    color: palette.success,
  },
});
