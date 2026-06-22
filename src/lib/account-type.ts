/**
 * Display-only formatting for an account's "Type" column.
 *
 * SnapTrade's `subtype` (raw_type) is free-form and inconsistently cased
 * ("Roth IRA", "investmentAccount", "401k"), while `type` (account_category)
 * is a coarse machine label ("investment", "deposit", "loc"). This maps the two
 * into a clean, human label: a specific account kind when we recognize it,
 * otherwise a broad category. Never mutates stored data.
 */

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Exact subtype → canonical display label. Keys are normalized (lower, trimmed). */
const SPECIFIC_LABELS: Record<string, string> = {
  // Retirement
  "401a": "401(a)",
  "401k": "401(k)",
  "traditional 401k": "Traditional 401(k)",
  "roth 401k": "Roth 401(k)",
  "403b": "403(b)",
  "457b": "457(b)",
  ira: "IRA",
  roth: "Roth IRA",
  "roth ira": "Roth IRA",
  "roth contributory ira": "Roth IRA",
  "traditional ira": "Traditional IRA",
  "rollover ira": "Rollover IRA",
  "sep ira": "SEP IRA",
  sep: "SEP IRA",
  "simple ira": "SIMPLE IRA",
  sarsep: "SARSEP",
  pension: "Pension",
  "profit sharing plan": "Profit sharing",
  keogh: "Keogh",
  tsp: "TSP",
  "thrift savings plan": "TSP",
  // Health / education
  hsa: "HSA",
  hra: "HRA",
  "health reimbursement arrangement": "HRA",
  "529": "529 Plan",
  "education savings account": "529 Plan",
  // Taxable brokerage
  individual: "Individual",
  joint: "Joint",
  "joint taxable": "Joint",
  brokerage: "Brokerage",
  "community property": "Brokerage",
  "mutual fund": "Mutual fund",
  // Cash
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  // Debt
  "credit card": "Credit card",
  credit: "Credit card",
  heloc: "HELOC",
  loan: "Loan",
  mortgage: "Mortgage",
  // Crypto
  crypto: "Digital asset",
  "digital asset": "Digital asset",
};

/**
 * Keyword → canonical label for free-form labels that don't match exactly
 * (e.g. "Roth Contributory IRA", "Traditional 401k Plan"). Scanned in order, so
 * more specific tokens (roth ira, 401k) come before broad ones (ira).
 */
const KEYWORD_LABELS: [keyword: string, label: string][] = [
  ["roth ira", "Roth IRA"],
  ["roth 401k", "Roth 401(k)"],
  ["roth", "Roth IRA"],
  ["rollover", "Rollover IRA"],
  ["sep", "SEP IRA"],
  ["simple", "SIMPLE IRA"],
  ["401k", "401(k)"],
  ["403b", "403(b)"],
  ["457b", "457(b)"],
  ["ira", "IRA"],
  ["hsa", "HSA"],
  ["529", "529 Plan"],
  ["pension", "Pension"],
  ["tsp", "TSP"],
  ["credit card", "Credit card"],
  ["heloc", "HELOC"],
  ["mortgage", "Mortgage"],
];

/** Coarse `type` (account_category) → broad category label. */
const CATEGORY_LABELS: Record<string, string> = {
  investment: "Investments",
  deposit: "Cash",
  loc: "Line of credit",
  credit: "Credit card",
  loan: "Loan",
  crypto: "Digital asset",
};

/** True when `keyword` appears in `text` as a whole token (boundary-delimited). */
function hasWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text);
}

/** Title-case a free-form label as a last resort ("joint taxable" → "Joint Taxable"). */
function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Format an account's type/subtype into a clean display label: a specific kind
 * when recognized (401(k), Roth IRA, HSA, Brokerage…), else a broad category
 * (Investments, Cash, Credit card…), else a title-cased fallback or "—".
 */
export function formatAccountType(
  type: string | null | undefined,
  subtype: string | null | undefined,
  name?: string | null | undefined,
): string {
  const sub = normalize(subtype);
  // Some brokerages (e.g. Schwab via SnapTrade) report a generic placeholder
  // subtype and put the real signal in the account name — skip the exact match
  // for these so the keyword scan of the name can win.
  const generic = sub === "investmentaccount" || sub === "investment account";

  // 1. Exact subtype match.
  if (sub && !generic && SPECIFIC_LABELS[sub]) return SPECIFIC_LABELS[sub];

  // 2. Keyword scan across subtype + name (catches "Roth Contributory IRA" etc).
  const label = `${sub} ${normalize(name)}`.trim();
  if (label) {
    for (const [keyword, mapped] of KEYWORD_LABELS) {
      if (hasWord(label, keyword)) return mapped;
    }
  }

  // 3. Generic brokerage placeholder with no specific signal in the name.
  if (generic) return "Brokerage";

  // 4. Broad category from the coarse type.
  const t = normalize(type);
  if (t && CATEGORY_LABELS[t]) return CATEGORY_LABELS[t];

  // 5. Fallback: title-case the raw subtype, else em dash.
  return sub ? titleCase(sub) : "—";
}
