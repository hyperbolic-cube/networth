import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Grid: undefined;
  Today: undefined;
  Dashboard: undefined;
};

export type GridScreenProps     = NativeStackScreenProps<RootStackParamList, "Grid">;
export type TodayScreenProps    = NativeStackScreenProps<RootStackParamList, "Today">;
export type DashboardScreenProps = NativeStackScreenProps<RootStackParamList, "Dashboard">;
