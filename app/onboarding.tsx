import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { Language, languageNames } from '@/i18n';
import { palette, Radius, Shadows } from '@/constants/Colors';

type Step = 0 | 1 | 2 | 3;

const LANGUAGES: Language[] = ['tr', 'es', 'ar', 'zh', 'pt'];
const LEVELS = ['beginner', 'elementary', 'intermediate'] as const;
const GOALS = ['travel', 'work', 'school', 'personal'] as const;
const DAILY_OPTIONS = [5, 10, 15, 20];

const LEVEL_ICONS: Record<string, string> = { beginner: '🌱', elementary: '📗', intermediate: '📘' };
const GOAL_ICONS: Record<string, string> = { travel: '✈️', work: '💼', school: '🎓', personal: '🌟' };

export default function OnboardingScreen() {
  const router = useRouter();
  const { setNativeLanguage, nativeLanguage, completeOnboarding } = useAppContext();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [selectedLang, setSelectedLang] = useState<Language>(nativeLanguage);
  const [selectedLevel, setSelectedLevel] = useState<typeof LEVELS[number]>('beginner');
  const [selectedGoal, setSelectedGoal] = useState<typeof GOALS[number]>('personal');
  const [selectedMinutes, setSelectedMinutes] = useState(10);

  const handleFinish = () => {
    setNativeLanguage(selectedLang);
    completeOnboarding(selectedLevel, selectedGoal, selectedMinutes);
    router.replace('/(tabs)' as any);
  };

  const handleNext = () => {
    if (step === 0) {
      setNativeLanguage(selectedLang);
    }
    if (step < 3) {
      setStep((step + 1) as Step);
    } else {
      handleFinish();
    }
  };

  const renderStepIndicator = () => (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.stepRow}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[styles.stepDot, i === step && styles.stepDotActive, i < step && styles.stepDotDone]} />
      ))}
    </Animated.View>
  );

  const renderStep0 = () => (
    <Animated.View key="step0" entering={FadeInDown.duration(500)} style={styles.stepContent}>
      <Text style={styles.welcomeEmoji}>{'🎓'}</Text>
      <Text style={styles.welcomeTitle}>{t('welcomeTitle')}</Text>
      <Text style={styles.welcomeSubtitle}>{t('welcomeSubtitle')}</Text>
      <Text style={styles.sectionLabel}>{t('selectLanguage')}</Text>
      <View style={styles.optionsGrid}>
        {LANGUAGES.map(lang => (
          <Pressable
            key={lang}
            style={[styles.optionCard, selectedLang === lang && styles.optionCardSelected]}
            onPress={() => setSelectedLang(lang)}
          >
            <Text style={styles.optionFlag}>
              {lang === 'tr' ? '🇹🇷' : lang === 'es' ? '🇪🇸' : lang === 'ar' ? '🇸🇦' : lang === 'zh' ? '🇨🇳' : '🇧🇷'}
            </Text>
            <Text style={[styles.optionLabel, selectedLang === lang && styles.optionLabelSelected]}>
              {languageNames[lang]}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  const renderStep1 = () => (
    <Animated.View key="step1" entering={FadeInDown.duration(500)} style={styles.stepContent}>
      <Text style={styles.stepEmoji}>{'📊'}</Text>
      <Text style={styles.stepTitle}>{t('whatsYourLevel')}</Text>
      <View style={styles.optionsList}>
        {LEVELS.map(level => (
          <Pressable
            key={level}
            style={[styles.listOption, selectedLevel === level && styles.listOptionSelected]}
            onPress={() => setSelectedLevel(level)}
          >
            <Text style={styles.listOptionIcon}>{LEVEL_ICONS[level]}</Text>
            <Text style={[styles.listOptionText, selectedLevel === level && styles.listOptionTextSelected]}>
              {t(`level${level.charAt(0).toUpperCase() + level.slice(1)}` as any)}
            </Text>
            {selectedLevel === level && <Text style={styles.checkMark}>{'✓'}</Text>}
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View key="step2" entering={FadeInDown.duration(500)} style={styles.stepContent}>
      <Text style={styles.stepEmoji}>{'🎯'}</Text>
      <Text style={styles.stepTitle}>{t('whatsYourGoal')}</Text>
      <View style={styles.optionsList}>
        {GOALS.map(goal => (
          <Pressable
            key={goal}
            style={[styles.listOption, selectedGoal === goal && styles.listOptionSelected]}
            onPress={() => setSelectedGoal(goal)}
          >
            <Text style={styles.listOptionIcon}>{GOAL_ICONS[goal]}</Text>
            <Text style={[styles.listOptionText, selectedGoal === goal && styles.listOptionTextSelected]}>
              {t(`goal${goal.charAt(0).toUpperCase() + goal.slice(1)}` as any)}
            </Text>
            {selectedGoal === goal && <Text style={styles.checkMark}>{'✓'}</Text>}
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View key="step3" entering={FadeInDown.duration(500)} style={styles.stepContent}>
      <Text style={styles.stepEmoji}>{'⏰'}</Text>
      <Text style={styles.stepTitle}>{t('dailyGoal')}</Text>
      <View style={styles.minutesGrid}>
        {DAILY_OPTIONS.map(min => (
          <Pressable
            key={min}
            style={[styles.minuteCard, selectedMinutes === min && styles.minuteCardSelected]}
            onPress={() => setSelectedMinutes(min)}
          >
            <Text style={[styles.minuteNumber, selectedMinutes === min && styles.minuteNumberSelected]}>
              {min}
            </Text>
            <Text style={[styles.minuteLabel, selectedMinutes === min && styles.minuteLabelSelected]}>
              {t('minutesPerDay')}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {renderStepIndicator()}
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.bottomSection}>
        <Pressable
          style={({ pressed }) => [styles.continueButton, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={handleNext}
        >
          <Text style={styles.continueButtonText}>
            {step === 3 ? t('startLearning') : t('continueBtn')} {step < 3 ? '→' : '🚀'}
          </Text>
        </Pressable>

        {step > 0 && (
          <Pressable style={styles.backButton} onPress={() => setStep((step - 1) as Step)}>
            <Text style={styles.backButtonText}>{'←'} {t('back')}</Text>
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
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 40 : 70,
    paddingBottom: 40,
  },

  // Step indicator
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  stepDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.bgSurface,
  },
  stepDotActive: {
    backgroundColor: palette.primary,
    width: 48,
  },
  stepDotDone: {
    backgroundColor: palette.success,
  },

  // Step content
  stepContent: {
    alignItems: 'center',
    minHeight: 400,
  },
  welcomeEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  stepEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },

  // Language grid
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  optionCard: {
    width: '45%',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: palette.border,
  },
  optionCardSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  optionFlag: {
    fontSize: 32,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  optionLabelSelected: {
    color: palette.primary,
    fontWeight: '700',
  },

  // List options (level, goal)
  optionsList: {
    width: '100%',
    gap: 12,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 2,
    borderColor: palette.border,
    gap: 14,
  },
  listOptionSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  listOptionIcon: {
    fontSize: 24,
  },
  listOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
    lineHeight: 22,
  },
  listOptionTextSelected: {
    color: palette.primary,
    fontWeight: '700',
  },
  checkMark: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.primary,
  },

  // Minutes grid
  minutesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
  },
  minuteCard: {
    width: '42%',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: palette.border,
  },
  minuteCardSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  minuteNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: palette.textSecondary,
    marginBottom: 4,
  },
  minuteNumberSelected: {
    color: palette.primary,
  },
  minuteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMuted,
  },
  minuteLabelSelected: {
    color: palette.primary,
  },

  // Bottom
  bottomSection: {
    marginTop: 32,
    gap: 12,
    alignItems: 'center',
  },
  continueButton: {
    width: '100%',
    backgroundColor: palette.primary,
    paddingVertical: 18,
    borderRadius: Radius.sm,
    alignItems: 'center',
    ...Shadows.button,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  backButton: {
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textMuted,
  },
});
