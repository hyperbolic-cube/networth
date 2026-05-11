import { Pressable, Text, View } from "react-native";
import { tapLight } from "../utils/haptics";

// ── Tile ───────────────────────────────────────────────────────────────────

interface TileProps {
  /** Unicode emoji displayed prominently at the top of the tile. */
  emoji: string;
  /** Short label displayed below the emoji. */
  label: string;
  onPress: () => void;
}

/**
 * Pressable square-ish grid tile used on GridScreen.
 * Fires a light haptic before calling onPress.
 */
export function Tile({ emoji, label, onPress }: TileProps) {
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className="bg-surface rounded-2xl p-4 items-center justify-center aspect-square"
    >
      <Text className="text-4xl mb-2">{emoji}</Text>
      <Text className="text-textPrimary text-sm font-semibold text-center">
        {label}
      </Text>
    </Pressable>
  );
}
