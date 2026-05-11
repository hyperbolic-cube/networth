import * as Haptics from "expo-haptics";

// ── Haptic feedback utilities ──────────────────────────────────────────────
//
// All calls are fire-and-forget (void returns) and wrapped in try/catch
// because haptics throw on devices/simulators that don't support them.

/** Light impact — every numeric keypress, tile tap, segment change. */
export function tapLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium impact — reserved for Phase 5 snapshot actions. */
export function tapMedium(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success notification — reserved for Phase 5 snapshot lock. */
export function notifySuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {}
  );
}
