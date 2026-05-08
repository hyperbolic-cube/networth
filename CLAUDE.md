# NetWorth Project Rules

## Read First
- Full spec: see PRD.md
- Current progress: see PROGRESS.md (update after every completed task)
- Architecture decisions: see DECISIONS.md (append when deviating from PRD or pinning versions)

## Hard Constraints (NEVER violate)
- Local-first only. No backend, no analytics SDKs, no Firebase, no Sentry, no auth.
- Only public anonymous APIs allowed: Frankfurter (FX), Yahoo Finance (tickers).
- All user data stays in expo-sqlite. Never write to AsyncStorage for financial data.
- Base currency is USD, implicit. Never prompt user for base currency.
- Snapshots are immutable once locked. Never mutate Snapshot_Items rows.

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

## Workflow
- Before starting any task, read PROGRESS.md to find current step.
- After finishing a task, update PROGRESS.md with [x] and a one-line note.
- If you need to deviate from PRD.md, append the reason to DECISIONS.md and ask me first.
- Never install a package without listing it and waiting for approval.