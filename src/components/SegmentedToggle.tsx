import { Pressable, Text, View } from "react-native";
import { tapLight } from "../utils/haptics";

// ── SegmentedToggle ────────────────────────────────────────────────────────

interface Segment {
  label: string;
  value: string;
}

interface SegmentedToggleProps {
  options: readonly Segment[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Horizontal segmented control.
 * Selected segment gets bg-surfaceElevated + bold text; others are muted.
 * Fires tapLight() on selection change.
 */
export function SegmentedToggle({
  options,
  value,
  onChange,
}: SegmentedToggleProps) {
  return (
    <View className="flex-row bg-surface rounded-xl p-1">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!selected) {
                tapLight();
                onChange(opt.value);
              }
            }}
            className={`flex-1 rounded-lg py-2 items-center justify-center ${
              selected ? "bg-surfaceElevated" : ""
            }`}
          >
            <Text
              className={
                selected
                  ? "text-textPrimary font-bold text-sm"
                  : "text-textSecondary text-sm"
              }
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
