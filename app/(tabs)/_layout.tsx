import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '@/theme/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: appTheme.surface },
        headerTintColor: appTheme.text,
        tabBarStyle: {
          backgroundColor: appTheme.surface,
          borderTopColor: appTheme.border,
        },
        tabBarActiveTintColor: appTheme.accent,
        tabBarInactiveTintColor: appTheme.textMuted,
        sceneStyle: { backgroundColor: appTheme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
