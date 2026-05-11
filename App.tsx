import "react-native-gesture-handler";
import "./src/global.css";

// ── Navigation deferral note ───────────────────────────────────────────────
//
// Phase 4 — GridScreen only, no navigation library.
// Phase 5 — useState<"grid" | "draft"> to switch between Grid and Draft;
//            still no router library.
// Phase 7 — add @react-navigation/native-stack when Dashboard ↔ history
//            back-navigation actually needs a stack.
// Never add expo-router at any phase.

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase } from "./src/db/schema";
import { GridScreen } from "./src/screens/GridScreen";
import { useAssetsStore } from "./src/store/assetsStore";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await useAssetsStore.getState().load();
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
            <GridScreen />
          ) : (
            <View className="flex-1 bg-background items-center justify-center gap-y-4">
              <Text className="text-textPrimary text-2xl font-bold">
                NetWorth
              </Text>
              <ActivityIndicator color="#8E8E93" />
            </View>
          )}
          <StatusBar style="light" />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
