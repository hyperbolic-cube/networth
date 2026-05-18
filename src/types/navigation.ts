import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Grid: undefined;
  Today: undefined;
  Dashboard: undefined;
  SnapshotDetail: { snapshotId: string };
};

export type GridScreenProps           = NativeStackScreenProps<RootStackParamList, "Grid">;
export type TodayScreenProps          = NativeStackScreenProps<RootStackParamList, "Today">;
export type DashboardScreenProps      = NativeStackScreenProps<RootStackParamList, "Dashboard">;
export type SnapshotDetailScreenProps = NativeStackScreenProps<RootStackParamList, "SnapshotDetail">;
