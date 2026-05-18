import "react-native-gesture-handler";
import "./src/global.css";

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase } from "./src/db/schema";
import { getLatestSnapshot } from "./src/db/snapshots";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { GridScreen } from "./src/screens/GridScreen";
import { SnapshotDetailScreen } from "./src/screens/SnapshotDetailScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { useAssetsStore } from "./src/store/assetsStore";
import { getMissedMonths, autoFillMissedSnapshots } from "./src/utils/autofill";
import { initClock } from "./src/utils/clock";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

type InitialRoute = "Grid" | "Today" | "Dashboard";

export default function App() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<InitialRoute>("Grid");
  const [autoFillProgress, setAutoFillProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await initClock();

        const latest = await getLatestSnapshot();
        const missed = getMissedMonths(latest?.locked_at ?? null);
        if (missed.length > 0) {
          setAutoFillProgress({ current: 0, total: missed.length });
          await autoFillMissedSnapshots(missed, (current, total) => {
            setAutoFillProgress({ current, total });
          });
        }

        await useAssetsStore.getState().load();
        const hasAssets = useAssetsStore.getState().items.length > 0;

        if (!hasAssets) {
          setInitialRoute("Grid");
        } else if (latest === null) {
          setInitialRoute("Today");
        } else {
          setInitialRoute("Dashboard");
        }
      } catch (err) {
        console.error("[App] init failed:", err);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          {ready ? (
            <NavigationContainer>
              <Stack.Navigator
                initialRouteName={initialRoute}
                screenOptions={{ headerShown: false }}
              >
                <Stack.Screen name="Grid" component={GridScreen} />
                <Stack.Screen name="Today" component={TodayScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
                <Stack.Screen name="SnapshotDetail" component={SnapshotDetailScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          ) : (
            <View className="flex-1 bg-background items-center justify-center gap-y-4">
              <Text className="text-textPrimary text-2xl font-bold">
                NetWorth
              </Text>
              <ActivityIndicator color="#8E8E93" />
              {autoFillProgress !== null && (
                <Text style={{ color: "#8E8E93", fontSize: 13 }}>
                  Auto-filling month {autoFillProgress.current + 1} of{" "}
                  {autoFillProgress.total}…
                </Text>
              )}
            </View>
          )}
          <StatusBar style="light" />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
