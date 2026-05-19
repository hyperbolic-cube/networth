# NetWorth

> Private, local-first wealth tracker for iOS and Android.

A finance app for people who want to know their real financial position without handing their data to anyone. No accounts, no cloud sync, no tracking, no ads. Your data stays on your device.

## Why this exists

Most personal finance apps make money by selling user data to advertisers and credit agencies. NetWorth makes money the old-fashioned way — users pay if they find it useful. That's the entire business model.

The product is built for people who'd rather track their wealth themselves than trust a cloud service with their entire financial life.

## Features

- Track stocks, crypto, real estate, vehicles, cash, mortgages, and credit debt in one place
- Monthly snapshots: lock your portfolio value each month, watch it grow over time
- Auto-fill missed months using current prices
- Dashboard with line chart (negative-aware for net debt), allocation donut, breakdown table by asset class
- Multi-currency support with live FX rates
- Free tier: 3 assets, 3 snapshots, full dashboard read access
- Premium tier: unlimited assets/snapshots, edit historical data, CSV export

## Tech stack

- React Native with Expo (SDK 54)
- TypeScript
- expo-sqlite for local storage
- Zustand for state management
- @gorhom/bottom-sheet for input UI
- react-native-gifted-charts for visualization
- NativeWind (Tailwind for React Native) for styling
- React Navigation native-stack for routing
- Jest for unit tests

## Architecture

- 100% local-first: no backend except a stateless price proxy
- Two-state data model:
  - **Today**: live editable state, single source of truth for current portfolio
  - **Locked snapshots**: immutable monthly records, one per calendar month
- Multi-source price resolution:
  - FX rates from Fawazahmed currency API (CDN)
  - Crypto from Binance public API
  - Stocks from a self-hosted Cloudflare Worker proxy (Finnhub backend)
- Cache layer with fresh/stale/unavailable policy
- Time travel infrastructure for dev/testing across calendar boundaries

## Project structure

```
src/
├── api/           # External price/FX fetchers + cache layer
├── components/    # Shared UI components
├── db/            # SQLite schema + CRUD
├── screens/       # Top-level screens (Grid, Today, Dashboard, SnapshotDetail)
├── store/         # Zustand stores
├── types/         # TypeScript types
└── utils/         # Pure helpers (amortization, lock window, asset classification, etc.)
```

## Development

```bash
npm install
npx expo start
```

Then press `i` for iOS simulator or `a` for Android.

For development on a real device:
```bash
eas build --profile development --platform ios
# or
eas build --profile development --platform android
```

## Status

In active development. MVP shipping soon.

See `PROGRESS.md` for detailed phase tracking.

## License

All rights reserved. This source is published for transparency and to demonstrate the local-first architecture. It is not licensed for redistribution or derivative apps.