> ⚠️ **Partially superseded.** External API choices (sections 2 and 7) and any tech stack pins have been updated. For current decisions, see DECISIONS.md. In conflicts between PRD.md and DECISIONS.md, DECISIONS.md wins. This file remains the source of truth for product behavior, UX flows, and database schema — those have not changed.

Product Requirements Document (PRD) for AI Agent: "NetWorth: The Local-First Wealth Tracker"

1. Project Context & Constraints

Target Platforms: iOS & Android (Cross-platform). 

Tech Stack: React Native with Expo (Managed Workflow), TypeScript, Zustand (State), expo-sqlite (Local Database), NativeWind (Tailwind for React Native) for UI, expo-haptics for tactile feedback.

Core Philosophy: 100% Local-First. Zero user data leaves the device. No backend, no user accounts, no cloud synchronization.

App Store Review Safety: Because the app collects no personal data and requires no account deletion features, it will pass App Store/Google Play privacy reviews effortlessly. Do not add any SDKs that track user data (no Firebase Analytics, etc.).

2. Architectural Rules & Data Flow

Implicit Base Currency: The core calculation logic operates in USD by default. We do not ask the user for this during onboarding to reduce friction.

Cross-Currency Handling: When a user enters an asset in a local currency (e.g., KZT), the app fetches the current exchange rate via a public, anonymous API (e.g., Yahoo Finance API or Frankfurter) directly from the device.

Ticker Pricing: For stocks/crypto, the app fetches current market prices anonymously via public APIs (e.g., Yahoo Finance API).

Immutability: A "Snapshot" is a point-in-time calculation. Once locked, it generates an immutable record in the database. Future price changes do not affect historical snapshots.

3. Database Schema (SQLite)
AI Agent must implement the following local schema:

Table: Assets_Liabilities (The containers)
id (UUID)
type (Enum: BANK, BROKER, REAL_ESTATE, VEHICLE, CASH, MORTGAGE, CREDIT_DEBT, AUTO_LOAN)
name (String, e.g., "Kaspi Bank", "Tesla Shares")
currency (String, e.g., "USD", "KZT")
metadata (JSON string for type-specific data. E.g., {"ticker": "TSLA", "quantity": 150}, or {"sqm": 100, "price_per_sqm": 1500}, or {"interest_rate": 12, "monthly_payment": 500})
created_at (Timestamp)

Table: Snapshots (The historical records)id (UUID)total_net_worth_usd (Float)
locked_at (Timestamp)

Table: Snapshot_Items (The values locked at that specific time)
id (UUID)snapshot_id (UUID, Foreign Key)
asset_liability_id (UUID, Foreign Key)value_in_original_currency (Float)
exchange_rate_to_usd (Float)
calculated_value_usd (Float)

4. UI / UX Design System (World-Class Standard)

Theme: Default to Dark Mode. Deep blacks (#000000), dark grays (#1C1C1E) for cards. High contrast text.

Typography: System native fonts (San Francisco on iOS, Roboto on Android). Large, bold, clean numbers.

Interactions: Heavy use of Bottom Sheets (@gorhom/bottom-sheet) instead of full-screen navigations for inputs.

Tactile Feedback: Trigger expo-haptics (ImpactFeedbackStyle.Light) on every numeric keyboard tap and (ImpactFeedbackStyle.Medium) on locking a snapshot.

5. Core User Journey Map (CJM) & Implementation Specs
Episode 1: Portfolio Wiring (No Onboarding Questions)Screen: The Grid ("What do you own and owe?")

Do not ask for base currency. Show a visually appealing grid of large preset tiles with emojis/icons.
Tiles: 🏦 Bank Accounts, 📈 Broker Accounts, ₿ Crypto, 🏘️ Real Estate, 🚘 Vehicles, 💵 Cash, 🏠 Mortgage, 💳 Credit Debt.
Interaction: Tapping a tile opens a Bottom Sheet tailored to that specific asset type.
Type-Specific Input Logic (Bottom Sheets):
Broker Accounts:UI: Toggle [Stock / Bond] -> Text input for "Ticker" -> Number input for "Quantity".
Logic: Save ticker and quantity to metadata. App fetches current price asynchronously to show a preview.
Bank Accounts / Cash:
UI: Number input for "Total Balance (including deposits, cards, bonuses)".
Real Estate:
UI: Number input for "Area (sq.m)" and "Current Market Price per sq.m".
Logic: Value = $Area \times PricePerSqm$.

Liabilities (Mortgage / Loans) - Crucial for UX:

UI: Ask for only 3 fields: Current Principal (Total owed right now), Annual Interest Rate (%), Monthly Payment.
Logic: Save these to metadata.

Episode 2: The Commit (Creating a Snapshot)

Screen: Draft View. A vertical list of all created assets with their dynamically calculated current values (Stocks fetch live price, Real Estate multiplies sqm by price).

Action: User reviews the list. They can tap any item to adjust numbers via a quick numpad.

Finalizing: At the bottom, a sticky footer shows: Total Assets - Total Liabilities = Net Worth.

The Lock: A large button "Review & Lock Snapshot". Pressing it writes all current calculated values to the Snapshots and Snapshot_Items tables.

Episode 3: The N+1 Iteration (The Monthly Ritual)

Trigger: User opens the app on the 1st of the next month.
The Magic Draft: The app generates a new Draft View based on the last locked snapshot.
Auto-Amortization Logic: For liabilities (Mortgage), the app MUST automatically calculate the new principal before showing the draft.
Formula applied behind the scenes:$$Principal_{new} = Principal_{old} - \left(Payment - Principal_{old} \times \frac{Rate}{12 \times 100}\right)$$
The UI shows the new reduced debt automatically.
Ghost Values: When tapping an asset to update it, the Numpad shows the previous month's value as a ghost placeholder (placeholderTextColor).
User updates only what changed (e.g., adds 500 to cash, changes real estate price per sqm if the market moved), and clicks "Lock Snapshot".

6. Dashboards & AnalyticsOnce a snapshot is locked, the default home screen becomes the Dashboard.

Hero Section: Large Net Worth number. Below it, the Delta (+$X / +Y%) compared to the previous snapshot.
Chart: A clean line chart (react-native-gifted-charts) showing Net Worth over time. X-axis: Dates. Y-axis: USD values.
Allocation: A simple donut chart showing Asset vs. Liability ratio, and breakdown by category (e.g., 50% Real Estate, 30% Broker, 20% Cash).

7. AI Agent Execution Steps

Initialize Expo app with TypeScript and NativeWind.

Set up local SQLite database using expo-sqlite and create schemas.

Implement the Asset Creation Grid and Type-Specific Bottom Sheets.

Implement API utility functions (anonymous fetch calls to Yahoo Finance / Currency APIs).

Build the Draft View and the Snapshot Locking mechanism.

Implement the Auto-Amortization math logic for liabilities.

Build the Dashboard UI with charts.

Ensure absolute zero network requests to non-public endpoints. Prepare build for local testing.