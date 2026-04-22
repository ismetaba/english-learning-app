# English Learning — Native iOS (Swift)

Native SwiftUI rewrite of the existing Expo/React Native app, targeting **iOS 17+**, built with Xcode 16/26.

This is a standalone Swift project that reuses the existing backend (`https://english-learning-admin.fly.dev`). It runs independently of the React Native codebase — no Expo, no CocoaPods, no bridges.

## Getting started

```bash
cd ios-native
# Regenerate the Xcode project from project.yml if it's missing
xcodegen generate
open EnglishLearning.xcodeproj
```

Build & run in Xcode (⌘R) against any iPhone simulator.

## Project layout

```
EnglishLearning/
├── App/                  — Entry point & root view switching
├── DesignSystem/         — Theme tokens, colors, typography, modifiers
├── Models/               — Curriculum, Vocab, Progress, LessonSection
├── Services/             — API client, cache, spaced repetition, i18n
├── State/                — AppState (ObservableObject) + persistence
├── Components/           — Shared UI (buttons, cards, headers, loading)
├── Features/
│   ├── Onboarding/       — 4-step intro flow
│   ├── Home/             — Dashboard with XP hero, continue learning, learning path
│   ├── Courses/          — Unit-grouped lesson cards with clip entry
│   ├── Vocab/            — Vocab sets + word review entry
│   ├── VocabReview/      — SM-2 flashcards with flip animations
│   ├── Profile/          — Level ring, stats grid, 7-day chart, language picker
│   ├── Lesson/           — Lesson detail with section types + clip launcher
│   ├── ClipPlayer/       — YouTube IFrame WebView + synced subtitles
│   ├── Scenes/           — Movie-scene feed landing
│   └── DailyTasks/       — Daily plan sheet
└── Resources/            — Info.plist, Assets.xcassets
```

## Architecture

- **SwiftUI** throughout. Views hold minimal state; navigation uses `NavigationStack` + `navigationDestination`.
- **`AppState`** is a `@MainActor ObservableObject` that persists `UserProgress`, `vocabPool`, and `nativeLanguage` to `UserDefaults`.
- **`APIClient`** is an `actor` doing async HTTP with retries + exponential backoff.
- **`CacheService`** is an on-disk JSON cache (Caches directory) with TTL envelopes.
- **`SpacedRepetition`** is a pure SM-2 implementation, separate from state.
- **`Localization`** provides `Translations` bundles for `tr`, `es`, `ar`, `zh`, `pt`, `en`.
- **`YouTubePlayerView`** is a `UIViewRepresentable` wrapping `WKWebView` + YouTube IFrame API, with a time-update bridge for subtitle sync and word-level highlighting.
