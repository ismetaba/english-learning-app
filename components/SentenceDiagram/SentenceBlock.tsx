import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BlockColors } from '@/constants/Colors';
import { SentencePart } from '@/data/structures';

interface SentenceBlockProps {
  part: SentencePart;
  showLabel?: boolean;
  onPress?: () => void;
  isPlaceholder?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function SentenceBlock({ part, showLabel = true, onPress, isPlaceholder, size = 'medium' }: SentenceBlockProps) {
  const color = BlockColors[part.type] || '#95A5A6';
  const sizeStyle = sizes[size];

  if (isPlaceholder) {
    return (
      <Pressable onPress={onPress} style={[styles.block, sizeStyle, styles.placeholder, { borderColor: color }]}>
        <Text style={[styles.placeholderText, { color }]}>{part.type}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={[styles.block, sizeStyle, { backgroundColor: color }]}>
      <Text style={[styles.word, sizeStyle.fontSize ? { fontSize: sizeStyle.fontSize } : {}]}>{part.word}</Text>
      {showLabel && (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>{part.type}</Text>
        </View>
      )}
    </Pressable>
  );
}

const sizes = StyleSheet.create({
  small: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 14,
  } as any,
  medium: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 18,
  } as any,
  large: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    fontSize: 22,
  } as any,
});

const styles = StyleSheet.create({
  block: {
    marginHorizontal: 4,
    marginVertical: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  placeholder: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  word: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  placeholderText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelContainer: {
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  label: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
