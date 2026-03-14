# Mobile App Requirements: To-Do List

## 1. Overview

A cross-platform mobile application (iOS and Android) that mirrors the feature set of the existing web application. The mobile app consumes the same REST API as the web frontend. All business logic lives server-side; the mobile app is a thin client.

**API base URL:** Configured at build time via environment (e.g. `EXPO_PUBLIC_API_URL`). Assumes the Clojure/Jetty backend is reachable over HTTPS.

---

## 2. Assumptions & Constraints

- The backend API is already deployed and reachable over HTTPS.
- Authentication uses session cookies (the API sets a `Set-Cookie` header on login; subsequent requests must send the cookie).
- All API responses are JSON.
- The existing API is not versioned; no breaking changes are expected during mobile development.
- The 8-category colors defined in the web app (`blue`, `purple`, `orange`, `green`, `red`, `amber`, `sky`, `pink`) must be reproduced faithfully in the mobile palette.
- No offline-first requirement for MVP; network connectivity is assumed.
- Push notifications are out of scope for MVP.

---

## 3. Authentication

### REQ-AUTH-1: Registration
- User can create an account with email and password.
- Email must pass format validation (`[^@\s]+@[^@\s]+\.[^@\s]+`) before submitting.
- Password must be at least 8 characters; enforce client-side before submitting.
- On success (`POST /auth/register`) the server sets a session cookie and the app navigates to the main screen.
- On failure the app displays the server error message beneath the relevant field.

### REQ-AUTH-2: Login
- User can sign in with email and password.
- Same validations as registration.
- On success (`POST /auth/login`) the server sets a session cookie; app navigates to main screen.
- On failure display error message from server response.

### REQ-AUTH-3: Logout
- A "Log Out" action is accessible from the app (e.g. settings screen or header menu).
- Issues `POST /auth/logout`.
- Session cookie is cleared; app navigates to the login screen.

### REQ-AUTH-4: Session Persistence
- The session cookie must be persisted across app restarts (use a cookie jar or secure storage).
- On cold launch the app checks whether a valid session exists by hitting a protected endpoint; if the session is valid it skips the login screen.
- If any protected API call returns `401`, the app immediately redirects to the login screen and clears stored credentials.

---

## 4. To-Do Management

### REQ-TODO-1: List View
- The main screen displays the user's to-do items fetched from `GET /api/todos`.
- Default sort: by date added, newest first.
- Each list item shows:
  - Checkbox (completed state)
  - Title
  - Description snippet (first line, truncated at ~80 characters if long)
  - Category badge (colored chip with category name)
  - Due date badge (red if overdue, dimmed if completed)
  - Recurrence indicator (↻ icon + recurrence type label)
  - Paused badge (if `active = false`)
  - "Added X ago" relative timestamp

### REQ-TODO-2: Create To-Do
- A floating action button (FAB) or prominent "Add" button opens a creation form.
- Fields:
  - **Title** (required, text input)
  - **Description** (optional, multi-line text input)
  - **Category** (optional, picker populated from `GET /api/categories`)
  - **Due date** (optional, date picker; no time component)
  - **Recurrence** (optional, picker: None / Daily / Weekly / Monthly / Yearly / Custom N days)
    - When "Custom" is selected, a numeric input for the number of days appears.
- Submits `POST /api/todos`.
- On success the list refreshes and the form closes.

### REQ-TODO-3: Edit To-Do
- Tapping a to-do item (or an edit icon) opens an edit form pre-populated with the item's current values.
- Same fields as creation.
- Submits `PUT /api/todos/:id`.
- On success the list refreshes and the form closes.

### REQ-TODO-4: Complete / Uncomplete
- Tapping the checkbox calls `PATCH /api/todos/:id/toggle`.
- For non-recurring todos: item is marked completed (strike-through title, dim appearance).
- For recurring todos: due date advances; item does not appear completed (matches server behavior).
- A confetti/celebration animation plays when a non-recurring item is toggled to completed.
- Paused items show a disabled checkbox; the toggle action is blocked with a brief "Resume this task to mark it done" tooltip.

### REQ-TODO-5: Delete To-Do
- A delete action (swipe-to-delete or action menu) calls `DELETE /api/todos/:id`.
- A confirmation dialog is shown before deletion.
- On success the item is removed from the list.

### REQ-TODO-6: Pause / Resume
- Recurring to-do items show a pause/resume button.
- Pause calls `PATCH /api/todos/:id/active` with `{active: false}`.
- Resume calls `PATCH /api/todos/:id/active` with `{active: true}`.
- The list item updates its paused badge accordingly.

---

## 5. Filtering & Sorting

### REQ-FILTER-1: Sort Order
- A sort control lets the user choose between:
  - Date added – newest first
  - Date added – oldest first
  - Due date – soonest first
  - Due date – latest first
- Selection maps to the `sort` and `order` query parameters on `GET /api/todos`.
- Selection is persisted in local storage across app restarts (per user).

### REQ-FILTER-2: Category Filter
- A horizontal scrollable row of category chips (plus an "All" chip) appears above the list.
- Selecting a chip re-fetches `GET /api/todos?category_id=<id>`.
- "All" chip clears the category filter.
- Active chip is visually highlighted.
- Selected category is persisted in local storage per user.

### REQ-FILTER-3: Show Completed
- A toggle (switch or button) controls whether completed items are included.
- When off, `show_completed` is omitted from the API request; when on, `show_completed=true` is appended.
- State persisted in local storage per user.

