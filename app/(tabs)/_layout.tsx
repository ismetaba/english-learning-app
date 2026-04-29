import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '@/constants/Colors';
import { useTranslation } from '@/hooks/useTranslation';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICON_ACTIVE = palette.primary;
const LABEL_INACTIVE = palette.textMuted;
const BAR_BG = '#11182A';
const BAR_BORDER = 'rgba(255,255,255,0.06)';
const ACCENT = palette.primary;

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  return (
    <View style={styles.tabIconWrap}>
      <Ionicons
        name={name}
        size={26}
        color={focused ? ICON_ACTIVE : LABEL_INACTIVE}
      />
    </View>
  );
}

function CenterButton() {
  return (
    <View style={styles.centerOuter} pointerEvents="box-none">
      <View style={styles.centerBtn}>
        <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
      </View>
    </View>
  );
}

function TabBarBackground() {
  return (
    <View style={styles.bgWrap} pointerEvents="none">
      <View style={styles.bgFill} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const bottomGap = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 8) + 8;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: ICON_ACTIVE,
        tabBarInactiveTintColor: LABEL_INACTIVE,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          bottom: bottomGap,
          left: 16,
          right: 16,
          height: 78,
          borderTopWidth: 0,
          paddingTop: 12,
          paddingBottom: 12,
          paddingHorizontal: 6,
          backgroundColor: 'transparent',
          borderRadius: 0,
          elevation: 0,
          ...(Platform.OS !== 'web' ? {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.45,
            shadowRadius: 28,
          } : {
            // @ts-ignore
            boxShadow: '0 18px 36px rgba(0,0,0,0.45), 0 4px 10px rgba(0,0,0,0.25)',
          }),
        },
        tabBarItemStyle: {
          paddingTop: 0,
        },
        tabBarLabelStyle: ({ focused }: { focused: boolean }) => ({
          fontSize: 12,
          fontWeight: focused ? '700' : '500',
          color: focused ? ICON_ACTIVE : LABEL_INACTIVE,
          letterSpacing: -0.1,
          marginTop: 4,
        }),
        headerShown: false,
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('learn'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'book' : 'book-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Video',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'film' : 'film-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scenes"
        options={{
          title: ' ',
          tabBarIcon: () => <CenterButton />,
          tabBarLabelStyle: { fontSize: 0, height: 0 },
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: 'Kelimeler',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'language' : 'language-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />,
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
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 39,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BAR_BORDER,
  },
  bgFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BAR_BG,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },
  centerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS !== 'web' ? {
      shadowColor: palette.primaryGlow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.8,
      shadowRadius: 18,
      elevation: 8,
    } : {
      // @ts-ignore
      boxShadow: '0 8px 22px rgba(133, 119, 255, 0.45)',
    }),
  },
});
