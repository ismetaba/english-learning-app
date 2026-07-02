import React from 'react';
import { View, StyleSheet } from 'react-native';
import { palette } from '@/constants/Colors';
import VideoFeed from '@/components/VideoFeed/VideoFeed';

export default function LearnScreen() {
  return (
    <View style={styles.container}>
      <VideoFeed />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
});
