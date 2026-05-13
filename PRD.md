> ⚠️ **Partially superseded.** External API choices (sections 2 and 7) and any tech stack pins have been updated. For current decisions, see DECISIONS.md. In conflicts between PRD.md and DECISIONS.md, DECISIONS.md wins.
>
> **Section 5 was substantially rewritten on 2026-05-12** to reflect the Today + Locked Snapshots data model pivot. The original "review and lock on the 1st" framing is gone. The 2026-05-12 entry "MAJOR PIVOT" in DECISIONS.md is the authoritative source.
>
> **Section 8 was added on 2026-05-13** with the final monetization tier design. The 2026-05-13 entry "Monetization model: hybrid limits" in DECISIONS.md is the authoritative source.

# Product Requirements Document (PRD) — "NetWorth: The Local-First Wealth Tracker"

## 1. Project Context & Constraints

Target Platforms: iOS & Android (cross-platform).

Tech Stack: React Native with Expo (Managed Workflow), TypeScript, Zustand (state), expo-sqlite (local database), NativeWind (Tailwind for React Native) for UI, expo-haptics for tactile feedback.

Core Philosophy: 100% Local-First. Zero user data leaves the device. No backend (except a stateless stock-price proxy that sees only tickers, never user data), no user accounts, no cloud synchronization.

App Store Review Safety: Because the app collects no personal data and requires no account-deletion features, it will pass App Store / Google Play privacy reviews effortlessly. Do not add any SDKs that track user data (no Firebase Analytics, etc.).

Target Market: USA primary, KZ secondary (dogfooding by developer). UX, currency display, and pricing tuned for US-first.

## 2. Architectural Rules & Data Flow

Implicit Base Currency: The core calculation logic operates in USD by default. We do not ask the user for this during onboarding to reduce friction.

Cross-Currency Handling: When a user enters an asset in a local currency (e.g., KZT), the app fetches the current exchange rate via a public, anonymous API directly from the device. **See DECISIONS.md for current FX provider** — PRD must not be used as the source for endpoints.

Ticker Pricing: For stocks the app fetches current prices via our own Cloudflare Worker proxy. For crypto the app fetches via Binance's public API. **See DECISIONS.md for current endpoints** — PRD must not be used as the source.

Two-State Data Model:
- **Today**: editable live state of `assets_liabilities`. No calendar date. Always available.
- **Locked monthly snapshots**: immutable point-in-time records in `snapshots` + `snapshot_items`. One per calendar month. `locked_at` is canonical first-of-month timestamp.

Immutability: Locked snapshots are immutable in free tier. Paid users can edit any snapshot. Auto-fill of missed months uses current prices marked `is_auto_filled = 1`.

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

**`user_settings`** — single-row key-value store. Originally created for edit credits (Phase 5b.1), now general-purpose for future settings.

## 4. UI / UX Design System

