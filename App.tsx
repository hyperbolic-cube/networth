import "react-native-gesture-handler";
import "./src/global.css";

// ── Navigation deferral note ───────────────────────────────────────────────
//
// Phase 4  — GridScreen only, no navigation library.
// Phase 5b — useState<"grid" | "today"> to switch between Grid and Today;
//             still no router library. Default: "today" if assets exist, else "grid".
// Phase 7  — add @react-navigation/native-stack when Dashboard ↔ history
//             back-navigation actually needs a stack.
// Never add expo-router at any phase.

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase } from "./src/db/schema";
import { getLatestSnapshot } from "./src/db/snapshots";
import { TodayScreen } from "./src/screens/TodayScreen";
import { GridScreen } from "./src/screens/GridScreen";
import { useAssetsStore } from "./src/store/assetsStore";
import { getMissedMonths, autoFillMissedSnapshots } from "./src/utils/autofill";
import { initClock } from "./src/utils/clock";

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<"grid" | "today">("grid");
  const [autoFillProgress, setAutoFillProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await initClock(); // reads persisted mock date → sets _mockDate + Zustand store

        // Detect and fill missed months BEFORE loading the store so that
        // TodayScreen sees updated principals and the correct hint variant
        // on its very first render. Store load happens after auto-fill.
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
        setScreen(hasAssets ? "today" : "grid");
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
            screen === "today" ? (
              <TodayScreen onOpenGrid={() => setScreen("grid")} />
            ) : (
              <GridScreen onOpenToday={() => setScreen("today")} />
            )
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
