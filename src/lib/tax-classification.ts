/**
 * Modular tax-treatment classification.
 *
 * Maps a Plaid account (type + subtype) to a tax bucket. Kept as a single
 * pure function + config set so it is easy to test and adjust without touching
 * ingestion logic. A user can still override the result per-account via
 * `accounts.tax_treatment_override`.
 */

export type TaxTreatment = "taxable" | "tax_advantaged";

/**
 * Plaid investment account subtypes that are tax-advantaged in the US (plus a
 * few common registered accounts). Compared case-insensitively after trimming.
 * Source: Plaid `account.subtype` enum for investment accounts.
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
 * Classify an account's tax treatment from its Plaid type/subtype.
 * Defaults to "taxable" for anything not explicitly tax-advantaged
 * (brokerage, depository, loans, credit, cash, etc.).
 */
export function classifyTaxTreatment(
  type: string | null | undefined,
  subtype: string | null | undefined,
): TaxTreatment {
  const sub = normalize(subtype);
  if (TAX_ADVANTAGED_SUBTYPES.has(sub)) {
    return "tax_advantaged";
  }
  return "taxable";
}

/**
 * Resolve the effective tax treatment, honoring a user override when present.
 */
export function effectiveTaxTreatment(account: {
  type?: string | null;
  subtype?: string | null;
  tax_treatment_override?: TaxTreatment | null;
}): TaxTreatment {
  return (
    account.tax_treatment_override ??
    classifyTaxTreatment(account.type, account.subtype)
  );
}

/** True for account types that represent a liability (debt) rather than an asset. */
export function isDebtType(type: string | null | undefined): boolean {
  const t = normalize(type);
  return t === "loan" || t === "credit";
}
