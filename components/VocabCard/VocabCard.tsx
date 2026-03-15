import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { VocabWord } from '@/data/vocab';
import { Language } from '@/i18n';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Shadows, Radius } from '@/constants/Colors';

interface VocabCardProps {
  word: VocabWord;
  nativeLanguage: Language;
  onLearned?: () => void;
}

export default function VocabCard({ word, nativeLanguage, onLearned }: VocabCardProps) {
  const [flipped, setFlipped] = useState(false);
  const rotation = useSharedValue(0);
  const { t } = useTranslation();

  const handleFlip = () => {
    const newFlipped = !flipped;
    setFlipped(newFlipped);
    rotation.value = withTiming(newFlipped ? 180 : 0, { duration: 400 });
  };

  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value < 90 ? 1 : 0,
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [180, 360]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value > 90 ? 1 : 0,
    };
  });

  return (
    <Pressable onPress={handleFlip} style={styles.cardWrapper}>
      <View style={styles.cardContainer}>
        {/* Front */}
        <Animated.View style={[styles.card, styles.front, frontStyle]}>
          <View style={styles.cardTopDecor} />
          <Text style={styles.word}>{word.word}</Text>
          <Text style={styles.ipa}>{word.ipa}</Text>
          <View style={styles.posBadge}>
            <Text style={styles.posText}>{word.partOfSpeech}</Text>
          </View>
          <View style={styles.tapHintRow}>
            <Text style={styles.tapHintIcon}>{'👆'}</Text>
            <Text style={styles.tapHint}>{t('tapToFlip')}</Text>
          </View>
        </Animated.View>

        {/* Back */}
        <Animated.View style={[styles.card, styles.back, backStyle]}>
          <View style={styles.backTopDecor} />
          <Text style={styles.translationLabel}>Translation</Text>
          <Text style={styles.translation}>{word.translations[nativeLanguage] || word.translations.tr}</Text>
          <View style={styles.divider} />
          <Text style={styles.exampleLabel}>{t('example')}</Text>
          <Text style={styles.example}>{word.exampleSentence}</Text>
          {onLearned && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onLearned();
              }}
              style={({ pressed }) => [styles.learnedButton, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Text style={styles.learnedButtonText}>{t('gotIt')} +15 XP</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  cardContainer: {
    position: 'relative',
    marginHorizontal: 20,
    marginVertical: 8,
    minHeight: 320,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 32,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  front: {
    zIndex: 2,
  },
  back: {
    width: '100%',
  },

  // Front decorative bar
  cardTopDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: palette.primary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  backTopDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: palette.success,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },

  word: {
    fontSize: 38,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  ipa: {
    fontSize: 18,
    color: palette.textMuted,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  posBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  posText: {
    fontSize: 13,
    color: palette.primary,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 36,
  },
  tapHintIcon: {
    fontSize: 14,
  },
  tapHint: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: '500',
  },

  // Back
  translationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  translation: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.primary,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    width: '70%',
    marginBottom: 20,
  },
  exampleLabel: {
    fontSize: 11,
    color: palette.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  example: {
    fontSize: 16,
    color: palette.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  learnedButton: {
    marginTop: 28,
    backgroundColor: palette.success,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    shadowColor: palette.successGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  learnedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
