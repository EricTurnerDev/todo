# Mobile Implementation Strategy: To-Do List

## Technology Choice

**React Native with Expo (managed workflow)**

**Rationale:**
- Single codebase targets both iOS and Android.
- Expo managed workflow eliminates native build tooling setup for the team; EAS Build handles app store binaries.
- The existing API is JSON over HTTP, which maps directly to `fetch` / `axios` in React Native — no adapter layer needed.
- Session cookies are handled with a small native cookie-store library (`@react-native-cookies/cookies`).
- Rich ecosystem for charts (`Victory Native` or `react-native-gifted-charts`), navigation (`Expo Router` / `React Navigation`), and date pickers.
- TypeScript support out of the box.

**Key dependencies:**
| Purpose | Library |
|---------|---------|
| Navigation | `expo-router` (file-based, v3) |
| State / server cache | `@tanstack/react-query` |
| HTTP client | `axios` with a shared interceptor |
| Cookie store | `@react-native-cookies/cookies` |
| Secure storage | `expo-secure-store` |
| Date picker | `@react-native-community/datetimepicker` |
| Charts | `react-native-gifted-charts` |
| Confetti | `react-native-confetti-cannon` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Forms | `react-hook-form` + `zod` |

---

## Sprint Overview

| Sprint | Focus | Duration |
|--------|-------|----------|
| 0 | Project setup & scaffolding | 1 week |
| 1 | Authentication screens | 1 week |
| 2 | Todo list & CRUD | 2 weeks |
| 3 | Filtering, sorting & categories | 1 week |
| 4 | Recurring todos, pause/resume, confetti | 1 week |
| 5 | Insights / analytics screen | 1 week |
| 6 | Polish, accessibility & QA | 1 week |
| 7 | App store preparation & release | 1 week |

Total estimated calendar time: **9 weeks**

---

## Sprint 0 — Project Setup & Scaffolding (1 week)

**Goal:** Working skeleton that CI can build and run on simulators.

### Tasks

#### S0-1: Repository & tooling setup
- Initialize a new Expo project: `npx create-expo-app todo-mobile --template expo-template-blank-typescript`
- Configure ESLint + Prettier with project rules.
- Set up Husky pre-commit hooks (lint + type-check).
- Add `.env` support via `expo-constants` and `app.config.ts`:
  - `EXPO_PUBLIC_API_URL` — backend base URL

#### S0-2: Navigation skeleton
- Install and configure `expo-router`.
- Define the top-level route structure:
  ```
  app/
  ├── (auth)/
  │   ├── login.tsx
  │   └── register.tsx
  ├── (app)/
  │   ├── _layout.tsx          ← bottom tab bar
  │   ├── todos/
  │   │   ├── index.tsx        ← list
  │   │   ├── new.tsx          ← create modal
  │   │   └── [id]/edit.tsx    ← edit modal
  │   ├── insights.tsx
  │   └── settings/
  │       ├── index.tsx
  │       └── categories.tsx
  └── index.tsx                ← auth gate redirect
  ```

#### S0-3: API client
- Create `lib/api.ts` — an `axios` instance with:
  - `baseURL` from env.
  - Request interceptor: attach the session cookie header (via cookie store).
  - Response interceptor: on `401`, clear stored session and redirect to `/login`.
- Create typed wrapper functions for each endpoint (returns strongly-typed response or throws `ApiError`).

#### S0-4: Auth gate
- `app/index.tsx` silently calls `GET /api/todos` (or a lightweight ping endpoint).
  - If 200 → redirect to `/(app)/todos`.
  - If 401 → redirect to `/(auth)/login`.
- Splash screen stays visible while the check is in-flight (via `expo-splash-screen`).

#### S0-5: CI pipeline
- GitHub Actions workflow:
  - `lint` job: ESLint + TypeScript check on every push.
  - `build` job: `eas build --platform all --profile preview` on PRs to main.
- Configure `eas.json` with `development`, `preview`, and `production` profiles.

#### S0-6: Design tokens
- Create `constants/colors.ts` defining:
  - The 8 category colors (bg + text RGB pairs as specified in REQ-UX-2).
  - Brand colors, neutral grays, error red.
- Create `constants/typography.ts` with font size scale.

---

## Sprint 1 — Authentication (1 week)

**Goal:** Users can register, log in, and log out. Session persists across app restarts.

### Tasks

#### S1-1: Login screen
- Layout: logo, email input, password input, "Log In" button, link to Register.
- `react-hook-form` + `zod` schema:
  - email: valid email format
  - password: min 8 characters
