import React from 'react';
import { View, StyleSheet } from 'react-native';
import { palette } from '@/constants/Colors';
import LearningPath from '@/components/LearningPath/LearningPath';

export default function LearnScreen() {
  return (
    <View style={styles.container}>
      <LearningPath />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
});
