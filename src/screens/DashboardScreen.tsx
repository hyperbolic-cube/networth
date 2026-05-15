import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Display } from "../components/Typography";
import type { RootStackParamList } from "../types/navigation";

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 12 }}>
      <View className="px-6 pb-4">
        <Display>Dashboard</Display>
      </View>
      <View className="flex-1 items-center justify-center gap-y-4 px-6">
        <Body className="text-textSecondary text-center">
          Dashboard — coming in Phase 7b
        </Body>
        <Pressable onPress={() => navigation.navigate("Today")}>
          <Body className="text-accent">Back to Today</Body>
        </Pressable>
      </View>
    </View>
  );
}
