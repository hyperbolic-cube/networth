import { Text, type TextProps } from "react-native";

// ── Typography primitives ──────────────────────────────────────────────────
//
// Three variants ship in Phase 4. Additional variants (Heading, Mono) are
// deferred until a screen actually needs them.
//
// className overrides are appended after the defaults so they always win.

/** Large bold heading — hero numbers, sheet titles. */
export function Display({ className, ...props }: TextProps) {
  return (
    <Text
      className={`text-4xl font-bold text-textPrimary ${className ?? ""}`}
      {...props}
    />
  );
}

/** Standard body text. */
export function Body({ className, ...props }: TextProps) {
  return (
    <Text
      className={`text-base text-textPrimary ${className ?? ""}`}
      {...props}
    />
  );
}

/** Small secondary / hint text. */
export function Caption({ className, ...props }: TextProps) {
  return (
    <Text
      className={`text-sm text-textSecondary ${className ?? ""}`}
      {...props}
    />
  );
}
