/**
 * Modular tax-treatment classification.
 *
 * Maps an account (type + subtype) to a tax bucket. Kept as a single pure
 * function + config set so it is easy to test and adjust without touching
 * ingestion logic. A user can still override the result per-account via
 * `accounts.tax_treatment_override`.
 */

export type TaxTreatment = "taxable" | "tax_advantaged";

/**
 * Account subtypes that are tax-advantaged in the US (plus a few common
 * registered accounts). Compared case-insensitively after trimming. Covers
 * Plaid's `account.subtype` enum exactly; SnapTrade's free-form `raw_type`
 * (e.g. "Roth IRA") is matched via keyword tokens below.
 */
const TAX_ADVANTAGED_SUBTYPES = new Set<string>([
  "401a",
  "401k",
  "403b",
  "457b",
  "529",
  "education savings account",
  "hsa",
  "health reimbursement arrangement",
  "ira",
  "roth",
  "roth 401k",
  "sep ira",
  "simple ira",
  "sarsep",
  "keogh",
  "pension",
  "profit sharing plan",
  "retirement",
  "thrift savings plan",
  "stock plan",
  // Common non-US registered accounts (harmless to include):
  "rrsp",
  "rrif",
  "resp",
  "tfsa",
  "rdsp",
  "lira",
  "lrsp",
  "lif",
  "lrif",
  "prif",
  "rlif",
  "sipp",
]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Keyword tokens that mark a tax-advantaged account when they appear anywhere in
 * a free-form brokerage label. SnapTrade's `raw_type` isn't an enum — it returns
 * strings like "Roth IRA" or "Traditional 401k" — so an exact Set lookup misses.
 * Matched on word boundaries to avoid false hits (e.g. "ira" inside "iranium").
 */
const TAX_ADVANTAGED_KEYWORDS = [
  "roth",
  "ira",
  "401k",
  "401(k)",
  "403b",
  "457b",
  "hsa",
  "529",
  "sep",
  "simple",
  "pension",
  "tsp",
  "keogh",
  "retirement",
];

/**
 * Classify an account's tax treatment from its type/subtype. Tries an exact
 * subtype match first (Plaid enums), then a keyword scan of the free-form label
 * (SnapTrade `raw_type`). Defaults to "taxable" for anything not recognized
 * (brokerage, depository, loans, credit, cash, etc.).
 */
export function classifyTaxTreatment(
  type: string | null | undefined,
  subtype: string | null | undefined,
  name?: string | null | undefined,
): TaxTreatment {
  const sub = normalize(subtype);
  if (TAX_ADVANTAGED_SUBTYPES.has(sub)) {
    return "tax_advantaged";
  }
  // Some brokerages (e.g. Schwab via SnapTrade) report a generic subtype like
  // "investmentAccount" and put the real signal ("Roth IRA", "Rollover IRA") in
  // the account name. Scan keywords across both.
  const label = `${sub} ${normalize(name)}`.trim();
  if (label && TAX_ADVANTAGED_KEYWORDS.some((kw) => hasWord(label, kw))) {
    return "tax_advantaged";
  }
  return "taxable";
}

/** True when `keyword` appears in `text` as a whole token (boundary-delimited). */
function hasWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text);
}

/**
 * Resolve the effective tax treatment, honoring a user override when present.
 */
export function effectiveTaxTreatment(account: {
  type?: string | null;
  subtype?: string | null;
  name?: string | null;
  tax_treatment_override?: TaxTreatment | null;
}): TaxTreatment {
  return (
    account.tax_treatment_override ??
    classifyTaxTreatment(account.type, account.subtype, account.name)
  );
}

/** True for account types that represent a liability (debt) rather than an asset. */
export function isDebtType(type: string | null | undefined): boolean {
  const t = normalize(type);
  return t === "loan" || t === "credit";
}

/**
 * True for cash accounts (checking/savings/deposit). These don't fit the
 * investment-style taxable/tax-advantaged split, so the UI shows "N/A" instead.
 */
export function isCashType(
  type: string | null | undefined,
  subtype?: string | null | undefined,
): boolean {
  const t = normalize(type);
  const sub = normalize(subtype);
  return (
    t === "deposit" ||
    t === "cash" ||
    sub === "checking" ||
    sub === "savings" ||
    sub === "cash"
  );
}
