import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

// ── ErrorBoundary ──────────────────────────────────────────────────────────
//
// Catches render-time JS exceptions in the subtree. Async exceptions in event
// handlers / promises are NOT caught here — those need try/catch at the call
// site. See defensive Alert handling in each *Sheet.tsx for that path.

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          paddingTop: 80,
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 24,
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          Something went wrong
        </Text>
        <Text style={{ color: "#8E8E93", fontSize: 14, marginBottom: 16 }}>
          The app caught an error before crashing. Tap "Try again" to recover.
        </Text>

        <ScrollView
          style={{
            flex: 1,
            backgroundColor: "#1C1C1E",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: "#FF453A",
              fontSize: 13,
              fontWeight: "600",
              marginBottom: 8,
            }}
          >
            {error.name}: {error.message}
          </Text>
          {error.stack && (
            <Text
              style={{
                color: "#8E8E93",
                fontSize: 11,
                fontFamily: "Courier",
              }}
            >
              {error.stack}
            </Text>
          )}
          {errorInfo?.componentStack && (
            <Text
              style={{
                color: "#8E8E93",
                fontSize: 11,
                fontFamily: "Courier",
                marginTop: 12,
              }}
            >
              {errorInfo.componentStack}
            </Text>
          )}
        </ScrollView>

        <Pressable
          onPress={this.handleReset}
          style={{
            backgroundColor: "#0A84FF",
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
}
