import type { OpenRouterContext } from "@/lib/holdings-report";

export type SummaryResult = {
  headline: string;
  macro_summary: string;
  portfolio_summary: string;
  watch: string;
  movers: { ticker: string; reason: string }[];
};

// The leading `~` is load-bearing, not a typo: OpenRouter namespaces its alias
// slugs under `~`, and this one always resolves to the newest model in the
// DeepSeek V4 Flash family. Without it every call fails with HTTP 400
// "deepseek/deepseek-v4-flash-latest is not a valid model ID".
const MODEL = "~deepseek/deepseek-v4-flash-latest";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Budgets are `attempts × timeout`, and the product must stay under the cron's
// matching per-stage ceiling in api/cron/daily (90s summary, 45s classify).
// That ordering is the point: this signal actually cancels the request, so it
// has to fire before the cron's withTimeout, which can only abandon the work
// and let it keep burning the function's 300s.
//
// Both calls have a heavy tail — this model's provider pool is fast at the
// median and occasionally hangs outright (classification measured 1s/5s/6s/12s
// and once past 40s; summaries 8s/25s/41s/63s on identical input, since
// `:online` fans out to a web search before the model even starts). No ceiling
// makes that go away, so the two calls are shaped around what a failure costs
// instead.
//
// A failed summary is the day's summary gone — the caller in api/cron/daily
// counts it as a failure — and at 63s observed, the 90s stage barely covers one
// attempt. So it gets the whole budget in a single shot; its retry is the
// cron's second daily invocation. A failed classification is nearly free: the
// cron catches it without blocking the summary, and the rows stay NULL for the
// next run to pick up. So classification spends its smaller budget on two
// shorter attempts, which is the better bet against a hang.
const SUMMARY_TIMEOUT_MS = 80_000;
const SUMMARY_ATTEMPTS = 1;
const CLASSIFY_TIMEOUT_MS = 20_000;
const CLASSIFY_ATTEMPTS = 2;

// Output ceilings. Generous relative to the JSON we actually want (~800 tokens
// for a summary, ~1.4k for a full classification batch) because DeepSeek V4 is
// a reasoning model and OpenRouter counts reasoning tokens against this budget
// — too low and reasoning eats the cap, returning empty content that surfaces
// only as an unhelpful "no JSON object" parse failure.
const SUMMARY_MAX_TOKENS = 32_000;
const CLASSIFY_MAX_TOKENS = 8_000;

// Both calls pin their output with a strict JSON schema rather than the looser
// `response_format: { type: "json_object" }`. Object mode only guarantees *an*
// object — asked for a shape by example, this model will happily invent the
// key (it once returned `{" [{": [...]}`, echoing the prompt's literal
// template back as the key). A schema removes the guesswork, and every
// provider sampled honoured it without narrowing routing.
const SUMMARY_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "portfolio_summary",
    strict: true,
    schema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        macro_summary: { type: "string" },
        portfolio_summary: { type: "string" },
        watch: { type: "string" },
        movers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              reason: { type: "string" },
            },
            required: ["ticker", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "headline",
        "macro_summary",
        "portfolio_summary",
        "watch",
        "movers",
      ],
      additionalProperties: false,
    },
  },
} as const;

const CLASSIFY_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "sector_classifications",
    strict: true,
    schema: {
      type: "object",
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              sector: { type: "string" },
            },
            required: ["ticker", "sector"],
            additionalProperties: false,
          },
        },
      },
      required: ["classifications"],
      additionalProperties: false,
    },
  },
} as const;

type ChatCompletion = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string; code?: number };
};

/** Statuses where a second attempt has a real chance of landing. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

/** Marks an error the retry loop should reattempt rather than surface. */
class TransientError extends Error {}

