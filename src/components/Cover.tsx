import React from 'react';
import { Image, View, Text, StyleSheet, ImageStyle, StyleProp } from 'react-native';
import { appTheme } from '@/theme/theme';

interface Props {
  uri?: string;
  title: string;
  style?: StyleProp<ImageStyle>;
}

/** Cover image with a graceful text fallback when no image is available. */
export function Cover({ uri, title, style }: Props) {
  if (uri) {
    return <Image source={{ uri }} style={[styles.img, style]} resizeMode="cover" />;
  }
  return (
    <View style={[styles.img, styles.fallback, style]}>
      <Text style={styles.fallbackText} numberOfLines={4}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: appTheme.card,
    borderRadius: 8,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  fallbackText: {
    color: appTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});