- On submit: `POST /auth/login` with `Content-Type: application/x-www-form-urlencoded` (matching the server's Compojure route).
- On success: store session cookie via `@react-native-cookies/cookies`; navigate to `/(app)/todos`.
- On failure: display server error message below the relevant field.
- Loading state: disable button and show spinner while request is in-flight.

#### S1-2: Register screen
- Layout mirrors login with an additional confirm-password field (client-side only).
- Same validation schema plus password-match check.
- On success: same cookie-store + navigate flow as login.

#### S1-3: Session cookie storage
- After successful login/register, read the `Set-Cookie` header from the axios response and store it in `expo-secure-store`.
- On every subsequent request the interceptor reads from `expo-secure-store` and injects the `Cookie` header.
- On logout or 401, delete the stored value.

#### S1-4: Logout
- Settings screen has a "Log Out" button.
- On tap: `POST /auth/logout`, clear `expo-secure-store`, navigate to `/(auth)/login`.

#### S1-5: Auth flow tests
- Unit tests (Jest) for the zod validation schemas.
- Integration test (mocked axios): login success → cookie stored; login 401 → error shown.

---

## Sprint 2 — Todo List & CRUD (2 weeks)

**Goal:** Users can view, create, edit, and delete todos. Core value of the app is functional.

### Tasks

#### S2-1: Todo list screen
- `useQuery(['todos'], fetchTodos)` via React Query.
- FlatList rendering todo items.
- Implement the `TodoItem` component:
  - Checkbox (calls toggle mutation on press).
  - Title with strike-through style when `completed = true`.
  - Description snippet.
  - Due date badge (red text if overdue — compare `due_at` to today's date).
  - Category badge (colored chip using `constants/colors.ts`).
- Pull-to-refresh triggers `queryClient.invalidateQueries(['todos'])`.

#### S2-2: Empty state
- When the FlatList has no data, render an `EmptyState` component with an illustration and copy.

#### S2-3: Create todo screen (modal)
- FAB (floating action button) in the bottom-right corner of the list.
- Opens as a modal sheet (`expo-router` modal route `todos/new.tsx`).
- Fields: Title, Description, Category (Picker), Due Date (DateTimePicker), Recurrence (Picker), Custom days (numeric input, visible only when recurrence = "custom").
- Form managed with `react-hook-form`.
- On submit: `POST /api/todos`; on success invalidate `['todos']` and close modal.
- Category picker populated from `useQuery(['categories'], fetchCategories)`.

#### S2-4: Edit todo screen (modal)
- Route `todos/[id]/edit.tsx`.
- Pre-populate form with the todo's current data (passed via navigation params or fetched via `GET /api/todos/:id`).
- On submit: `PUT /api/todos/:id`; on success invalidate `['todos']` and close modal.

#### S2-5: Delete todo
- Swipe-to-delete on `TodoItem` (using `react-native-gesture-handler` + `Swipeable`).
- `Alert.alert` confirmation dialog before calling `DELETE /api/todos/:id`.
- On success: optimistic removal from list (React Query optimistic update) or invalidate query.

#### S2-6: Toggle complete
- Checkbox press calls `PATCH /api/todos/:id/toggle`.
- Optimistic update: immediately flip `completed` in the cache.
- On error: roll back optimistic update and show toast.

#### S2-7: Loading & error states
- List shows a skeleton loader (3–5 placeholder rows) while the initial fetch is in-flight.
- Network / API errors show a `ErrorBanner` component with a "Retry" button.

#### S2-8: CRUD integration tests
- Mock axios responses and verify that:
  - List renders correct number of items.
  - Create form submits correct payload and refreshes list.
  - Delete confirmation → API call → item removed.

---

## Sprint 3 — Filtering, Sorting & Categories (1 week)

**Goal:** Users can filter by category, sort the list, and manage categories.

### Tasks

#### S3-1: Filter bar
- Horizontal `ScrollView` of category chips above the `FlatList`.
- "All" chip + one chip per category (colored per `constants/colors.ts`).
- Tapping a chip sets `activeCategoryId` in component state and re-fetches with `?category_id=<id>`.
- Active chip has a distinct border/background.

#### S3-2: Sort control
- A sort button (e.g. icon in the header) opens an `ActionSheet` with the 4 sort options.
- Selection updates `sortValue` state; re-fetches with `?sort=<field>&order=<dir>`.

#### S3-3: Show completed toggle
- Toggle switch in the filter bar or list header.
- Controls whether `show_completed=true` is appended to the API request.

#### S3-4: Show paused toggle
- Identical to S3-3 but for `show_inactive=true`.

#### S3-5: Persist filter/sort preferences
- Create `hooks/usePreferences.ts`:
  - Reads/writes a JSON object keyed by `todo-prefs-${userId}` from `AsyncStorage`.
  - Fields: `showCompleted`, `showInactive`, `sortValue`, `activeCategoryId`.
- Preferences are loaded on mount and updated on every change.

#### S3-6: Categories screen
- `settings/categories.tsx` lists all categories (from `GET /api/categories`).
- Each row: colored swatch, category name, delete button (×).

#### S3-7: Create category
- Inline form at the bottom of the categories screen: text input + color picker row.
- Color picker: 8 circular swatches using `constants/colors.ts` background values.
- On submit: `POST /api/categories`; invalidate `['categories']`.

#### S3-8: Edit category color
- Tapping a category's color swatch opens a color picker (same 8 swatches).
- On selection: `PATCH /api/categories/:id/color`; update cache.

#### S3-9: Delete category
- Confirmation alert: "Deleting this category will unassign it from all tasks."
- On confirm: `DELETE /api/categories/:id`; invalidate `['categories']` and `['todos']`.

---

## Sprint 4 — Recurring Todos, Pause/Resume & Confetti (1 week)

**Goal:** All recurring and pause/resume behaviors match the web app.

### Tasks

#### S4-1: Recurring todo display
- `TodoItem` shows a `↻` (Ionicons `repeat`) icon when `recurrence_type` is non-null.
- Recurrence label: "Daily", "Weekly", "Monthly", "Yearly", or "Every N days".
- Shows "Last done: <date>" if `last_done_at` is set.

#### S4-2: Toggle behavior for recurring todos
- When `PATCH /api/todos/:id/toggle` is called on a recurring todo the server advances `due_at` rather than marking the item completed — the item stays visible.
- The client must NOT apply an optimistic "completed" style for recurring todos; instead refresh the item's `due_at` from the server response.

#### S4-3: Pause / Resume button
- `TodoItem` shows a pause icon (⏸) for active recurring todos and a play icon (▶) for paused ones.
- Press calls `PATCH /api/todos/:id/active` with `{active: false}` or `{active: true}`.
- Updates the cached todo item.

#### S4-4: Disabled checkbox for paused items
- Paused todo checkboxes render as disabled (grayed out).
- Pressing a disabled checkbox shows a brief toast: "Resume this task to mark it done."

#### S4-5: Confetti animation
- When a non-recurring todo is toggled to `completed = true`:
  - Fire `react-native-confetti-cannon` from the top of the screen.
  - 22 particles, ~550 ms duration (matching the web app's behavior).
- No confetti for recurring todos (they don't reach "completed" state).

#### S4-6: Overdue motivation banner
- Compute overdue count from the fetched todo list (`due_at < today && !completed && active`).
- If count > 0, render a `MotivationBanner` above the list with a randomly chosen motivational quote (static list in `constants/quotes.ts`, matching the web app's quote set).
- Banner has a dismiss (×) button; dismissed state is stored in component state (resets each app launch).

---

## Sprint 5 — Insights / Analytics Screen (1 week)

**Goal:** Insights screen is fully functional with all charts and stats.

### Tasks

#### S5-1: Insights data fetch
- `useQuery(['insights'], fetchInsights)` calling `GET /api/insights`.
- Loading skeleton and error state.

#### S5-2: Summary stats cards
- A row of stat cards (or a grid) showing the 7 key summary values (REQ-INSIGHTS-2).
- Tap a card for no additional action (display only).

#### S5-3: Completions bar chart (30 days)
- `BarChart` from `react-native-gifted-charts`.
- X-axis: date labels (every 7th day to avoid crowding).
- Y-axis: count.
- Data: `completed_per_day` from the insights response.

#### S5-4: Completions bar chart (12 weeks)
- Same component, data: `completed_per_week`.
- X-axis: week-start date labels.

#### S5-5: Backlog line chart
- `LineChart` component.
- Data: `backlog_per_day`.

#### S5-6: Completion histogram
- Horizontal bar chart or segmented bar.
- 5 buckets: same day / 1–3 days / 4–7 days / 8–30 days / 30+ days.
- Show absolute count and percentage label on each bar.

#### S5-7: Day-of-week chart
- Bar chart with 7 bars (Sun–Sat).
- Highlight the bar with the highest value.

#### S5-8: Per-category breakdown
- A `SectionList` or flat list of category rows.
- Columns: name (colored chip), total, completed, overdue, on-time %.
- Scrollable horizontally if needed on small screens.

#### S5-9: Empty / no-data state
- If the user has no completed tasks, show a placeholder message instead of the charts.

---

## Sprint 6 — Polish, Accessibility & QA (1 week)

**Goal:** The app is stable, accessible, and visually polished across devices.

### Tasks

#### S6-1: Accessibility audit
- Add `accessibilityLabel` and `accessibilityHint` to every interactive element.
- Verify VoiceOver (iOS) and TalkBack (Android) narrate the UI correctly.
- Ensure no element relies on color alone (add text/icon labels alongside all color badges).

#### S6-2: Dynamic type / font scaling
- Replace all hard-coded font sizes with scaled values using `useWindowDimensions` or `PixelRatio`.
- Test at iOS Accessibility → Larger Text settings.

#### S6-3: Device & OS matrix testing
- Test on physical or simulated devices:
  - iPhone SE (small screen, iOS 16)
  - iPhone 15 Pro (large screen, iOS 17)
  - Pixel 6 (Android 12)
  - Samsung Galaxy S23 (Android 13, One UI skin)
- Fix any layout issues found.

#### S6-4: Landscape orientation
- Verify all screens are usable in landscape.
- Widen the container or switch to a 2-column layout for the todo list on wide screens.

#### S6-5: Error & edge case hardening
- Confirm no crash when API returns unexpected fields or null values.
- Test with a slow network (Charles Proxy throttle to 3G).
- Verify 401 mid-session correctly logs the user out.

#### S6-6: Performance
- Profile FlatList with 200+ todos; enable `removeClippedSubviews` and `keyExtractor`.
- Verify Insights charts render without jank on mid-range Android.
- Confirm no memory leaks (detached RN components after navigation).

#### S6-7: Visual QA pass
- Compare screenshots side-by-side with the web app for consistent color, spacing, and typography.
- Ensure category color chips exactly match `constants/colors.ts` values.

#### S6-8: End-to-end tests (Detox)
- Critical user journey: Register → Create todo → Mark done → Confetti plays → Insights shows 1 completion.
- Secondary journey: Create recurring todo → Mark done → Due date advances → Pause → Checkbox disabled.

---

## Sprint 7 — App Store Preparation & Release (1 week)

**Goal:** The app is submitted to both app stores.

### Tasks

#### S7-1: App icons & splash screen
- Design and export app icon at required resolutions for iOS and Android.
- Configure `app.json` with icon paths.
- Design splash screen (matches brand colors).

#### S7-2: App metadata
- Write App Store / Google Play listing copy:
  - Short description (30 chars)
  - Long description
  - Keywords
- Take marketing screenshots on iPhone 6.7" and a 6.5" device (iOS) and a Pixel tablet and phone (Android).

#### S7-3: Production build
- Set `EXPO_PUBLIC_API_URL` to the production backend URL.
- `eas build --platform all --profile production`.
- Verify production build on a physical device.

#### S7-4: iOS submission
- Configure Apple Developer account, bundle ID, provisioning profile.
- Submit via `eas submit --platform ios`.
- Address any App Review feedback.

#### S7-5: Android submission
- Configure Google Play Console, package name, signing keystore.
- Submit via `eas submit --platform android`.
- Release to internal test track first, then promote to production.

#### S7-6: Post-release monitoring
- Integrate `expo-updates` for OTA updates (JS-only patches without app store review).
- Set up Sentry (`sentry-expo`) for crash reporting.
- Define a rollback plan (revert to previous EAS Update channel if critical bug found).

---

## Definition of Done

A sprint is considered complete when:
1. All tasks in the sprint are implemented and code-reviewed.
2. Unit tests pass (Jest, >80% coverage on new code).
3. The feature is manually verified on at least one iOS simulator and one Android emulator.
4. No new ESLint errors or TypeScript errors are introduced.
5. The CI build passes.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Session cookie handling differs between iOS and Android | Medium | High | Spike in Sprint 0 to validate cookie round-trip before writing auth screens |
| React Native chart library performance on low-end Android | Medium | Medium | Benchmark in Sprint 5; fall back to a simpler SVG-based implementation if needed |
| Apple App Review rejects due to login-only app policy | Low | High | Ensure registration screen is prominently accessible; add a guest/demo mode if required |
| API CORS headers not configured for mobile origin | Medium | High | Verify with backend team before Sprint 1; mobile apps send requests without an Origin header so this is usually a non-issue with cookie auth |
| Confetti library not maintained / causes crash | Low | Low | Wrap in try/catch; confetti is cosmetic — safe to disable if it causes issues |