/**
 * Decide whether a thrown error is worth another attempt.
 *
 * A cancelled request (`AbortSignal.timeout` rejects with a `TimeoutError`
 * DOMException) and a dropped connection (`TypeError` from fetch) are the two
 * shapes the observed hangs take. Everything else — a bad model slug, a bad
 * key, a routing preference nothing satisfies — fails the same way twice, so
 * retrying only burns budget that the caller may need.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof TransientError) return true;
  const name = (error as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" || name === "TypeError";
}

/** One attempt. Throws TransientError for failures worth reattempting. */
async function attemptCompletion(
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://houndstooth.app",
      "X-Title": "Houndstooth",
    },
    body: JSON.stringify({
      ...body,
      // Keep the de-identified context off providers that retain prompts. The
      // sanitizer upstream already strips balances and share counts; this is
      // the second half of that promise.
      provider: { data_collection: "deny" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = `OpenRouter ${response.status}: ${detail.slice(0, 300) || response.statusText}`;
    throw RETRYABLE_STATUS.has(response.status)
      ? new TransientError(message)
      : new Error(message);
  }

  const json = (await response.json()) as ChatCompletion;
  // Routing failures — including "no provider satisfies your preferences",
  // which data_collection: "deny" can produce — come back 200 with an error
  // body rather than a status code.
  if (json.error) {
    throw new Error(`OpenRouter error: ${json.error.message ?? "unknown"}`);
  }
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * A non-streaming chat completion against OpenRouter's OpenAI-compatible
 * endpoint, reattempted up to `attempts` times on a transient failure.
 *
 * Deliberately a bare fetch rather than an SDK: the SDKs retry on their own
 * schedule, which silently multiplies `timeoutMs` past the budget it was sized
 * against. Here the ceiling is per attempt and the attempt count is explicit,
 * so the worst case stays arithmetic.
 */
async function chatCompletion(
  body: Record<string, unknown>,
  { timeoutMs, attempts }: { timeoutMs: number; attempts: number },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await attemptCompletion(body, apiKey, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransient(error)) throw error;
      // No backoff: these failures are a hung or unlucky provider, not rate
      // pressure, and OpenRouter routes the retry somewhere else anyway.
    }
  }
  throw lastError;
}

const SYSTEM_INSTRUCTION = `You are a markets analyst writing a concise daily briefing about one investor's portfolio.

You receive ONLY de-identified data: sector weights (%), per-ticker daily % moves, and the taxable/tax-advantaged split (%). You never receive — and must never ask for or infer — dollar balances, share counts, or position values.

Use web search to ground today's actual market context (interest rates, macro data, sector and single-stock news).

HARD RULES:
1. Descriptive, NOT advisory. Explain what happened and what to watch. Never give investment advice or buy/sell/hold recommendations, and never tell the user what to do with their holdings.
2. Be specific and factual — cite real drivers (rate moves, CPI/jobs prints, earnings, sector news). Don't fabricate.
3. If moves are negligible or data is sparse, say it was a quiet/flat day rather than inventing drama.
4. Return ONLY a single valid JSON object, no markdown, no code fences.`;

function buildPrompt(ctx: OpenRouterContext): string {
  return [
    `Date: ${ctx.date}`,
    `Tax split: taxable ${ctx.taxSplitPct.taxable}%, tax-advantaged ${ctx.taxSplitPct.taxAdvantaged}%`,
    `Sector weights: ${ctx.sectorWeights
      .map((s) => `${s.sector} ${s.weightPct}%`)
      .join(", ")}`,
    `Holdings (ticker / sector / day %): ${ctx.holdings
      .map((h) => `${h.ticker} / ${h.sector ?? "?"} / ${h.changePct ?? "n/a"}`)
      .join("; ")}`,
    `Notable movers: ${
      ctx.movers
        .map((m) => `${m.ticker} ${m.changePct > 0 ? "+" : ""}${m.changePct}%`)
        .join(", ") || "none"
    }`,
    "",
    "Return JSON with exactly these keys:",
    "{",
    '  "headline": one line <=100 chars capturing the day,',
    '  "macro_summary": 2-3 sentences on the broad market/macro today,',
    '  "portfolio_summary": 2-3 sentences tying this portfolio\'s sector exposure and movers to the macro drivers,',
    '  "watch": 1-2 sentences on upcoming catalysts to watch,',
    '  "movers": [{ "ticker": string, "reason": short (<=140 char) reason for the move tied to macro/sector news }]',
    "}",
  ].join("\n");
}

/** Extract a JSON object from a model response that may include stray text. */
function parseJsonObject(text: string): SummaryResult {
  let s = text.trim();
  // Strip ```json ... ``` fences if present.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response contained no JSON object");
  }
  const parsed = JSON.parse(s.slice(start, end + 1));
  return {
    headline: String(parsed.headline ?? ""),
    macro_summary: String(parsed.macro_summary ?? ""),
    portfolio_summary: String(parsed.portfolio_summary ?? ""),
    watch: String(parsed.watch ?? ""),
    movers: Array.isArray(parsed.movers)
      ? parsed.movers.map((m: { ticker?: string; reason?: string }) => ({
          ticker: String(m.ticker ?? ""),
          reason: String(m.reason ?? ""),
        }))
      : [],
  };
}

