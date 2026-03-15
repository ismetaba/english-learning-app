import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { AppStateProvider, useAppContext } from '@/contexts/AppStateContext';
import { palette } from '@/constants/Colors';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Only call preventAutoHideAsync on native platforms where SplashScreen is supported.
// On web (especially static export), this can block rendering indefinitely.
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.bg,
    card: palette.bgCard,
    text: palette.textPrimary,
    border: palette.border,
    primary: palette.primary,
    notification: palette.accent,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && Platform.OS !== 'web') {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    // On web, show a loading indicator instead of returning null (which causes blank screen)
    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      );
    }
    return null;
  }

  return (
    <AppStateProvider>
      <RootLayoutNav />
    </AppStateProvider>
  );
}

function RootLayoutNav() {
  const { updateStreak, progress, isLoaded } = useAppContext();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoaded) {
      updateStreak();
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!progress.onboardingCompleted && !inOnboarding) {
      router.replace('/onboarding' as any);
    } else if (progress.onboardingCompleted && inOnboarding) {
      router.replace('/(tabs)' as any);
    }
  }, [isLoaded, progress.onboardingCompleted, segments]);

  // While AsyncStorage is hydrating, show a loading screen instead of rendering
  // the navigation tree. This prevents the tabs from briefly rendering (showing
  // only the tab bar) before the redirect to onboarding occurs.
  if (!isLoaded) {
    return (
      <ThemeProvider value={AppDarkTheme}>
        <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={AppDarkTheme}>
      <Stack>
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lessons/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="scenes/[id]" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
