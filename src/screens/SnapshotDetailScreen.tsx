import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Caption, Display } from "../components/Typography";
import type { SnapshotDetailScreenProps } from "../types/navigation";
import { tapLight } from "../utils/haptics";

// Phase 7b.3 stub. Real content (snapshot_items list, totals, edit flow)
// lands in Phase 7c. Tested today only as a routing target from the
// breakdown table and as the host for the Edit-paywall alert.

const ACCENT = "#0A84FF";
const NEGATIVE = "#FF453A";
const TEXT_SECONDARY = "#8E8E93";
const SURFACE = "#1C1C1E";
const HORIZONTAL_PADDING = 24;

export function SnapshotDetailScreen({ route, navigation }: SnapshotDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { snapshotId } = route.params;

  return (
    <View className="flex-1 bg-background">
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => {
            tapLight();
            navigation.goBack();
          }}
          hitSlop={12}
        >
          <Text style={{ color: ACCENT, fontSize: 16, fontWeight: "500" }}>
            ← Dashboard
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            tapLight();
            Alert.alert(
              "Coming soon",
              "Editing locked snapshots is part of the Paid tier — Phase 9."
            );
          }}
          hitSlop={12}
        >
          <Text style={{ color: ACCENT, fontSize: 16, fontWeight: "500" }}>
            Edit
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Display>Snapshot Detail</Display>
        <Caption className="mt-2">Phase 7c builds out this screen.</Caption>

        <View
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: NEGATIVE + "33",
          }}
        >
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Stub — received snapshotId
          </Text>
          <Body style={{ fontFamily: "Courier" }}>{snapshotId}</Body>
        </View>
      </ScrollView>
    </View>
  );
}
