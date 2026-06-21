import type { DataProvider } from "./types";
import { SnapTradeProvider } from "./snaptrade/adapter";
import { MockProvider } from "./mock/adapter";

/**
 * Select the active data provider. SnapTrade by default; the Mock provider when
 * `DATA_PROVIDER=mock` (offline tests / no credentials).
 */
export function getProvider(): DataProvider {
  if (process.env.DATA_PROVIDER === "mock") return new MockProvider();
  return new SnapTradeProvider();
}

export * from "./types";
