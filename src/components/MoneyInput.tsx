import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { tapLight } from "../utils/haptics";

// ── MoneyInput ─────────────────────────────────────────────────────────────
//
// Renders BottomSheetTextInput (not plain RN TextInput) for correct keyboard
// handling inside @gorhom/bottom-sheet sheets.

interface MoneyInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  keyboardType?: "decimal-pad" | "numeric";
}

/**
 * Large bold text input for monetary amounts.
 * Always renders BottomSheetTextInput — must be used inside a BottomSheetModal.
 * Fires tapLight() on every character change.
 */
export function MoneyInput({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  keyboardType = "decimal-pad",
}: MoneyInputProps) {
  return (
    <BottomSheetTextInput
      value={value}
      onChangeText={(t) => {
        // Layer B safety net: any throw from the parent's setter or from
        // haptics must not escape into an unhandled exception (Hermes will
        // SIGABRT). tapLight is already .catch'd, but defend in depth.
        try {
          tapLight();
        } catch (err) {
          console.error("[MoneyInput] tapLight threw:", err);
        }
        try {
          onChangeText(t);
        } catch (err) {
          console.error("[MoneyInput] onChangeText threw:", err);
        }
      }}
      placeholder={placeholder}
      placeholderTextColor="#8E8E93"
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      style={{
        fontSize: 28,
        fontWeight: "700",
        color: "#FFFFFF",
        backgroundColor: "#2C2C2E",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        textAlign: "right",
      }}
    />
  );
}
