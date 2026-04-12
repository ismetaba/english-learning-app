import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focusedName, focused }: { name: IoniconsName; focusedName: IoniconsName; focused: boolean }) {
  return (
    <View style={styles.tabIconWrap}>
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Ionicons
          name={focused ? focusedName : name}
          size={20}
          color={focused ? palette.primary : palette.textMuted}
        />
      </View>
    </View>
  );
}

function CenterButton({ focused }: { focused: boolean }) {
  return (
    <View style={styles.centerOuter}>
      <View style={styles.centerRing}>
        <View style={[styles.centerBtn, focused && styles.centerBtnActive]}>
          <Ionicons
            name="play"
            size={22}
            color={focused ? '#fff' : palette.textSecondary}
            style={{ marginLeft: 2 }}
          />
        </View>
      </View>
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
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(8, 10, 20, 0.92)',
          borderTopWidth: 0,
          height: Platform.OS === 'web' ? 64 : 80,
          paddingBottom: Platform.OS === 'web' ? 6 : 22,
          paddingTop: 6,
          elevation: 0,
          ...(Platform.OS !== 'web' ? {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
          } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.2,
          marginTop: 0,
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
          title: 'Video',
          tabBarIcon: ({ focused }) => <TabIcon name="film-outline" focusedName="film" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scenes"
        options={{
          title: ' ',
          tabBarIcon: ({ focused }) => <CenterButton focused={focused} />,
          tabBarLabelStyle: { fontSize: 0, height: 0 },
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: 'Kelimeler',
          tabBarIcon: ({ focused }) => <TabIcon name="language-outline" focusedName="language" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focusedName="person" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  iconPill: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: palette.primarySoft,
  },
  centerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  centerRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(8, 10, 20, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  centerBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: palette.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  centerBtnActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primaryLight,
    shadowColor: palette.primaryGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
});
