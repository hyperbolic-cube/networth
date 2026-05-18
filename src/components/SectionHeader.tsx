import { Text, View } from "react-native";

const TEXT_SECONDARY = "#8E8E93";
const HORIZONTAL_PADDING = 24;

export function SectionHeader({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 12 }}>
      <Text
        style={{
          color: TEXT_SECONDARY,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
    </View>
  );
}
