> ⚠️ **Partially superseded.** External API choices (sections 2 and 7) and any tech stack pins have been updated. For current decisions, see DECISIONS.md. In conflicts between PRD.md and DECISIONS.md, DECISIONS.md wins.
>
> **Section 5 was substantially rewritten on 2026-05-12** to reflect the Today + Locked Snapshots data model pivot. The original "review and lock on the 1st" framing is gone. The 2026-05-12 entry "MAJOR PIVOT" in DECISIONS.md is the authoritative source on this change; this PRD reflects the post-pivot product.

# Product Requirements Document (PRD) — "NetWorth: The Local-First Wealth Tracker"

## 1. Project Context & Constraints

Target Platforms: iOS & Android (cross-platform).

Tech Stack: React Native with Expo (Managed Workflow), TypeScript, Zustand (state), expo-sqlite (local database), NativeWind (Tailwind for React Native) for UI, expo-haptics for tactile feedback.

Core Philosophy: 100% Local-First. Zero user data leaves the device. No backend (except a stateless stock-price proxy that sees only tickers, never user data), no user accounts, no cloud synchronization.

App Store Review Safety: Because the app collects no personal data and requires no account-deletion features, it will pass App Store / Google Play privacy reviews effortlessly. Do not add any SDKs that track user data (no Firebase Analytics, etc.).

## 2. Architectural Rules & Data Flow

Implicit Base Currency: The core calculation logic operates in USD by default. We do not ask the user for this during onboarding to reduce friction.

Cross-Currency Handling: When a user enters an asset in a local currency (e.g., KZT), the app fetches the current exchange rate via a public, anonymous API directly from the device. **See DECISIONS.md for current FX provider** — PRD must not be used as the source for endpoints.

Ticker Pricing: For stocks the app fetches current prices via our own Cloudflare Worker proxy. For crypto the app fetches via Binance's public API. **See DECISIONS.md for current endpoints** — PRD must not be used as the source.

Two-State Data Model:
- **Today**: editable live state of `assets_liabilities`. No calendar date. Always available.
- **Locked monthly snapshots**: immutable point-in-time records in `snapshots` + `snapshot_items`. One per calendar month. `locked_at` is canonical first-of-month timestamp.

Immutability: Locked snapshots are immutable to free users for the first 3 edits, after which edits become a paid feature. Auto-fill of missed months uses current prices marked `is_auto_filled = 1`.

## 3. Database Schema (SQLite)

Tables (all created/migrated by `initDatabase()`):

**`assets_liabilities`** — the user's "Today" portfolio.

- `id` (UUID, TEXT PK)
- `type` (TEXT, enum: `BANK`, `BROKER`, `REAL_ESTATE`, `VEHICLE`, `CASH`, `MORTGAGE`, `CREDIT_DEBT`, `AUTO_LOAN`)
- `name` (TEXT)
- `currency` (TEXT, e.g., "USD", "KZT")
- `metadata` (TEXT — JSON string for type-specific data. Examples: `{"ticker":"TSLA","quantity":150,"instrumentType":"STOCK"}`, `{"sqm":100,"price_per_sqm":1500}`, `{"principal":50000,"interest_rate":12,"monthly_payment":500}`)
- `created_at` (TEXT, ISO timestamp)

**`snapshots`** — historical monthly records.

- `id` (UUID, TEXT PK)
- `total_net_worth_usd` (REAL)
- `locked_at` (TEXT, ISO timestamp — canonical first-of-month, e.g. `2026-05-01T00:00:00Z`)
- `is_auto_filled` (INTEGER, 0 or 1 — was this snapshot machine-created because the user missed the lock window?)

**`snapshot_items`** — the line items captured in each snapshot.

- `id` (UUID, TEXT PK)
- `snapshot_id` (UUID, FK → `snapshots.id`)
- `asset_liability_id` (UUID, FK → `assets_liabilities.id`)
- `value_in_original_currency` (REAL)
- `exchange_rate_to_usd` (REAL, 1 for broker)
- `calculated_value_usd` (REAL — positive for assets, negative for liabilities)

**`api_cache`** — see DECISIONS.md.

**`user_settings`** — single-row key-value store.

- `key` (TEXT PK)
- `value` (TEXT, stringified — first row: `('edits_remaining', '3')`)

## 4. UI / UX Design System

