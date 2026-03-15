import React, { useState, useRef } from 'react';
import { StyleSheet, ScrollView, Pressable, Text, View, FlatList, Dimensions, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import VocabCard from '@/components/VocabCard/VocabCard';
import { vocabSets } from '@/data/vocab';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';

const { width } = Dimensions.get('window');

type VocabMode = 'list' | 'cards' | 'quiz' | 'quiz-result';

export default function VocabScreen() {
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<VocabMode>('list');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const { nativeLanguage, markVocabLearned, addXP, progress, XP_PER_VOCAB, XP_PER_QUIZ_CORRECT } = useAppContext();
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);

  const currentVocabSet = vocabSets.find((vs) => vs.id === selectedSet);

  const resetToList = () => {
    setSelectedSet(null);
    setMode('list');
    setCurrentIndex(0);
    setQuizIndex(0);
    setQuizScore(0);
  };

  // ─── LIST MODE ───
  if (mode === 'list' || !selectedSet || !currentVocabSet) {
    const learnedCount = (setId: string) => {
      const set = vocabSets.find(s => s.id === setId);
      if (!set) return 0;
      return set.words.filter(w => progress.learnedWords.includes(w.word)).length;
    };

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.screenHeader}>
          <Text style={styles.screenTitle}>{t('vocabulary')}</Text>
          <Text style={styles.screenSubtitle}>{t('vocabSubtitle')}</Text>
        </Animated.View>

        {/* Stats pills */}
        <View style={styles.statsRow}>
          <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.statPill}>
            <Text style={styles.statPillNumber}>{vocabSets.reduce((acc, s) => acc + s.words.length, 0)}</Text>
            <Text style={styles.statPillLabel}>{t('words')}</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(80).duration(400)} style={styles.statPill}>
            <Text style={styles.statPillNumber}>{progress.learnedWords.length}</Text>
            <Text style={styles.statPillLabel}>{t('learned')}</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(160).duration(400)} style={[styles.statPill, styles.statPillAccent]}>
            <Text style={[styles.statPillNumber, { color: palette.primary }]}>{vocabSets.length}</Text>
            <Text style={styles.statPillLabel}>Sets</Text>
          </Animated.View>
        </View>

        {/* Vocab set cards */}
        {vocabSets.map((set, idx) => {
          const learned = learnedCount(set.id);
          const total = set.words.length;
          const percent = total > 0 ? (learned / total) * 100 : 0;
          const isComplete = learned === total;
          const levelColors = ['#6C5CE7', '#00B894', '#FF9F43', '#E17055', '#FD79A8'];
          const cardAccent = levelColors[(set.level - 1) % levelColors.length];

          return (
            <Animated.View key={set.id} entering={FadeInDown.delay(idx * 60).duration(400)}>
              <Pressable
                style={({ pressed }) => [
                  styles.setCard,
                  { borderLeftColor: cardAccent, borderLeftWidth: 4 },
                  pressed && { transform: [{ scale: 0.98 }] },
                  isComplete && { borderLeftColor: palette.success },
                ]}
                onPress={() => {
                  setSelectedSet(set.id);
                  setMode('cards');
                  setCurrentIndex(0);
                }}
              >
                <View style={styles.setCardTop}>
                  <View style={styles.setIconWrap}>
                    <View style={[styles.setIcon, { backgroundColor: cardAccent + '20' }]}>
                      <Text style={styles.setIconText}>
                        {set.title.includes('Food') ? '🍕' :
                         set.title.includes('Daily') ? '📅' :
                         set.title.includes('Travel') ? '✈️' :
                         set.title.includes('Emotion') ? '😊' :
                         set.title.includes('Home') ? '🏠' :
                         set.title.includes('Weather') ? '🌤️' :
                         set.title.includes('School') ? '🎓' :
                         set.title.includes('Shopping') ? '🛍️' :
                         set.title.includes('Body') || set.title.includes('Health') ? '💪' :
                         set.title.includes('Work') || set.title.includes('Office') ? '💼' : '📚'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.setTitleRow}>
                      <Text style={styles.setTitle}>{set.title}</Text>
                      <View style={[styles.levelPill, { backgroundColor: cardAccent + '20' }]}>
                        <Text style={[styles.levelPillText, { color: cardAccent }]}>Lv.{set.level}</Text>
                      </View>
                    </View>
                    <Text style={styles.setWordPreview} numberOfLines={1}>
                      {set.words.slice(0, 4).map(w => w.word).join(' · ')}
                      {set.words.length > 4 ? ' ...' : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.setCardBottom}>
                  <View style={styles.setProgressBar}>
                    <View style={[styles.setProgressFill, { width: `${percent}%`, backgroundColor: isComplete ? palette.success : cardAccent }]} />
                  </View>
                  <Text style={styles.setProgressLabel}>{learned}/{total}</Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    );
  }

  // ─── QUIZ RESULT MODE ───
  if (mode === 'quiz-result') {
    const totalQuiz = currentVocabSet.words.length;
    const xpEarned = quizScore * XP_PER_QUIZ_CORRECT;
    const scorePercent = totalQuiz > 0 ? Math.round((quizScore / totalQuiz) * 100) : 0;
    return (
      <View style={[styles.fullScreen, styles.centered]}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.resultCard}>
          <Text style={styles.resultEmoji}>{scorePercent >= 80 ? '🏆' : scorePercent >= 50 ? '👏' : '💪'}</Text>
          <Text style={styles.resultTitle}>{t('quizComplete')}</Text>
          <View style={styles.resultScoreCircle}>
            <Text style={styles.resultScorePercent}>{scorePercent}%</Text>
            <Text style={styles.resultScoreLabel}>{quizScore}/{totalQuiz} {t('correct')}</Text>
          </View>
          <View style={styles.xpEarnedPill}>
            <Text style={styles.xpEarnedText}>+{xpEarned} XP</Text>
          </View>
          <View style={styles.resultActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => { setMode('quiz'); setQuizIndex(0); setQuizScore(0); setSelectedAnswer(null); }}>
              <Text style={styles.secondaryBtnText}>{t('tryAgain')}</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={resetToList}>
              <Text style={styles.primaryBtnText}>{t('done')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ─── QUIZ MODE ───
  if (mode === 'quiz') {
    if (quizIndex >= currentVocabSet.words.length) {
      setMode('quiz-result');
      return null;
    }

    const currentWord = currentVocabSet.words[quizIndex];
    const allWords = vocabSets.flatMap(s => s.words);
    const distractors = allWords
      .filter(w => w.word !== currentWord.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [currentWord, ...distractors].sort(() => Math.random() - 0.5);

    const handleQuizAnswer = (word: string) => {
      if (selectedAnswer) return;
      setSelectedAnswer(word);
      if (word === currentWord.word) {
        setQuizScore(s => s + 1);
        addXP(XP_PER_QUIZ_CORRECT);
      }
      setTimeout(() => {
        setSelectedAnswer(null);
        setQuizIndex(i => i + 1);
      }, 1500);
    };

    return (
      <View style={styles.fullScreen}>
        <View style={styles.quizTopBar}>
          <Pressable onPress={resetToList} hitSlop={12}>
            <Text style={styles.backBtn}>{'←'}</Text>
          </Pressable>
          <Text style={styles.quizTopTitle}>{currentVocabSet.title}</Text>
          <Text style={styles.quizTopCount}>{quizIndex + 1}/{currentVocabSet.words.length}</Text>
        </View>

        <View style={styles.quizProgressBar}>
          <View style={[styles.quizProgressFill, { width: `${(quizIndex / currentVocabSet.words.length) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.quizBody} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.quizCard}>
            <Text style={styles.quizLabel}>{t('whatIsEnglishFor')}</Text>
            <Text style={styles.quizWord}>{currentWord.translations[nativeLanguage] || currentWord.translations.tr}</Text>
          </Animated.View>

          <View style={styles.quizOptions}>
            {options.map(option => {
              const isCorrect = option.word === currentWord.word;
              const isSelected = option.word === selectedAnswer;
              const showCorrect = selectedAnswer && isCorrect;
              const showWrong = isSelected && !isCorrect;

              return (
                <Pressable
                  key={option.word}
                  style={[
                    styles.quizOption,
                    showCorrect && styles.quizOptionCorrect,
                    showWrong && styles.quizOptionWrong,
                  ]}
                  onPress={() => handleQuizAnswer(option.word)}
                  disabled={!!selectedAnswer}
                >
                  <Text style={[
                    styles.quizOptionText,
                    showCorrect && { color: palette.success, fontWeight: '800' },
                    showWrong && { color: palette.error },
                  ]}>
                    {option.word}
                  </Text>
                  {showCorrect && <Text style={styles.quizFeedback}>{'✓'}</Text>}
                  {showWrong && <Text style={[styles.quizFeedback, { color: palette.error }]}>{'✗'}</Text>}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── CARDS MODE ───
  return (
    <View style={styles.fullScreen}>
      <View style={styles.cardTopBar}>
        <Pressable onPress={resetToList} hitSlop={12}>
          <Text style={styles.backBtn}>{'←'}</Text>
        </Pressable>
        <Text style={styles.cardTopTitle}>{currentVocabSet.title}</Text>
        <Text style={styles.cardTopCount}>
          {currentIndex + 1}/{currentVocabSet.words.length}
        </Text>
      </View>

      {/* Card progress dots */}
      <View style={styles.dotsRow}>
        {currentVocabSet.words.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
              index < currentIndex && styles.dotDone,
            ]}
          />
        ))}
      </View>

      <FlatList
        ref={flatListRef}
        data={currentVocabSet.words}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.word}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <VocabCard
              word={item}
              nativeLanguage={nativeLanguage}
              onLearned={() => {
                markVocabLearned(item.word);
                addXP(XP_PER_VOCAB);
                if (currentIndex < currentVocabSet.words.length - 1) {
                  const nextIndex = currentIndex + 1;
                  flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
                  setCurrentIndex(nextIndex);
                }
              }}
            />
          </View>
        )}
      />

      {/* Quiz CTA */}
      <View style={styles.ctaWrap}>
        <Pressable
          style={({ pressed }) => [styles.quizCta, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={() => {
            setMode('quiz');
            setQuizIndex(0);
            setQuizScore(0);
            setSelectedAnswer(null);
          }}
        >
          <Text style={styles.quizCtaIcon}>{'🧠'}</Text>
          <Text style={styles.quizCtaText}>{t('quizYourself')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingBottom: 32,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // ─── Screen header ───
  screenHeader: {
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: palette.textSecondary,
    marginTop: 4,
    lineHeight: 22,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  statPill: {
    flex: 1,
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  statPillAccent: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primaryGlow,
  },
  statPillNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Set cards ───
  setCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  setCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  setIconWrap: {},
  setIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setIconText: {
    fontSize: 22,
  },
  setTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  setTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary,
    flex: 1,
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  setWordPreview: {
    fontSize: 13,
    color: palette.textMuted,
  },
  setCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: palette.bgSurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  setProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  setProgressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
  },

  // ─── Card mode ───
  cardTopBar: {
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
  cardTopTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  cardTopCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
    paddingHorizontal: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.bgSurface,
  },
  dotActive: {
    backgroundColor: palette.primary,
    width: 24,
  },
  dotDone: {
    backgroundColor: palette.primarySoft,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  quizCta: {
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: palette.primaryGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
  quizCtaIcon: {
    fontSize: 18,
  },
  quizCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ─── Quiz mode ───
  quizTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 12,
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
    paddingBottom: 32,
  },
  quizCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  quizLabel: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '500',
    marginBottom: 12,
  },
  quizWord: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.primary,
    textAlign: 'center',
  },
  quizOptions: {
    gap: 12,
  },
  quizOption: {
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
  quizOptionCorrect: {
    borderColor: palette.success,
    backgroundColor: palette.successSoft,
  },
  quizOptionWrong: {
    borderColor: palette.error,
    backgroundColor: palette.errorSoft,
  },
  quizOptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  quizFeedback: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.success,
  },

  // ─── Quiz result ───
  resultCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: palette.border,
  },
  resultEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 20,
  },
  resultScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultScorePercent: {
    fontSize: 36,
    fontWeight: '800',
    color: palette.primary,
  },
  resultScoreLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  xpEarnedPill: {
    backgroundColor: palette.xpGlow,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
    marginBottom: 28,
  },
  xpEarnedText: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.xp,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    backgroundColor: palette.bgSurface,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  primaryBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    ...Shadows.button,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
