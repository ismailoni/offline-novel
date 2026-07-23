# Offline Novel 📖

A mobile app (Expo / React Native) for reading light novels from
**novelphoenix.com** offline. It crawls the site directly from your phone, lets
you build a personal library, download novels for offline reading, resume where
you left off, and get **local** notifications when new chapters drop — with
**everything stored on-device**. No account, no server, no login.

## Features

- **Browse & search** Novel Phoenix from inside the app.
- **Personal library** — save novels and continue from where you stopped.
- **Offline downloads** — download whole novels (or single chapters) as plain
  text stored on your phone; chapters you read online are cached automatically.
- **Reader tools** — adjustable text size, line spacing, margins, three reading
  themes (dark / light / sepia), font choice, keep-screen-on, and
  previous/next chapter navigation. Reading position is remembered per novel.
- **Update notifications** — a background task periodically checks your library
  for new chapters and fires a local notification. Fully on-device.

## Architecture

```
app/                       Expo Router screens
  _layout.tsx              Boots the DB + background task, handles notif taps
  (tabs)/                  Library · Browse · Settings
  novel/[id].tsx           Novel detail: info, library toggle, download, chapters
  reader/[chapterId].tsx   Reader + reading tools
src/
  source/                  Site crawler (adapter pattern)
    types.ts               NovelSource interface
    madaraSource.ts        novelphoenix.com adapter — ALL selectors live here
    http.ts / parse.ts     fetch + HTML parsing helpers
    registry.ts            registered sources
  db/                      SQLite: novels, chapters, progress, settings
  storage/files.ts         Filesystem storage for downloaded chapters + covers
  services/                library · download · updates orchestration
  notifications/           local notifications + background-fetch task
  reader/                  reader settings store + content loader
  theme/                   colors + reader themes
```

Only the crawler (`src/source/`) knows anything about the website. Everything
else works against the storage layer, so adding another source later is just a
new adapter.

## Getting started

```bash
npm install
# Align native package versions with the installed Expo SDK:
npx expo install --fix

# Run it:
npx expo start          # then press a / i, or scan the QR in Expo Go
```

> **Development build note:** background fetch and local notifications require a
> [development build](https://docs.expo.dev/develop/development-builds/introduction/)
> or a standalone binary — they do **not** run in the sandboxed Expo Go app.
> Browsing, downloading, and reading all work in Expo Go.

## Building an installable APK

The app uses **only local notifications**, so no Firebase/push credentials are
needed — a plain release APK has full functionality.

### Option A — EAS Build (cloud, recommended, no Android Studio)

```bash
npm i -g eas-cli
eas login                       # free Expo account: https://expo.dev/signup
eas build:configure             # first run only: links an EAS projectId into app.json
eas build -p android --profile preview
```

When the build finishes (~10–15 min) EAS prints a URL. Open it on your phone,
tap **Install**, allow "install from unknown sources", done. `eas.json` already
defines a `preview` profile that outputs an **APK** (not an AAB).

### Option B — Build locally (needs Android SDK + JDK 17)

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK lands at: android/app/build/outputs/apk/release/app-release.apk
```

Copy that file to your phone and install it. (`ios/` and `android/` are
git-ignored — `prebuild` regenerates them.)

### Quicker to iterate: a development build

```bash
eas build -p android --profile development   # install this APK once
npx expo start --dev-client                  # reload JS over Wi-Fi, no rebuild
```

## App icon & splash

The icon, Android adaptive icon, splash mark, and web favicon in `assets/` are
generated from a single SVG in `scripts/generate-assets.mjs`. They're already
committed; to regenerate after tweaking the design:

```bash
npm i sharp --no-save   # dev-only, not a runtime dependency
npm run gen:assets
```

## ⚠️ Tuning the crawler

This project was scaffolded without live access to novelphoenix.com, so the
crawler ships with the **standard WordPress "Madara" theme selectors** (the
theme this class of site almost always uses). If a screen comes up empty:

1. Open novelphoenix.com in a desktop browser and inspect the element (the
   novel card, the chapter list row, the chapter body, etc.).
2. Adjust the matching CSS selector in
   [`src/source/madaraSource.ts`](src/source/madaraSource.ts) — everything
   site-specific lives in the `NOVELPHOENIX_CONFIG` object at the top.

No other code needs to change. Common things to verify:

- **Chapter list endpoint** — Madara serves chapters via AJAX. The adapter
  tries `{novelUrl}ajax/chapters/` and falls back to `admin-ajax.php`. If the
  site uses a different path, update `fetchChapterFragment`.
- **Chapter body selector** — `selectors.chapterContent`.
- **Listing / search URLs** — `getLatest` / `search`.

## A note on responsible use

This is a personal offline reader: it fetches freely-available content for your
own reading when you don't have data. Please be considerate — the download
service already paces requests. Respect the source site's terms and don't
redistribute downloaded content.
