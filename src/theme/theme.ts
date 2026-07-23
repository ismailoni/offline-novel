/** App-wide colors + the reader's three reading themes. */

export interface Palette {
  bg: string;
  surface: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
}

export const appTheme: Palette = {
  bg: '#0f1115',
  surface: '#171a21',
  card: '#1e222b',
  text: '#e7e9ee',
  textMuted: '#9aa0ac',
  border: '#2a2f3a',
  accent: '#7c5cff',
  accentText: '#ffffff',
  danger: '#ff5c72',
};

export type ReaderThemeId = 'dark' | 'light' | 'sepia';

export interface ReaderTheme {
  id: ReaderThemeId;
  label: string;
  bg: string;
  text: string;
  muted: string;
}

export const READER_THEMES: Record<ReaderThemeId, ReaderTheme> = {
  dark: { id: 'dark', label: 'Dark', bg: '#0f1115', text: '#e7e9ee', muted: '#9aa0ac' },
  light: { id: 'light', label: 'Light', bg: '#ffffff', text: '#1a1a1a', muted: '#666666' },
  sepia: { id: 'sepia', label: 'Sepia', bg: '#f4ecd8', text: '#5b4636', muted: '#8a7355' },
};

export const FONT_FAMILIES = [
  { id: 'system', label: 'System', value: undefined as string | undefined },
  { id: 'serif', label: 'Serif', value: 'serif' },
  { id: 'mono', label: 'Mono', value: 'monospace' },
];
