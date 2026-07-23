/**
 * Reader preferences, persisted to disk via AsyncStorage so the reading tools
 * (font size, spacing, theme, typeface) survive restarts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReaderThemeId } from '@/theme/theme';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number; // multiplier
  theme: ReaderThemeId;
  fontFamily: string | undefined;
  marginH: number;
  keepAwake: boolean;
}

interface ReaderState extends ReaderSettings {
  setFontSize: (n: number) => void;
  setLineHeight: (n: number) => void;
  setTheme: (t: ReaderThemeId) => void;
  setFontFamily: (f: string | undefined) => void;
  setMarginH: (n: number) => void;
  setKeepAwake: (v: boolean) => void;
}

const MIN_FONT = 12;
const MAX_FONT = 34;

export const useReaderSettings = create<ReaderState>()(
  persist(
    (set) => ({
      fontSize: 18,
      lineHeight: 1.6,
      theme: 'dark',
      fontFamily: undefined,
      marginH: 20,
      keepAwake: false,
      setFontSize: (n) => set({ fontSize: clamp(n, MIN_FONT, MAX_FONT) }),
      setLineHeight: (n) => set({ lineHeight: clamp(n, 1.2, 2.4) }),
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setMarginH: (n) => set({ marginH: clamp(n, 0, 48) }),
      setKeepAwake: (keepAwake) => set({ keepAwake }),
    }),
    {
      name: 'reader-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
