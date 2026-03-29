import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focusedName, focused }: { name: IoniconsName; focusedName: IoniconsName; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Ionicons
        name={focused ? focusedName : name}
        size={24}
        color={focused ? palette.primary : palette.textMuted}
      />
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
          height: Platform.OS === 'web' ? 64 : 72,
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
          tabBarIcon: ({ focused }) => <TabIcon name="book-outline" focusedName="book" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Dersler',
          tabBarIcon: ({ focused }) => <TabIcon name="school-outline" focusedName="school" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: t('vocabulary'),
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles-outline" focusedName="chatbubbles" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          title: 'Kesitler',
          tabBarIcon: ({ focused }) => <TabIcon name="film-outline" focusedName="film" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scenes"
        options={{
          title: t('scenes'),
          tabBarIcon: ({ focused }) => <TabIcon name="videocam-outline" focusedName="videocam" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focusedName="person" focused={focused} />,
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
  },
});
