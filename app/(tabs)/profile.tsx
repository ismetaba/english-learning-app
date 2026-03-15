import React from 'react';
import { StyleSheet, ScrollView, Pressable, Text, View, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { Language, languageNames } from '@/i18n';
import { useAppContext } from '@/contexts/AppStateContext';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';

const LANG_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  es: '🇪🇸',
  ar: '🇸🇦',
  zh: '🇨🇳',
  pt: '🇧🇷',
  en: '🇬🇧',
};

export default function ProfileScreen() {
  const { nativeLanguage, setNativeLanguage, progress, getLevelInfo } = useAppContext();
  const { t } = useTranslation();
  const levelInfo = getLevelInfo();

  const statCards = [
    { icon: '📖', value: progress.completedLessons.length, label: t('structures'), bgColor: palette.primarySoft },
    { icon: '💬', value: progress.learnedWords.length, label: t('words'), bgColor: palette.successSoft },
    { icon: '🎬', value: progress.watchedScenes.length, label: t('scenes'), bgColor: palette.accentSoft },
    { icon: '🔥', value: progress.streak, label: t('dayStreak'), bgColor: palette.xpGlow, isStreak: true },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('profile')}</Text>
      </Animated.View>

      {/* XP Hero Card */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.xpHero}>
        <View style={styles.xpHeroInner}>
          <View style={styles.xpRow}>
            <View>
              <Text style={styles.xpAmount}>{progress.xp}</Text>
              <Text style={styles.xpLabel}>{t('totalExperience')}</Text>
            </View>
            <View style={styles.levelCircle}>
              <Text style={styles.levelCircleText}>{levelInfo.level}</Text>
            </View>
          </View>

          {/* Level progress */}
          <View style={styles.levelSection}>
            <View style={styles.levelLabelRow}>
              <Text style={styles.levelName}>{levelInfo.name}</Text>
              <Text style={styles.levelPercent}>{Math.round(levelInfo.percent)}%</Text>
            </View>
            <View style={styles.levelBar}>
              <View style={[styles.levelFill, { width: `${levelInfo.percent}%` }]} />
            </View>
            <Text style={styles.levelXpText}>
              {progress.xp - levelInfo.current} / {levelInfo.next - levelInfo.current} XP to next level
            </Text>
          </View>
        </View>
        {/* Decorative elements */}
        <View style={[styles.heroDecor, styles.heroDecor1]} />
        <View style={[styles.heroDecor, styles.heroDecor2]} />
      </Animated.View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {statCards.map((stat, i) => (
          <Animated.View key={stat.label} entering={FadeInUp.delay(100 * i).duration(400)} style={[styles.statCard, stat.isStreak && styles.streakStatCard]}>
            <View style={[styles.statIconBg, { backgroundColor: stat.bgColor }]}>
              <Text style={styles.statIcon}>{stat.icon}</Text>
            </View>
            <Text style={[styles.statValue, stat.isStreak && { color: palette.streak }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Language Selection */}
      <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.section}>
        <Text style={styles.sectionTitle}>{t('nativeLanguage')}</Text>
        <Text style={styles.sectionSubtitle}>Choose your native language for translations</Text>
        <View style={styles.langGrid}>
          {(Object.entries(languageNames) as [Language, string][]).map(([code, name]) => (
            <Pressable
              key={code}
              style={({ pressed }) => [
                styles.langCard,
                nativeLanguage === code && styles.langCardActive,
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
              onPress={() => setNativeLanguage(code)}
            >
              <Text style={styles.langFlag}>{LANG_FLAGS[code] || '🌐'}</Text>
              <Text
                style={[
                  styles.langName,
                  nativeLanguage === code && styles.langNameActive,
                ]}
              >
                {name}
              </Text>
              {nativeLanguage === code && (
                <View style={styles.langCheck}>
                  <Text style={styles.langCheckText}>{'✓'}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
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
    paddingBottom: 40,
  },

  // Header
  screenHeader: {
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },

  // XP Hero
  xpHero: {
    marginHorizontal: 20,
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: palette.primaryGlow,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  xpHeroInner: {
    padding: 24,
    zIndex: 2,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  xpAmount: {
    fontSize: 44,
    fontWeight: '800',
    color: palette.textPrimary,
    letterSpacing: -1,
  },
  xpLabel: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  levelCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: palette.primaryGlow,
  },
  levelCircleText: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.primary,
  },
  levelSection: {},
  levelLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  levelName: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  levelPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.textSecondary,
  },
  levelBar: {
    height: 8,
    backgroundColor: palette.bgSurface,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  levelFill: {
    height: '100%',
    backgroundColor: palette.success,
    borderRadius: 4,
  },
  levelXpText: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '500',
  },
  heroDecor: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
  },
  heroDecor1: {
    width: 140,
    height: 140,
    top: -40,
    right: -30,
  },
  heroDecor2: {
    width: 90,
    height: 90,
    bottom: -20,
    left: -20,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  streakStatCard: {
    borderWidth: 1.5,
    borderColor: palette.xpGlow,
  },
  statIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statIcon: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Language
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 16,
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    backgroundColor: palette.bgCard,
    borderWidth: 2,
    borderColor: palette.border,
  },
  langCardActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  langFlag: {
    fontSize: 22,
  },
  langName: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  langNameActive: {
    color: palette.primary,
    fontWeight: '700',
  },
  langCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langCheckText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
