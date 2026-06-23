import YahooFinanceCtor from "yahoo-finance2";

/**
 * Two upstream quirks worked around here:
 *
 * 1. Despite the package's own README/types suggesting the default export is
 *    a ready-to-use client, at runtime (v3) it's the `YahooFinance` *class* —
 *    calling `yahooFinance.quote(...)` directly throws "Call `new
 *    YahooFinance()` first." It must be instantiated.
 * 2. The bundled types declare `quote`/`search` with an explicit `this`
 *    parameter on overloaded function properties, which TypeScript can't
 *    resolve when called as `yahooFinance.quote(...)` — every call site
 *    collapses to `never`. Re-typing the two methods we use with a minimal,
 *    accurate signature sidesteps it without losing the real runtime behavior.
 */

export type YahooQuote = {
  symbol: string;
  regularMarketPrice?: number;
  longName?: string;
  shortName?: string;
};

/** `symbol` is typed as required upstream but is genuinely absent on some
 *  result rows (e.g. non-equity entries) — callers must guard for it. */
export type YahooSearchQuote = { symbol?: string; shortname?: string; longname?: string };

type YahooFinanceClient = {
  /** Resolves to `undefined` (not a rejection) for an unrecognized symbol. */
  quote(symbol: string): Promise<YahooQuote | undefined>;
  quote(symbols: string[]): Promise<YahooQuote[]>;
  search(
    query: string,
    options?: { quotesCount?: number },
  ): Promise<{ quotes: YahooSearchQuote[] }>;
};

const Ctor = YahooFinanceCtor as unknown as new (opts?: {
  suppressNotices?: string[];
}) => YahooFinanceClient;

const yahooFinance = new Ctor({ suppressNotices: ["yahooSurvey"] });

export default yahooFinance;
