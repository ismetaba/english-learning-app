import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CoursePlayer from '../../components/CoursePlayer/CoursePlayer';
import { palette } from '../../constants/Colors';

const DEV_HOST = Platform.OS === 'web' ? 'localhost' : '10.40.16.20';
const ADMIN_API = __DEV__ ? `http://${DEV_HOST}:3000` : 'https://english-learning-admin.fly.dev';

export default function VideoLessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Fetch the full lesson data with all clip subtitles
        const res = await fetch(`${ADMIN_API}/api/lessons/${id}/full`);
        if (!res.ok) throw new Error('Failed to load lesson');
        const data = await res.json();
        // Only keep clips with 2+ targets for a focused experience
        data.clips = (data.clips || []).filter((c: any) => c.target_count >= 2);
        data.total_targets = data.clips.reduce((sum: number, c: any) => sum + c.target_count, 0);
        setCourse(data);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Ders yükleniyor...</Text>
      </View>
    );
  }

  if (error || !course) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error || 'Ders bulunamadı'}</Text>
        <Text style={styles.errorHint}>Admin panelinin çalıştığından emin olun</Text>
      </View>
    );
  }

  return (
    <CoursePlayer
      course={course}
      onComplete={() => router.back()}
      onBack={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bg,
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.textMuted,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: palette.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
});
