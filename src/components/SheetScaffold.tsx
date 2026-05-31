import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { forwardRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Display } from "./Typography";

// ── SheetScaffold ──────────────────────────────────────────────────────────

interface SheetScaffoldProps {
  /** Header title rendered in Display size. */
  title: string;
  /** Optional emoji shown before the title. */
  emoji?: string;
  children: React.ReactNode;
  /** Called when the primary action button is pressed. */
  onSubmit: () => void;
  /** Label for the primary action button. Defaults to "Save". */
  submitLabel?: string;
  /** When true the primary button is visually disabled and non-interactive. */
  submitDisabled?: boolean;
}

/**
 * Consistent bottom-sheet chrome for all asset/liability input sheets.
 * Full-height snap point so the inner ScrollView has room to scroll the Save
 * button into view when the keyboard is up (with keyboardBehavior="interactive"
 * the sheet itself shifts above the keyboard, but content shorter than the
 * remaining space can otherwise clip the bottom button).
 */
export const SheetScaffold = forwardRef<BottomSheetModal, SheetScaffoldProps>(
  function SheetScaffold(
    {
      title,
      emoji,
      children,
      onSubmit,
      submitLabel = "Save",
      submitDisabled = false,
    },
    ref
  ) {
    const insets = useSafeAreaInsets();

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={["100%"]}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: "#1C1C1E" }}
        handleIndicatorStyle={{ backgroundColor: "#8E8E93" }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header — insets.top reserves space for status bar now that the
              sheet snaps to full height. */}
          <View style={{ paddingTop: insets.top }} className="px-6 pb-6">
            {emoji ? (
              <Display className="mb-1">
                {emoji} {title}
              </Display>
            ) : (
              <Display className="mb-1">{title}</Display>
            )}
          </View>

          {/* Sheet-specific fields */}
          <View className="px-6 gap-y-4">{children}</View>

          {/* Primary action button */}
          <View className="px-6 mt-8">
            <Pressable
              onPress={submitDisabled ? undefined : onSubmit}
              className={`bg-accent rounded-xl py-4 items-center ${
                submitDisabled ? "opacity-40" : ""
              }`}
            >
              <Text className="text-white font-bold text-base">
                {submitLabel}
              </Text>
            </Pressable>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
