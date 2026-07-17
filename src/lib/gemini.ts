import { GoogleGenAI } from "@google/genai";
import type { GeminiContext } from "@/lib/holdings-report";

export type SummaryResult = {
  headline: string;
  macro_summary: string;
  portfolio_summary: string;
  watch: string;
  movers: { ticker: string; reason: string }[];
};

const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `You are a markets analyst writing a concise daily briefing about one investor's portfolio.

You receive ONLY de-identified data: sector weights (%), per-ticker daily % moves, and the taxable/tax-advantaged split (%). You never receive — and must never ask for or infer — dollar balances, share counts, or position values.

Use Google Search to ground today's actual market context (interest rates, macro data, sector and single-stock news).

HARD RULES:
1. Descriptive, NOT advisory. Explain what happened and what to watch. Never give investment advice or buy/sell/hold recommendations, and never tell the user what to do with their holdings.
2. Be specific and factual — cite real drivers (rate moves, CPI/jobs prints, earnings, sector news). Don't fabricate.
3. If moves are negligible or data is sparse, say it was a quiet/flat day rather than inventing drama.
4. Return ONLY a single valid JSON object, no markdown, no code fences.`;

function buildPrompt(ctx: GeminiContext): string {
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
    throw new Error("Gemini response contained no JSON object");
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
  ctx: GeminiContext,
): Promise<{ result: SummaryResult; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(ctx),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
      temperature: 0.4,
    },
  });

  const text = response.text ?? "";
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

const CLASSIFY_SYSTEM_INSTRUCTION = `You classify securities into sectors. Return ONLY a JSON array, no markdown, no code fences.`;

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
    'Return a JSON array: [{"ticker": string, "sector": string}]',
  ].join("\n");
}

/** Extract a JSON array from a model response that may include stray text. */
function parseJsonArray(text: string): { ticker: string; sector: string }[] {
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Gemini response contained no JSON array");
  }
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(parsed)) return [];
  return parsed.map((m: { ticker?: string; sector?: string }) => ({
    ticker: String(m.ticker ?? ""),
    sector: String(m.sector ?? ""),
  }));
}

/**
 * Classify tickers into sectors. Returns a map of UPPERCASED ticker →
 * allowlisted sector; tickers with invalid or missing classifications are
 * simply absent (left NULL by the caller and retried on a later run).
 */
export async function classifySectors(
  items: { ticker: string; name: string | null }[],
): Promise<Map<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  // No search grounding here: it conflicts with JSON output mode and isn't
  // needed for a static ticker → sector mapping.
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildClassifyPrompt(items),
    config: {
      systemInstruction: CLASSIFY_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const results = parseJsonArray(response.text ?? "");
  const byTicker = new Map<string, string>();
  for (const r of results) {
    const sector = matchSector(r.sector);
    if (r.ticker && sector) byTicker.set(r.ticker.toUpperCase(), sector);
  }
  return byTicker;
}
