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

  useEffect(() => {
    const trimmed = ticker.trim();
    const qty = parseFloat(quantity);

    if (!trimmed || !(qty > 0)) {
      setState({ kind: "idle" });
      return;
    }

    setState({ kind: "loading" });
    const myReqId = ++reqIdRef.current;

    const timer = setTimeout(async () => {
      let result: ApiResult<number>;
      try {
        result =
          mode === "crypto"
            ? await getCryptoPrice(trimmed)
            : await getStockPrice(trimmed);
      } catch {
        if (reqIdRef.current !== myReqId) return;
        setState({ kind: "offline" });
        return;
      }

      if (reqIdRef.current !== myReqId) return;

      if (result.status === "fresh" || result.status === "stale") {
        setState({
          kind: "success",
          price: result.value,
          total: result.value * qty,
          status: result.status,
          fetchedAt: result.fetchedAt,
        });
      } else {
        // unavailable
        setState(
          result.reason === "not_found" ? { kind: "not_found" } : { kind: "offline" }
        );
      }
    }, 400);

    return () => {
      clearTimeout(timer);
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