export async function generateSummary(
  ctx: OpenRouterContext,
): Promise<{ result: SummaryResult; model: string }> {
  const text = await chatCompletion(
    {
      model: `${MODEL}:online`, // :online enables web search plugin
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: buildPrompt(ctx) },
      ],
      response_format: SUMMARY_SCHEMA,
      max_tokens: SUMMARY_MAX_TOKENS,
    },
    { timeoutMs: SUMMARY_TIMEOUT_MS, attempts: SUMMARY_ATTEMPTS },
  );

  return { result: parseJsonObject(text), model: MODEL };
}

// ---------------------------------------------------------------------------
// Sector classification — one-time enrichment of securities that SnapTrade
// leaves without a sector. Privacy-safe by construction: only tickers and
// security names are sent, never values, quantities, or account data.
// ---------------------------------------------------------------------------

export const SECTOR_ALLOWLIST = [
  "Information Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Communication Services",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Broad ETF",
  "Sector ETF",
  "Bond ETF",
  "International ETF",
  "Commodity ETF",
  "Crypto",
  "Money Market",
  "Other",
] as const;

/** Match a model-returned sector against the allowlist, or null to discard. */
export function matchSector(sector: string): string | null {
  const trimmed = sector.trim();
  const exact = SECTOR_ALLOWLIST.find((s) => s === trimmed);
  if (exact) return exact;
  const ci = SECTOR_ALLOWLIST.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  return ci ?? null;
}

const CLASSIFY_SYSTEM_INSTRUCTION = `You classify securities into sectors. Return ONLY a JSON object, no markdown, no code fences.`;

function buildClassifyPrompt(
  items: { ticker: string; name: string | null }[],
): string {
  return [
    `Classify each security into exactly one sector from this list: ${SECTOR_ALLOWLIST.join(", ")}.`,
    "For ETFs and mutual funds use the ETF labels (Broad ETF, Sector ETF, Bond ETF, International ETF, Commodity ETF), not the sector of the underlying holdings.",
    'Use "Other" only when nothing else fits.',
    "",
    "Securities:",
    ...items.map((i) => `${i.ticker} — ${i.name ?? "(no name)"}`),
    "",
    "Respond with a JSON object having a single key named classifications,",
    "whose value is an array of objects each having a ticker string and a",
    "sector string.",
  ].join("\n");
}

/**
 * Pull the classification list out of a model response.
 *
 * The schema pins this to `{ classifications: [...] }`, so that's the first
 * thing we look for. The two fallbacks are cheap insurance against a provider
 * that quietly ignores the schema: take any single array-valued property
 * whatever it's named, then scan for a bare `[`…`]`.
 */
export function parseClassifications(
  text: string,
): { ticker: string; sector: string }[] {
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  const toRows = (parsed: unknown) =>
    Array.isArray(parsed)
      ? parsed.map((m: { ticker?: string; sector?: string }) => ({
          ticker: String(m.ticker ?? ""),
          sector: String(m.sector ?? ""),
        }))
      : [];

  const objStart = s.indexOf("{");
  const objEnd = s.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(s.slice(objStart, objEnd + 1));
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.classifications)) {
          return toRows(parsed.classifications);
        }
        const arrays = Object.values(parsed).filter(Array.isArray);
        if (arrays.length === 1) return toRows(arrays[0]);
      }
    } catch {
      // Fall through to the bare-array scan below.
    }
  }

  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Model response contained no classifications");
  }
  return toRows(JSON.parse(s.slice(start, end + 1)));
}

/**
 * Classify tickers into sectors. Returns a map of UPPERCASED ticker →
 * allowlisted sector; tickers with invalid or missing classifications are
 * simply absent (left NULL by the caller and retried on a later run).
 */
export async function classifySectors(
  items: { ticker: string; name: string | null }[],
): Promise<Map<string, string>> {
  // No web search needed here: it's a static ticker → sector mapping.
  const text = await chatCompletion(
    {
      model: MODEL,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_INSTRUCTION },
        { role: "user", content: buildClassifyPrompt(items) },
      ],
      response_format: CLASSIFY_SCHEMA,
      max_tokens: CLASSIFY_MAX_TOKENS,
    },
    { timeoutMs: CLASSIFY_TIMEOUT_MS, attempts: CLASSIFY_ATTEMPTS },
  );

  const results = parseClassifications(text);
  const byTicker = new Map<string, string>();
  for (const r of results) {
    const sector = matchSector(r.sector);
    if (r.ticker && sector) byTicker.set(r.ticker.toUpperCase(), sector);
  }
  return byTicker;
}
