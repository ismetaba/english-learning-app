import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import SentenceBlock from './SentenceBlock';
import { StructureExample } from '@/data/structures';
import { BlockColors, palette, Radius } from '@/constants/Colors';

interface DiagramViewProps {
  example: StructureExample;
  nativeTranslation?: string;
  showTranslation?: boolean;
  showArrows?: boolean;
}

export default function DiagramView({ example, nativeTranslation, showTranslation = true, showArrows = true }: DiagramViewProps) {
  return (
    <View style={styles.container}>
      {/* Visual diagram with blocks */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.blocksRow}>
        {example.parts.map((part, index) => (
          <React.Fragment key={index}>
            <SentenceBlock part={part} size="large" />
            {showArrows && index < example.parts.length - 1 && (
              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            )}
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Full sentence */}
      <View style={styles.sentenceRow}>
        {example.parts.map((part, index) => (
          <Text key={index} style={[styles.sentenceWord, { color: BlockColors[part.type] }]}>
            {part.word}
            {index < example.parts.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </View>

      {/* Native language translation */}
      {showTranslation && nativeTranslation && (
        <View style={styles.translationRow}>
          <Text style={styles.translationLabel}>↕</Text>
          <Text style={styles.translation}>{nativeTranslation}</Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        {example.parts.map((part, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BlockColors[part.type] }]} />
            <Text style={styles.legendText}>{part.type}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
  },
  blocksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  arrow: {
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 24,
    color: palette.textMuted,
    fontWeight: '300',
  },
  sentenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sentenceWord: {
    fontSize: 20,
    fontWeight: '600',
  },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.xs,
  },
  translationLabel: {
    fontSize: 16,
    marginRight: 8,
    color: palette.textMuted,
  },
  translation: {
    fontSize: 16,
    color: palette.textSecondary,
    fontStyle: 'italic',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
    color: palette.textMuted,
    textTransform: 'capitalize',
  },
});
