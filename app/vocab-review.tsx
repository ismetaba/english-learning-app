import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { palette, Radius, Shadows } from '@/constants/Colors';
import {
  getVocabPool,
  getWordsDueForReview,
  processReview,
  getPoolStats,
  type VocabPoolEntry,
} from '@/services/spacedRepetition';

// ─── Hardcoded translation map (English -> Turkish) for MVP ───
const TRANSLATIONS: Record<string, string> = {
  hello: 'merhaba',
  goodbye: 'hoşça kal',
  please: 'lütfen',
  'thank you': 'teşekkür ederim',
  yes: 'evet',
  no: 'hayır',
  water: 'su',
  food: 'yemek',
  book: 'kitap',
  house: 'ev',
  car: 'araba',
  dog: 'köpek',
  cat: 'kedi',
  tree: 'ağaç',
  sun: 'güneş',
  moon: 'ay',
  star: 'yıldız',
  rain: 'yağmur',
  wind: 'rüzgar',
  fire: 'ateş',
  love: 'aşk',
  time: 'zaman',
  day: 'gün',
  night: 'gece',
  morning: 'sabah',
  evening: 'akşam',
  friend: 'arkadaş',
  family: 'aile',
  mother: 'anne',
  father: 'baba',
  child: 'çocuk',
  school: 'okul',
  teacher: 'öğretmen',
  student: 'öğrenci',
  work: 'iş',
  money: 'para',
  color: 'renk',
  red: 'kırmızı',
  blue: 'mavi',
  green: 'yeşil',
  white: 'beyaz',
  black: 'siyah',
  big: 'büyük',
  small: 'küçük',
  good: 'iyi',
  bad: 'kötü',
  happy: 'mutlu',
  sad: 'üzgün',
  fast: 'hızlı',
  slow: 'yavaş',
  new: 'yeni',
  old: 'eski',
  hot: 'sıcak',
  cold: 'soğuk',
  beautiful: 'güzel',
  strong: 'güçlü',
  city: 'şehir',
  road: 'yol',
  mountain: 'dağ',
  sea: 'deniz',
  river: 'nehir',
  garden: 'bahçe',
  door: 'kapı',
  window: 'pencere',
  table: 'masa',
  chair: 'sandalye',
  bread: 'ekmek',
  milk: 'süt',
  apple: 'elma',
  chicken: 'tavuk',
  fish: 'balık',
  tea: 'çay',
  coffee: 'kahve',
  sugar: 'şeker',
  salt: 'tuz',
  egg: 'yumurta',
};

// All Turkish words available as distractors
const ALL_TURKISH_WORDS = Object.values(TRANSLATIONS);

function getTranslation(wordId: string): string {
  const lower = wordId.toLowerCase().trim();
  return TRANSLATIONS[lower] ?? lower;
}

