/**
 * Expo Router only registers routes that live under `app/`. The reader screen's
 * implementation lives in `src/reader/[chapterId].tsx`, so this file re-exports
 * it to register the `/reader/[chapterId]` route. Without it, tapping
 * "Start reading" navigates to an unmatched route.
 */
export { default } from '@/reader/[chapterId]';