Theme: Dark Mode only. Deep blacks (#000000), dark grays (#1C1C1E) for cards. High contrast text.

Typography: System native fonts (San Francisco on iOS, Roboto on Android). Large, bold, clean numbers.

Interactions: Heavy use of Bottom Sheets (`@gorhom/bottom-sheet`) instead of full-screen navigations for inputs.

Tactile Feedback: Trigger `expo-haptics` (`ImpactFeedbackStyle.Light`) on every numeric keyboard tap and (`ImpactFeedbackStyle.Medium`) on locking a snapshot.

## 5. Core User Journey Map (CJM) & Implementation Specs

The product has **four primary surfaces**: Grid (asset creation), Today (live state), Lock Window (monthly snapshot), and Dashboard (historical analysis + breakdown table).

### Episode 1 — Portfolio Wiring

**Screen: The Grid** ("What do you own and owe?")

- Show a visually appealing grid of large preset tiles with emojis/icons.
- Tiles: 🏦 Bank Accounts, 📈 Broker Accounts, ₿ Crypto, 🏘️ Real Estate, 🚘 Vehicles, 💵 Cash, 🏠 Mortgage, 💳 Credit Debt.
- Tapping a tile opens a Bottom Sheet tailored to that asset type.

**Type-specific input logic (bottom sheets):**

- **Broker Accounts**: toggle Stock/Bond → ticker input → quantity input. Live price preview.
- **Crypto**: same as Broker but in crypto mode (routes to Binance).
- **Bank / Cash / Vehicle**: a single numeric input for "Total Balance" or "Current Value".
- **Real Estate**: "Area (sq.m)" + "Current Market Price per sq.m".
- **Liabilities**: three fields — Current Principal, Annual Interest Rate (%), Monthly Payment.

Adding/editing/deleting an asset on the Grid modifies `assets_liabilities` directly.

**Free tier limit:** Maximum 3 assets total. Attempting to add a 4th triggers the paywall (see Section 8).

### Episode 2 — Today

**Screen: Today** — the primary daily-use surface.

- Renders all assets/liabilities from `assets_liabilities` with computed current values.
- Sticky footer: **Assets total, Liabilities total, Net Worth**.
- User can tap any row to edit it. Changes persist immediately to `assets_liabilities`.
- "+ Add" navigates back to Grid.

**Behavior between locks:**
- Cash/Bank/Real Estate/Liability values are "as of last edit".
- Broker/Crypto/FX values are **live** (refreshed via API, cache TTL applies).
- Liabilities show static principal in Today view (no mid-month amortization preview).

### Episode 3 — Lock Window

**Trigger:** when user opens app on day 1–5 of a calendar month (local time), AND no snapshot for current month exists, Today screen surfaces "Lock {Month} Snapshot" button.

**Free tier limit:** Maximum 3 snapshots total. After 3, lock action triggers paywall.

**On Lock:**
1. Validate all asset prices resolved (or manually overridden).
2. Write new snapshot row with `locked_at` = canonical first-of-month, `is_auto_filled = 0`.
3. Write snapshot_items rows capturing each asset's value at this instant.
4. Apply amortization to all liabilities: update `assets_liabilities.metadata.principal` to post-amortization value.

**Outside lock window:** Lock button hidden. Adaptive hint shown based on state (already locked, missed and auto-filled, first-time user, etc.).

### Episode 4 — Auto-fill missed months

**Trigger:** when user opens app and one or more full calendar months elapsed since last snapshot.

**Logic:**
1. For each missed month in chronological order, create snapshot with `is_auto_filled = 1`.
2. Bank/Cash/Real Estate/Vehicle: copy values from previous snapshot.
3. Broker/Crypto: use **current** live prices.
4. FX: use **current** rates.
5. Liabilities: apply one cycle of amortization.
6. After all missed months processed: update `assets_liabilities.metadata.principal` cumulatively.

**Auto-fill counts toward the 3-snapshot free limit.** If user opens app after 5 months of inactivity with 0 prior snapshots, auto-fill creates none (no baseline). If user had 1 prior snapshot and 5 missed months: auto-fill creates 2 more (capped at 3 total in free tier; remaining 3 require paid).

### Episode 5 — Dashboard

**Screen: Dashboard** — the historical analysis surface.

Read-only for free users. Available after first snapshot exists.

- **Hero**: Most recent snapshot net worth + delta vs previous snapshot.
- **Line chart**: Net worth over time. X = months, Y = USD (supports negative). Auto-filled points styled distinctly (dashed segments / lighter dots) from user-locked points.
- **Donut allocation**: Current Today allocation by asset class.
- **Breakdown table** (NEW — mirrors user's existing Google Sheets workflow):
  - Columns: Date | Stocks | Crypto | Cash | Real Estate | Vehicles | Debt
  - Each row is one snapshot, aggregated by asset class.
  - Liabilities (Debt) shown as negative.
- **History list**: tap any row to view snapshot detail. Edit button visible but routes to paywall after 3 free edits.
- **Export CSV** (paid feature): downloads the breakdown table in CSV format for use in Sheets/Excel.

## 6. AI Agent Execution Order

1. Initialize Expo app with TypeScript and NativeWind. ✅
2. Set up local SQLite database with all tables and migration pattern. ✅
3. Implement Asset Creation Grid and Bottom Sheets. ✅
4. Implement API utility functions. ✅
5. Implement Today screen + edit-via-numpad. ✅ (Phase 5b)
6. Implement lock-window detection + Lock Snapshot button + post-lock amortization. ✅ (Phase 5b)
7. Implement auto-fill for missed months. (Phase 5b.4 — in progress)
8. Implement Auto-Amortization math + unit tests. (Phase 6)
9. Implement Dashboard UI with charts + breakdown table + history list. (Phase 7)
10. Implement paywall + IAP gating with RevenueCat. (Phase 9 — before polish)
11. Polish (icons, splash, error boundaries, beta testing). (Phase 8)
12. Submit to App Store / Google Play. (Phase 10)

## 7. External APIs

See DECISIONS.md for current endpoints and contracts. Summary:
- FX: Fawazahmed0 Currency API (CDN-hosted, free)
- Crypto: Binance public API (USDT pairs)
- Stocks: Cloudflare Worker proxy → Finnhub /quote (US-listed tickers only in MVP)

## 8. Monetization Tiers

**Free Tier:**
- 3 assets maximum (any combination of types)
- 3 snapshots maximum
- Today screen: full functionality
- Auto-fill missed months: included
- Dashboard: read-only access to existing snapshots, including line chart, donut, breakdown table, history list

**Paid Tier ($4.99/mo or $29.99/yr — final pricing TBD before Phase 9):**
- Unlimited assets
- Unlimited snapshots
- Edit any locked snapshot
- Export CSV/PDF of breakdown table
- Future: historical accuracy, multiple portfolios, custom asset types

**Paywall triggers:**
1. Add 4th asset → paywall
2. Lock 4th snapshot → paywall
3. Edit any locked snapshot → paywall
4. Export CSV → paywall

**Pricing model:**
- Auto-renewable monthly subscription
- Annual subscription at ~50% discount
- No free trial in MVP (revisit post-launch based on conversion data)
- Restore purchases supported (Apple requirement)

**IAP infrastructure:**
- RevenueCat library for cross-platform IAP
- Sandbox testing required before release
- Settings screen with current subscription status + manage subscription link
