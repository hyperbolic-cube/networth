import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PaywallReason } from "../utils/entitlement";

export type RootStackParamList = {
  Grid: undefined;
  Today: undefined;
  Dashboard: undefined;
  SnapshotDetail: { snapshotId: string };
  Paywall: { reason: PaywallReason };
};

export type GridScreenProps           = NativeStackScreenProps<RootStackParamList, "Grid">;
export type TodayScreenProps          = NativeStackScreenProps<RootStackParamList, "Today">;
export type DashboardScreenProps      = NativeStackScreenProps<RootStackParamList, "Dashboard">;
export type SnapshotDetailScreenProps = NativeStackScreenProps<RootStackParamList, "SnapshotDetail">;
export type PaywallScreenProps        = NativeStackScreenProps<RootStackParamList, "Paywall">;
