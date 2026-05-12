# NetWorth Project Rules

## Read First
- Full spec: see PRD.md
- Current progress: see PROGRESS.md (update after every completed task)
- Architecture decisions: see DECISIONS.md (append when deviating from PRD or pinning versions)

## Hard Constraints (NEVER violate)
- Local-first only. No backend (except our own stock price proxy), no analytics SDKs, no Firebase, no Sentry, no auth.
- External APIs are pinned in DECISIONS.md. Never hardcode endpoints from PRD.md — that section is outdated and superseded by DECISIONS.md. If in doubt, DECISIONS.md wins.
- All user data stays in expo-sqlite. Never write to AsyncStorage for financial data.
- Base currency is USD, implicit. Never prompt user for base currency.

## Data Model: Today vs Locked Snapshots (CRITICAL — read carefully)

The app has **two distinct concepts of "current state"**:

1. **"Today"** — the editable live state of the user's portfolio. Lives in `assets_liabilities` table. Updated whenever the user adds/edits/deletes an asset. Rendered with live broker prices and live FX rates. Has NO calendar date — it's "right now". Not a snapshot.

2. **Locked monthly snapshots** — point-in-time historical records in `snapshots` + `snapshot_items` tables. Created via explicit user action OR auto-fill (see below). Each snapshot's `locked_at` is the canonical first-of-month timestamp (e.g. `2026-05-01T00:00:00Z`), regardless of when in the lock window the user actually locked.

**Locked snapshots are immutable in the free tier.** Free users get **3 global edit credits** (counter in `user_settings`) to modify any locked snapshot. After 3, edits become a paid feature. Editing a snapshot lets the user change any/all fields and add/delete assets within that snapshot's scope; one full session of edits = one credit.

**Never mutate `snapshot_items` rows directly except through the dedicated edit flow** that decrements `edits_remaining`.

## Lock Window Rules

- Lock button is visible/active **only on days 1–5 of any calendar month** (local time, `today.getDate() <= 5`).
- Days 6–31 (or 28/29/30): Today view is still editable, but Lock button is hidden. Show next lock window date as hint.
- If a user opens the app and finds previous months were missed (e.g. last snapshot was March, today is May 10), the app **auto-fills** those missing months with current data (prices, FX) + amortized liabilities, marking each `snapshots.is_auto_filled = 1`. UI shows these on the chart with a visually distinct marker (e.g. dashed line / lighter dot).

## Tech Stack (do not substitute)
- Expo managed workflow + TypeScript
- Zustand for state (not Redux, not Context)
- expo-sqlite (not WatermelonDB, not Realm)
- NativeWind for styling (not StyleSheet, not styled-components)
- @gorhom/bottom-sheet for input modals
- react-native-gifted-charts for charts
- expo-haptics on every numeric input + snapshot lock

## Code Conventions
- All DB access goes through /src/db/*.ts. No raw SQL in components.
- All API calls go through /src/api/*.ts with try/catch + offline fallback.
- Money values stored as numbers in original currency + exchange rate; never pre-converted.
- UUIDs via expo-crypto's randomUUID().
- DB migrations live in /src/db/schema.ts using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (or equivalent guard). Migrations run on every `initDatabase()` call — must be idempotent.

## Workflow
- Before starting any task, read PROGRESS.md to find current step.
- After finishing a task, update PROGRESS.md with [x] and a one-line note.
- If you need to deviate from PRD.md, append the reason to DECISIONS.md and ask me first.
- Never install a package without listing it and waiting for approval.

## Git workflow
- Always commit on `main` for this project (no feature branches).
- Never create a new branch without explicit instruction from the user.
- If `main` has uncommitted changes that would be lost or polluted, STOP and ask the user how to proceed — do not silently work around by creating a branch.
