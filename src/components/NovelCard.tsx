import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Cover } from './Cover';
import { appTheme } from '@/theme/theme';

interface Props {
  title: string;
  coverUri?: string;
  subtitle?: string;
  badge?: string;
  /** Reading progress 0..1; when > 0 a thin bar is drawn across the cover. */
  progress?: number;
  onPress: () => void;
}

export function NovelCard({ title, coverUri, subtitle, badge, progress, onPress }: Props) {
  const pct = progress != null ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : 0;
  return (
    <Pressable style={styles.card} onPress={onPress} android_ripple={{ color: '#333' }}>
      <View>
        <Cover uri={coverUri} title={title} style={styles.cover} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        {pct > 0 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  cover: { width: '100%', aspectRatio: 2 / 3 },
  title: {
    color: appTheme.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  subtitle: {
    color: appTheme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: appTheme.accent,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { color: appTheme.accentText, fontSize: 10, fontWeight: '700' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: '#00000066',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
});
