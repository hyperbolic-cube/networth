import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { getCryptoPrice, getStockPrice } from "../api";
import type { ApiResult } from "../types";
import { Body, Caption } from "./Typography";

// ── PricePreview ───────────────────────────────────────────────────────────

interface PricePreviewProps {
  ticker: string;
  quantity: string;
  mode: "stock" | "crypto";
}

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; price: number; total: number; status: "fresh" | "stale"; fetchedAt: number }
  | { kind: "not_found" }
  | { kind: "offline" };

/** Format a number as a dollar amount with up to 2 decimal places. */
function formatMoney(n: number): string {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Format a date from a ms epoch timestamp. */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Display-only live price preview for broker/crypto input sheets.
 * Debounces 400 ms on ticker + quantity changes before fetching.
 * Cancels stale async results when inputs change.
 */
export function PricePreview({ ticker, quantity, mode }: PricePreviewProps) {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });
  // Incremented on each new fetch so stale callbacks can self-cancel.
  const reqIdRef = useRef(0);
  // Tracks mount status so async callbacks don't setState on an unmounted tree.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Wrap the entire effect body so any sync throw (parseFloat misuse,
    // state-shape mismatch, etc.) cannot become an unhandled exception.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const trimmed = ticker.trim();
      const qty = parseFloat(quantity);

      if (!trimmed || !Number.isFinite(qty) || !(qty > 0)) {
        if (isMountedRef.current) setState({ kind: "idle" });
        return;
      }

      if (isMountedRef.current) setState({ kind: "loading" });
      const myReqId = ++reqIdRef.current;

      // setTimeout takes a sync callback that schedules an inner async runner.
      // The inner runner's body is fully wrapped so its returned promise can
      // never reject — Hermes treats unhandled rejections as fatal.
      const run = async () => {
        try {
          let result: ApiResult<number>;
          try {
            result =
              mode === "crypto"
                ? await getCryptoPrice(trimmed)
                : await getStockPrice(trimmed);
          } catch (err) {
            console.error("[PricePreview] price fetch threw:", err);
            if (
              isMountedRef.current &&
              reqIdRef.current === myReqId
            ) {
              setState({ kind: "offline" });
            }
            return;
          }

          if (!isMountedRef.current || reqIdRef.current !== myReqId) return;

          if (result.status === "fresh" || result.status === "stale") {
            const price = result.value;
            const total = price * qty;
            // Defensive: if the cached value was corrupt and decoded to a
            // non-number, fall back to offline rather than rendering NaN.
            if (
              typeof price !== "number" ||
              !Number.isFinite(price) ||
              !Number.isFinite(total)
            ) {
              setState({ kind: "offline" });
              return;
            }
            setState({
              kind: "success",
              price,
              total,
              status: result.status,
              fetchedAt: result.fetchedAt,
            });
          } else {
            // unavailable
            setState(
              result.reason === "not_found"
                ? { kind: "not_found" }
                : { kind: "offline" }
            );
          }
        } catch (err) {
          console.error("[PricePreview] post-fetch handler threw:", err);
          if (isMountedRef.current && reqIdRef.current === myReqId) {
            setState({ kind: "offline" });
          }
        }
      };

      timer = setTimeout(() => {
        // Fire-and-forget. `run` swallows its own errors so the dangling
        // promise can never become unhandled.
        void run();
      }, 400);
    } catch (err) {
      console.error("[PricePreview] effect body threw:", err);
    }

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      // Cancel any in-flight fetch result from the previous effect run.
      reqIdRef.current++;
    };
  }, [ticker, quantity, mode]);

  if (state.kind === "idle") return null;

  if (state.kind === "loading") {
    return (
      <View className="mt-2">
        <Caption>Fetching price…</Caption>
      </View>
    );
  }

  if (state.kind === "success") {
    return (
      <View className="mt-2 gap-y-1">
        <Body>
          {formatMoney(state.price)} × {quantity} ={" "}
          <Body className="font-bold text-positive">{formatMoney(state.total)}</Body>
        </Body>
        {state.status === "stale" && (
          <Caption>· last known, as of {formatDate(state.fetchedAt)}</Caption>
        )}
      </View>
    );
  }

  if (state.kind === "not_found") {
    return (
      <View className="mt-2">
        <Caption className="text-negative">
          {mode === "stock"
            ? "Symbol not found. Currently supports US-listed tickers only."
            : "Symbol not found."}
        </Caption>
      </View>
    );
  }

  // offline
  return (
    <View className="mt-2">
      <Caption className="text-negative">
        Price unavailable — check your connection.
      </Caption>
    </View>
  );
}
