import React from 'react';
import { View, StyleSheet } from 'react-native';
import { palette } from '@/constants/Colors';

export default function KelimelerScreen() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
});
