import React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { palette } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiFocused]}>{emoji}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.bgCard,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          height: Platform.OS === 'web' ? 64 : 85,
          paddingBottom: Platform.OS === 'web' ? 8 : 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('learn'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: t('vocabulary'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          title: 'Kesitler',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎞️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scenes"
        options={{
          title: t('scenes'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 32,
    borderRadius: 10,
  },
  tabIconFocused: {
    backgroundColor: palette.primarySoft,
    width: 42,
  },
  tabEmoji: {
    fontSize: 20,
    opacity: 0.4,
  },
  tabEmojiFocused: {
    opacity: 1,
    fontSize: 22,
  },
});