function getDistractors(correctTranslation: string, count: number): string[] {
  const pool = ALL_TURKISH_WORDS.filter((w) => w !== correctTranslation);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type ReviewResult = {
  wordId: string;
  correct: boolean;
  updatedEntry: VocabPoolEntry;
};

type PoolStats = {
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  dueToday: number;
};

export default function VocabReviewScreen() {
  const router = useRouter();

  // Loading state
  const [loading, setLoading] = useState(true);
  const [dueWords, setDueWords] = useState<VocabPoolEntry[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);

  // Quiz state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [finished, setFinished] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load words on mount
  useEffect(() => {
    (async () => {
      try {
        const pool = await getVocabPool();
        const due = await getWordsDueForReview(pool);
        const poolStats = await getPoolStats(pool);
        setDueWords(due);
        setStats(poolStats);
      } catch (e) {
        console.error('Failed to load vocab pool:', e);
        setDueWords([]);
        setStats({ total: 0, new: 0, learning: 0, familiar: 0, mastered: 0, dueToday: 0 });
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Generate options when currentIndex changes
  useEffect(() => {
    if (dueWords.length === 0 || currentIndex >= dueWords.length) return;
    const word = dueWords[currentIndex];
    const correctTranslation = getTranslation(word.wordId);
    const distractors = getDistractors(correctTranslation, 3);
    setOptions(shuffleArray([correctTranslation, ...distractors]));
    setSelectedAnswer(null);
    setIsCorrect(null);
  }, [currentIndex, dueWords]);

  const handleAnswer = useCallback(
    async (answer: string) => {
      if (selectedAnswer !== null) return;

      const word = dueWords[currentIndex];
      const correctTranslation = getTranslation(word.wordId);
      const correct = answer === correctTranslation;

      setSelectedAnswer(answer);
      setIsCorrect(correct);

      try {
        const updated = await processReview(word.wordId, correct);
        setResults((prev) => [...prev, { wordId: word.wordId, correct, updatedEntry: updated }]);
      } catch (e) {
        console.error('Failed to process review:', e);
        setResults((prev) => [
          ...prev,
          { wordId: word.wordId, correct, updatedEntry: word },
        ]);
      }

      timerRef.current = setTimeout(() => {
        if (currentIndex + 1 >= dueWords.length) {
          setFinished(true);
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }, 1500);
    },
    [selectedAnswer, dueWords, currentIndex],
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  // ─── LOADING ───
  if (loading) {
    return (
      <View style={[styles.fullScreen, styles.centered]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Loading review...</Text>
      </View>
    );
  }

  // ─── NO WORDS DUE ───
  if (dueWords.length === 0) {
    return (
      <View style={styles.fullScreen}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} hitSlop={12}>
            <Text style={styles.backBtn}>{'<-'}</Text>
          </Pressable>
          <Text style={styles.topTitle}>Vocab Review</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.centered, { flex: 1 }]}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle" size={48} color={palette.success} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              No words are due for review right now. Come back later!
            </Text>

            {stats && (
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{stats.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: palette.accent }]}>{stats.mastered}</Text>
                  <Text style={styles.statLabel}>Mastered</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: palette.warning }]}>{stats.learning}</Text>
                  <Text style={styles.statLabel}>Learning</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: palette.textMuted }]}>{stats.new}</Text>
                  <Text style={styles.statLabel}>New</Text>
                </View>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={goBack}
            >
              <Text style={styles.primaryBtnText}>Back to Home</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── SUMMARY ───
  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const incorrectCount = results.filter((r) => !r.correct).length;
    const scorePercent = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

    return (
      <View style={styles.fullScreen}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} hitSlop={12}>
            <Text style={styles.backBtn}>{'<-'}</Text>
          </Pressable>
          <Text style={styles.topTitle}>Review Complete</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.summaryCard}>
            {scorePercent >= 80 ? (
              <Ionicons name="trophy" size={48} color={palette.xp} style={{ marginBottom: 12 }} />
            ) : scorePercent >= 50 ? (
              <Ionicons name="ribbon" size={48} color={palette.primary} style={{ marginBottom: 12 }} />
            ) : (
              <Ionicons name="fitness" size={48} color={palette.warning} style={{ marginBottom: 12 }} />
            )}
            <Text style={styles.summaryTitle}>Session Complete</Text>

            <View style={styles.scoreCircle}>
              <Text style={styles.scorePercent}>{scorePercent}%</Text>
            </View>

            <View style={styles.scoreRow}>
              <View style={[styles.scorePill, { backgroundColor: palette.successSoft }]}>
                <Text style={[styles.scorePillText, { color: palette.success }]}>
                  {correctCount} correct
                </Text>
              </View>
              <View style={[styles.scorePill, { backgroundColor: palette.errorSoft }]}>
                <Text style={[styles.scorePillText, { color: palette.error }]}>
                  {incorrectCount} incorrect
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Word-by-word results */}
          <Text style={styles.resultsSectionTitle}>Word Results</Text>
          {results.map((result, idx) => (
            <Animated.View
              key={result.wordId + idx}
              entering={FadeInDown.delay(idx * 50).duration(300)}
              style={[
                styles.resultRow,
                {
                  borderLeftColor: result.correct ? palette.success : palette.error,
                  borderLeftWidth: 3,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resultWord}>{result.wordId}</Text>
                <Text style={styles.resultTranslation}>{getTranslation(result.wordId)}</Text>
              </View>
              <View style={styles.resultRight}>
                <Text
                  style={[
                    styles.resultStatus,
                    { color: result.correct ? palette.success : palette.error },
                  ]}
                >
                  {result.correct ? 'Correct' : 'Incorrect'}
                </Text>
                <View
                  style={[
                    styles.masteryPill,
                    {
                      backgroundColor:
                        result.updatedEntry.masteryLevel === 'mastered'
                          ? palette.successSoft
                          : result.updatedEntry.masteryLevel === 'familiar'
                            ? palette.accentSoft
                            : result.updatedEntry.masteryLevel === 'learning'
                              ? palette.warningSoft
                              : palette.primarySoft,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      result.updatedEntry.masteryLevel === 'mastered'
                        ? 'star'
                        : result.updatedEntry.masteryLevel === 'familiar'
                          ? 'trending-up'
                          : result.updatedEntry.masteryLevel === 'learning'
                            ? 'school'
                            : 'add-circle'
                    }
                    size={12}
                    color={
                      result.updatedEntry.masteryLevel === 'mastered'
                        ? palette.success
                        : result.updatedEntry.masteryLevel === 'familiar'
                          ? palette.accent
                          : result.updatedEntry.masteryLevel === 'learning'
                            ? palette.warning
                            : palette.primary
                    }
                  />
                  <Text
                    style={[
                      styles.masteryText,
                      {
                        color:
                          result.updatedEntry.masteryLevel === 'mastered'
                            ? palette.success
                            : result.updatedEntry.masteryLevel === 'familiar'
                              ? palette.accent
                              : result.updatedEntry.masteryLevel === 'learning'
                                ? palette.warning
                                : palette.primary,
                      },
                    ]}
                  >
                    {result.updatedEntry.masteryLevel}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { marginTop: 24, alignSelf: 'center' },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
            onPress={goBack}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ─── REVIEW QUIZ ───
  const currentWord = dueWords[currentIndex];
  const correctTranslation = getTranslation(currentWord.wordId);
  const progress = ((currentIndex) / dueWords.length) * 100;

  return (
    <View style={styles.fullScreen}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.backBtn}>{'<-'}</Text>
        </Pressable>
        <Text style={styles.topTitle}>Vocab Review</Text>
        <Text style={styles.topCount}>
          {currentIndex + 1}/{dueWords.length}
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.quizBody} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.wordCard}>
          <Text style={styles.wordLabel}>What is the Turkish translation?</Text>
          <Text style={styles.wordText}>{currentWord.wordId}</Text>
          <View style={styles.masteryIndicator}>
            <Text style={styles.masteryIndicatorText}>{currentWord.masteryLevel}</Text>
          </View>
        </Animated.View>

        {/* Feedback message */}
        {selectedAnswer !== null && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: isCorrect ? palette.successSoft : palette.errorSoft,
                borderColor: isCorrect ? palette.success : palette.error,
                flexDirection: 'row',
                gap: 8,
              },
            ]}
          >
            {isCorrect ? (
              <Ionicons name="checkmark-circle" size={20} color={palette.success} />
            ) : (
              <Ionicons name="close-circle" size={20} color={palette.error} />
            )}
            <Text
              style={[
                styles.feedbackText,
                { color: isCorrect ? palette.success : palette.error, flex: 1 },
              ]}
            >
              {isCorrect ? 'Correct!' : `Incorrect - the answer is "${correctTranslation}"`}
            </Text>
          </Animated.View>
        )}

        <View style={styles.optionsContainer}>
          {options.map((option, idx) => {
            const isSelected = option === selectedAnswer;
            const isCorrectOption = option === correctTranslation;
            const showCorrect = selectedAnswer !== null && isCorrectOption;
            const showWrong = isSelected && !isCorrectOption;

            return (
              <Pressable
                key={option + idx}
                style={[
                  styles.optionBtn,
                  showCorrect && styles.optionCorrect,
                  showWrong && styles.optionWrong,
                ]}
                onPress={() => handleAnswer(option)}
                disabled={selectedAnswer !== null}
              >
                <Text
                  style={[
                    styles.optionText,
                    showCorrect && { color: palette.success, fontWeight: '800' },
                    showWrong && { color: palette.error },
                  ]}
                >
                  {option}
                </Text>
                {showCorrect && <Ionicons name="checkmark-circle" size={20} color={palette.success} />}
                {showWrong && <Ionicons name="close-circle" size={20} color={palette.error} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: palette.textSecondary,
  },

  // ─── Top bar ───
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 12,
  },
  backBtn: {
    fontSize: 24,
    color: palette.primary,
    fontWeight: '600',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  topCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
    minWidth: 40,
    textAlign: 'right',
  },

  // ─── Progress bar ───
  progressBar: {
    height: 4,
    backgroundColor: palette.bgSurface,
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },

  // ─── Empty / all caught up ───
  emptyCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
    color: palette.success,
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
    justifyContent: 'center',
  },
  statItem: {
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 80,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Word card ───
  wordCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  wordLabel: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '500',
    marginBottom: 12,
  },
  wordText: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  masteryIndicator: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  masteryIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryLight,
    textTransform: 'capitalize',
  },

  // ─── Feedback banner ───
  feedbackBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── Quiz body ───
  quizBody: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  // ─── Options ───
  optionsContainer: {
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
  optionFeedback: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.success,
  },

  // ─── Summary ───
  summaryContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 24,
  },
  summaryEmoji: {
    fontSize: 48,
    marginBottom: 12,
    color: palette.primary,
    fontWeight: '800',
  },
  summaryTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 20,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  scorePercent: {
    fontSize: 36,
    fontWeight: '800',
    color: palette.primary,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scorePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  scorePillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  resultsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultRow: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  resultWord: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  resultTranslation: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  resultRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  resultStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  masteryPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  masteryText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  // ─── Buttons ───
  primaryBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    ...Shadows.button,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
});