### REQ-FILTER-4: Show Paused
- A toggle controls whether paused (inactive) recurring items are shown.
- When on, `show_inactive=true` is appended to the API request.
- State persisted in local storage per user.

---

## 6. Categories

### REQ-CAT-1: Category List
- A "Categories" section (accessible from a tab or settings screen) shows all user categories from `GET /api/categories`.
- Each category is displayed as a colored chip with its name.

### REQ-CAT-2: Create Category
- An "Add category" input lets the user enter a name and pick a color.
- Color picker offers the 8 predefined palette colors.
- Submits `POST /api/categories`.

### REQ-CAT-3: Edit Category Color
- Tapping a category's color swatch opens the 8-color picker.
- On selection, submits `PATCH /api/categories/:id/color`.

### REQ-CAT-4: Delete Category
- A delete action on a category shows a confirmation dialog warning that todos in this category will become uncategorized.
- Confirmed deletion calls `DELETE /api/categories/:id`.

---

## 7. Insights / Analytics

### REQ-INSIGHTS-1: Insights Screen
- A dedicated "Insights" tab/screen fetches data from `GET /api/insights`.

### REQ-INSIGHTS-2: Summary Statistics
Display the following counts in a summary card row:
- Open tasks
- Completed tasks
- Overdue tasks
- Due today
- Due this week
- Current streak (days)
- Average completion time (days)

### REQ-INSIGHTS-3: Completion Charts
- Bar chart: completions per day for the last 30 days.
- Bar chart: completions per week for the last 12 weeks.

### REQ-INSIGHTS-4: Backlog Chart
- Line chart: backlog size per day for the last 30 days.

### REQ-INSIGHTS-5: Completion Histogram
- Horizontal bar chart showing how quickly tasks are completed:
  - Same day
  - 1–3 days
  - 4–7 days
  - 8–30 days
  - 30+ days

### REQ-INSIGHTS-6: Day-of-Week Pattern
- Bar chart showing number of completions per day of the week (Sun–Sat).

### REQ-INSIGHTS-7: Per-Category Breakdown
- A table or list showing, for each category:
  - Total tasks
  - Completed count
  - Overdue count
  - On-time completion rate (%)

---

## 8. Overdue Motivation Banner

### REQ-MOTIVATION-1
- When the todo list contains at least one overdue task, display a banner with a motivational quote (drawn from a static client-side list matching the web app's quotes).
- The banner is dismissible per session (once dismissed it does not reappear until the next app launch).

---

## 9. UI / UX Requirements

### REQ-UX-1: Navigation Structure
```
Bottom Tab Bar
├── To-Dos      (default tab)
│   ├── Todo list with FAB
│   ├── Filter bar (categories, sort, show toggles)
│   └── Create / Edit screens (modal or push)
├── Insights    (analytics screen)
└── Settings
    ├── Categories management
    └── Log out
```

### REQ-UX-2: Color Palette
The 8 category colors must be reproduced as exact RGB values matching the web CSS:

| Index | Name   | Background | Text     |
|-------|--------|------------|----------|
| 0     | Blue   | `#dbeafe`  | `#1d4ed8` |
| 1     | Purple | `#ede9fe`  | `#6d28d9` |
| 2     | Orange | `#ffedd5`  | `#c2410c` |
| 3     | Green  | `#dcfce7`  | `#15803d` |
| 4     | Red    | `#fee2e2`  | `#b91c1c` |
| 5     | Amber  | `#fef3c7`  | `#b45309` |
| 6     | Sky    | `#e0f2fe`  | `#0369a1` |
| 7     | Pink   | `#fce7f3`  | `#be185d` |

### REQ-UX-3: Responsive Layout
- Layouts must adapt to all common iOS and Android screen sizes.
- Support both portrait and landscape orientations.
- Minimum touch target size: 44×44 pt.

### REQ-UX-4: Loading & Error States
- All API calls display a loading indicator while in-flight.
- Network errors or non-2xx responses display a user-friendly error message.
- No silent failures.

### REQ-UX-5: Empty States
- When the todo list is empty (after filters), display a friendly empty-state illustration and message (e.g. "Nothing here — add your first task!").
- When insights have no data, display a placeholder message.

### REQ-UX-6: Accessibility
- All interactive elements have accessibility labels.
- Color is never the sole differentiator (icons or text labels accompany color badges).
- Font sizes must respect system accessibility settings (dynamic type / font scaling).

### REQ-UX-7: Theming
- The app supports light mode by default.
- Dark mode support is a post-MVP stretch goal (not required for v1).

---

## 10. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| REQ-NFR-1 | All API communication over HTTPS only. |
| REQ-NFR-2 | Session cookie stored in a secure, platform-appropriate store (iOS Keychain / Android Keystore backed). |
| REQ-NFR-3 | The app must not log sensitive data (passwords, session tokens) to the console or crash logs. |
| REQ-NFR-4 | Cold launch to interactive list in under 2 seconds on a mid-range 2022 device on WiFi. |
| REQ-NFR-5 | The app must not crash on API errors or empty datasets. |
| REQ-NFR-6 | Targets iOS 16+ and Android 10+ (API level 29+). |
| REQ-NFR-7 | App store ready: complies with Apple App Store and Google Play review guidelines. |

---

## 11. Out of Scope (MVP)

- Push notifications / local reminders for due dates
- Offline mode / local cache with sync
- Dark mode
- Drag-and-drop reordering of todos
- Sharing or collaboration features
- Social login (OAuth)
- In-app account deletion
- iPad-optimized split-view layout
