import type { NavigatorScreenParams, CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { PaywallReason } from "../utils/entitlement";

/**
 * Navigation shape (Phase 7d):
 *
 *   RootStack (native-stack, headers hidden)
 *   ├─ Tabs            ← bottom-tab navigator (Today / Dashboard / Settings)
 *   ├─ Grid            ← pushed above the tabs ("+ Add" / first-run onboarding)
 *   ├─ SnapshotDetail  ← pushed above the tabs
 *   └─ Paywall         ← modal above the tabs
 *
 * SnapshotDetail/Paywall/Grid live in the RootStack (not the tab navigator) so
 * pushing them covers the tab bar automatically — no display:none hacks.
 */

export type TabParamList = {
  Today: undefined;
  Dashboard: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Grid: undefined;
  SnapshotDetail: { snapshotId: string };
  Paywall: { reason: PaywallReason };
};

// Tab screens can reach both the tab navigator and the parent RootStack, so
// their props compose both. This lets a tab screen navigate("Grid") (root) and
// navigate("Dashboard") (sibling tab) with full type-safety.
export type TodayScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Today">,
  NativeStackScreenProps<RootStackParamList>
>;
export type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Dashboard">,
  NativeStackScreenProps<RootStackParamList>
>;
export type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Settings">,
  NativeStackScreenProps<RootStackParamList>
>;

// Stack-level screens.
export type GridScreenProps           = NativeStackScreenProps<RootStackParamList, "Grid">;
export type SnapshotDetailScreenProps = NativeStackScreenProps<RootStackParamList, "SnapshotDetail">;
export type PaywallScreenProps        = NativeStackScreenProps<RootStackParamList, "Paywall">;
