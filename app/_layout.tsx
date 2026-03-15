import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AppStateProvider, useAppContext } from '@/contexts/AppStateContext';
import { palette } from '@/constants/Colors';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

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
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
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
    updateStreak();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!progress.onboardingCompleted && !inOnboarding) {
      router.replace('/onboarding' as any);
    } else if (progress.onboardingCompleted && inOnboarding) {
      router.replace('/(tabs)' as any);
    }
  }, [isLoaded, progress.onboardingCompleted, segments]);

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