Theme: Dark Mode only. Deep blacks (#000000), dark grays (#1C1C1E) for cards. High contrast text.

Typography: System native fonts (San Francisco on iOS, Roboto on Android). Large, bold, clean numbers.

Interactions: Heavy use of Bottom Sheets (`@gorhom/bottom-sheet`) instead of full-screen navigations for inputs.

Tactile Feedback: Trigger `expo-haptics` (`ImpactFeedbackStyle.Light`) on every numeric keyboard tap and (`ImpactFeedbackStyle.Medium`) on locking a snapshot.

## 5. Core User Journey Map (CJM) & Implementation Specs

The product has **three primary surfaces**: Grid (asset creation), Today (live state), and Lock Window (monthly snapshot). Plus a Dashboard (Phase 7).

### Episode 1 — Portfolio Wiring (one-time, but ongoing)

**Screen: The Grid** ("What do you own and owe?")

- Do not ask for base currency. Show a visually appealing grid of large preset tiles with emojis/icons.
- Tiles: 🏦 Bank Accounts, 📈 Broker Accounts, ₿ Crypto, 🏘️ Real Estate, 🚘 Vehicles, 💵 Cash, 🏠 Mortgage, 💳 Credit Debt.
- Tapping a tile opens a Bottom Sheet tailored to that asset type.

**Type-specific input logic (bottom sheets):**

- **Broker Accounts**: toggle Stock/Bond → ticker input → quantity input. The app fetches the current price asynchronously and shows a preview.
- **Crypto**: same as Broker but in crypto mode (routes to Binance, ticker is symbol e.g. "BTC").
- **Bank / Cash / Vehicle**: a single numeric input for "Total Balance" or "Current Value".
- **Real Estate**: "Area (sq.m)" + "Current Market Price per sq.m". Value = Area × PricePerSqm.
- **Liabilities (Mortgage / Credit Debt)**: three fields — Current Principal, Annual Interest Rate (%), Monthly Payment.

Adding/editing/deleting an asset on the Grid modifies `assets_liabilities` directly. **There is no "draft" intermediate state** — your portfolio shape is always the live `assets_liabilities` table.

### Episode 2 — Today (every day the user opens the app, including the 1st)

**Screen: Today** — the primary daily-use surface.

- Renders all assets/liabilities from `assets_liabilities` with computed current values:
  - Stocks/crypto: live prices via API
  - Real Estate: `sqm × price_per_sqm` × FX
  - Bank/Cash/Vehicle: `amount` × FX
  - Liabilities: `principal` × FX, shown as negative
- Sticky footer: **Assets total, Liabilities total, Net Worth (Today)**.
- User can tap any row to edit it (changes go to `assets_liabilities` immediately, persistently). User can also tap a "+ Add" button to return to the Grid and create more assets.
- This is the user's everyday view. They open the app, see their current net worth, optionally tweak (e.g., "Today I added $500 to savings"), and close the app. No locking required.

**Behavior between locks:**
- Cash/Bank/Real Estate/Liability values are "as of last edit" — they don't change unless the user edits them.
- Broker/Crypto/FX values are **live** — they reflect current market prices on every Today view open. (Cache TTL applies; see DECISIONS.md.)
- Liabilities show static principal in Today view. **No mid-month cosmetic amortization preview** — amortization only fires when a new locked snapshot is created.

### Episode 3 — Lock Window (days 1–5 of each month)

**Trigger:** when the user opens the app on day 1–5 of a calendar month (local time), AND no snapshot for the current month exists yet, the Today screen surfaces a prominent **"Lock {Month} Snapshot"** button.

**On Lock:**
1. Validate all asset prices are resolved (or manually overridden — see error states).
2. Write a new row to `snapshots` with `locked_at = first-of-current-month`, `is_auto_filled = 0`, `total_net_worth_usd` from the computed total.
3. Write one `snapshot_items` row per asset_liability, capturing `value_in_original_currency`, `exchange_rate_to_usd`, and `calculated_value_usd` at this instant.
4. Apply amortization to all MORTGAGE / CREDIT_DEBT / AUTO_LOAN items: write the post-amortization principal back into `assets_liabilities.metadata.principal` (this is the new "Today" principal going forward). The snapshot captures the **pre-amortization** principal as the value-of-record for that month.

Wait — clarification on amortization timing:

**The snapshot's `value_in_original_currency` for a liability is the principal AT THE MOMENT of lock** (i.e., what the user owed at the start of that month). Then, AFTER writing the snapshot, the app updates `assets_liabilities.metadata.principal` to the post-amortization value, so the next month's Today view starts from the correctly-decremented principal.

The amortization formula (PRD spec, unchanged):

`Principal_new = Principal_old − (MonthlyPayment − Principal_old × (Rate / 12 / 100))`

Clamped to `Math.max(0, result)` to handle final payments.

**Outside the lock window (days 6–end of month):** Lock button is hidden. Show a small hint: "Next lock window: {first of next month}."

### Episode 4 — Auto-fill missed months

**Trigger:** when the user opens the app and detects that one or more full calendar months have elapsed since the last snapshot (or since `app_first_open` if there's no snapshot yet).

**Logic:**
1. For each missed month, in chronological order:
   - Create a `snapshot` row with `locked_at = first-of-that-month`, `is_auto_filled = 1`.
   - For Bank/Cash/Real Estate/Vehicle: copy `value_in_original_currency` from the immediately-previous snapshot.
   - For Broker/Crypto: use **current** live prices (current market price × current quantity).
   - For FX rates: use **current** rates from the API.
   - For Liabilities: apply one cycle of amortization to the previous snapshot's principal.
2. After auto-fill, also update `assets_liabilities.metadata.principal` for liabilities to reflect the cumulative amortization across all missed months.
3. **The current month's snapshot is NOT auto-filled** — if today is within days 1–5, the Lock button is shown; if today is days 6+, lock for current month is missed and will be auto-filled at the next app open after it closes (i.e., the next month).

**Auto-fill on chart (Phase 7):** snapshots with `is_auto_filled = 1` are rendered with a visually distinct marker (dashed line, lighter dot, or similar). Tooltip on tap: "Auto-filled — values estimated from {creation date}; not historical."

### Episode 5 — Editing locked snapshots (free: 3 credits; then paid)

**Trigger:** user taps "Edit" on a locked snapshot row (in the Dashboard's history view).

**Free tier (Phase 9+):**
- Check `user_settings.edits_remaining`. If `> 0`: enter edit mode.
- Edit mode is a screen similar to Today, but scoped to that month's snapshot. User can change any field, add new assets to that snapshot, delete assets from that snapshot.
- On "Save", a single transaction overwrites the snapshot_items, recomputes `total_net_worth_usd`, and decrements `edits_remaining` by 1.
- If `edits_remaining === 0`: show paywall ("Unlock unlimited edits — $X / mo").

**Paid tier:** edits unlimited; same flow without credit check.

### Ghost Values (Phase 6)

When the user taps any field in the lock-window edit flow OR in subsequent month locks, the numpad shows the previous snapshot's value for that field as a faded placeholder (`placeholderTextColor`). The user types over it to set the new value.

Per-type ghost rules (deferred derivations in DECISIONS.md):
- BANK, CASH, VEHICLE: previous snapshot's `value_in_original_currency`
- MORTGAGE, CREDIT_DEBT, AUTO_LOAN: previous snapshot's `value_in_original_currency` (principal)
- REAL_ESTATE: `previous_value / current_sqm` (impure but acceptable for MVP)
- BROKER (quantity or price field): no ghost (snapshot stores price × qty, not separately)

## 6. Dashboards & Analytics (Phase 7)

Once at least one snapshot exists, a new home screen tab becomes available:

- **Hero Section**: Large Net Worth number for the most recent snapshot. Below it, the Delta vs. the previous snapshot (+$X, +Y%).
- **Chart**: A clean line chart (`react-native-gifted-charts`) showing Net Worth over time. X-axis = months; Y-axis = USD. Auto-filled snapshots rendered as dashed segments / lighter dots.
- **Allocation**: A donut chart of asset breakdown (e.g., 50% Real Estate, 30% Broker, 20% Cash).
- **History list**: scrollable list of all snapshots, oldest to newest, each tappable to view detail or "Edit" (if `edits_remaining > 0` or paid).
- **Today vs. Last Snapshot**: a card comparing live Today net worth to the last locked snapshot — gives users a sense of intra-month change.

## 7. AI Agent Execution Order (revised)

1. Initialize Expo app with TypeScript and NativeWind. ✅
2. Set up local SQLite database with all tables (incl. `user_settings`) and migration pattern. ✅
3. Implement Asset Creation Grid and type-specific Bottom Sheets. ✅
4. Implement API utility functions (anonymous fetch calls to current FX/crypto/stock endpoints per DECISIONS.md). ✅
5. Implement Today screen + edit-via-numpad. (Phase 5b — replaces original Draft View.)
6. Implement lock-window detection + Lock Snapshot button + post-lock amortization. (Phase 5b.)
7. Implement auto-fill for missed months. (Phase 5b.)
8. Implement Auto-Amortization math + unit tests. (Phase 6.)
9. Implement Dashboard UI with charts + history list + edit flow. (Phase 7.)
10. Implement paywall + edit-credit gating. (Phase 9.)
11. Ensure absolute zero network requests to non-public endpoints. Prepare build for local testing.
