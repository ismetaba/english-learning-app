import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import SentenceBlock from './SentenceBlock';
import { SentencePart, StructureExample } from '@/data/structures';
import { BlockColors, palette, Radius } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

interface DragExerciseProps {
  example: StructureExample;
  onComplete: (correct: boolean) => void;
}

export default function DragExercise({ example, onComplete }: DragExerciseProps) {
  const [placed, setPlaced] = useState<(SentencePart | null)[]>(
    example.parts.map(() => null)
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const { t } = useTranslation();

  const shuffledParts = useMemo(() => {
    return [...example.parts].sort(() => Math.random() - 0.5);
  }, [example]);

  const usedIndices = new Set<number>();
  placed.forEach((p) => {
    if (p) {
      const idx = shuffledParts.findIndex(
        (sp, i) => sp.word === p.word && sp.type === p.type && !usedIndices.has(i)
      );
      if (idx >= 0) usedIndices.add(idx);
    }
  });

  const isCorrect = placed.every(
    (p, i) => p?.word === example.parts[i].word && p?.type === example.parts[i].type
  );

  const handlePoolPress = (poolIndex: number) => {
    if (usedIndices.has(poolIndex)) return;
    setSelectedIndex(poolIndex);
  };

  const handleSlotPress = (slotIndex: number) => {
    if (placed[slotIndex]) {
      const newPlaced = [...placed];
      newPlaced[slotIndex] = null;
      setPlaced(newPlaced);
      return;
    }

    if (selectedIndex === null) return;

    const newPlaced = [...placed];
    newPlaced[slotIndex] = shuffledParts[selectedIndex];
    setPlaced(newPlaced);
    setSelectedIndex(null);

    const allFilled = newPlaced.every((p) => p !== null);
    if (allFilled) {
      const correct = newPlaced.every(
        (p, i) => p?.word === example.parts[i].word && p?.type === example.parts[i].type
      );
      setShowResult(true);
      setTimeout(() => onComplete(correct), 2000);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>{t('buildSentence')}</Text>
      <Text style={styles.subInstruction}>{t('tapWordThenSlot')}</Text>

      {/* Slots */}
      <View style={styles.slotsRow}>
        {example.parts.map((part, index) => (
          <Pressable key={index} onPress={() => handleSlotPress(index)}>
            {placed[index] ? (
              <View style={showResult ? (placed[index]?.word === example.parts[index].word ? styles.slotCorrect : styles.slotWrong) : undefined}>
                <SentenceBlock part={placed[index]!} showLabel={false} size="medium" />
              </View>
            ) : (
              <View style={[styles.emptySlot, { borderColor: BlockColors[part.type as keyof typeof BlockColors] || '#95A5A6' }]}>
                <Text style={[styles.slotLabel, { color: BlockColors[part.type as keyof typeof BlockColors] || '#95A5A6' }]}>
                  {showHint && index === 0 ? example.parts[0].word : part.type}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Word Pool */}
      <View style={styles.pool}>
        <View style={styles.poolHeader}>
          <Text style={styles.poolLabel}>{t('wordPool')}</Text>
          {!showResult && !showHint && (
            <Pressable onPress={() => setShowHint(true)} style={styles.hintButton}>
              <Text style={styles.hintButtonText}>{t('hint')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.poolRow}>
          {shuffledParts.map((part, index) => (
            <Pressable
              key={index}
              onPress={() => handlePoolPress(index)}
              style={[
                styles.poolItem,
                { backgroundColor: BlockColors[part.type as keyof typeof BlockColors] || '#95A5A6' },
                usedIndices.has(index) && styles.poolItemUsed,
                selectedIndex === index && styles.poolItemSelected,
              ]}
            >
              <Text style={[styles.poolWord, usedIndices.has(index) && styles.poolWordUsed]}>
                {part.word}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Result */}
      {showResult && (
        <View style={[styles.result, isCorrect ? styles.resultCorrect : styles.resultIncorrect]}>
          <Text style={styles.resultEmoji}>{isCorrect ? '🎉' : '😕'}</Text>
          <Text style={[styles.resultText, { color: isCorrect ? palette.success : palette.error }]}>
            {isCorrect ? `${t('correct')}! +5 XP` : t('notQuiteRight')}
          </Text>
          {!isCorrect && (
            <Text style={styles.correctAnswer}>
              Correct: {example.parts.map(p => p.word).join(' ')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  instruction: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subInstruction: {
    fontSize: 14,
    color: palette.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  slotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 32,
  },
  emptySlot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgSurface,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  slotCorrect: {
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: palette.success,
  },
  slotWrong: {
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: palette.error,
  },
  pool: {
    padding: 16,
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.md,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  poolLabel: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '600',
  },
  hintButton: {
    backgroundColor: palette.warningSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  hintButtonText: {
    fontSize: 13,
    color: palette.warning,
    fontWeight: '600',
  },
  poolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  poolItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  poolItemUsed: {
    opacity: 0.25,
  },
  poolItemSelected: {
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  poolWord: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  poolWordUsed: {
    textDecorationLine: 'line-through',
  },
  result: {
    marginTop: 20,
    padding: 20,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  resultCorrect: {
    backgroundColor: palette.successSoft,
    borderWidth: 2,
    borderColor: palette.success,
  },
  resultIncorrect: {
    backgroundColor: palette.errorSoft,
    borderWidth: 2,
    borderColor: palette.error,
  },
  resultEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 20,
    fontWeight: '700',
  },
  correctAnswer: {
    marginTop: 8,
    fontSize: 14,
    color: palette.textSecondary,
    fontStyle: 'italic',
  },
});
