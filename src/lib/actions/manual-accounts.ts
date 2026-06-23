"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeAndStoreSnapshot } from "@/lib/snapshot";
import {
  createManualInvestmentHolding,
  deleteManualInvestmentHolding,
  refreshManualHoldingPrices,
} from "@/lib/manual-investments";

const CATEGORIES = ["property", "debt", "investment"] as const;
type ManualCategory = (typeof CATEGORIES)[number];
type TaxTreatment = "taxable" | "tax_advantaged";

export type ManualAccountActionState = { error?: string; ok?: boolean };

type ParsedHolding = { ticker: string; units: number; costBasis: number | null };

type ParsedForm =
  | { category: "property" | "debt"; label: string; value: number }
  | {
      category: "investment";
      label: string;
      value: number;
      holdings: null;
      taxTreatment: TaxTreatment;
    }
  | {
      category: "investment";
      label: string;
      value: null;
      holdings: ParsedHolding[];
      taxTreatment: TaxTreatment;
    };

function parseNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Shared field parsing + validation for add/update. Returns an error string
 *  or the parsed, type-narrowed form.
 *
 *  Investments submit either a single `value` (the no-ticker manual-value
 *  fallback, only available when there's exactly one holding row and its
 *  ticker is left blank) or one-or-more `ticker`/`units`/`cost_basis` triples
 *  — repeated form fields collected in DOM order via `getAll`, one holding
 *  per index. */
function parseForm(formData: FormData): ParsedForm | { error: string } {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Label is required" };

  const category = String(formData.get("category") ?? "") as ManualCategory;
  if (!CATEGORIES.includes(category)) return { error: "Invalid type" };

  if (category === "property" || category === "debt") {
    const value = parseNumber(formData, "value");
    if (value == null || value < 0) return { error: "Enter a valid, non-negative amount" };
    return { category, label, value };
  }

  const taxTreatment: TaxTreatment =
    formData.get("tax_treatment") === "tax_advantaged" ? "tax_advantaged" : "taxable";

  if (formData.has("value")) {
    const value = parseNumber(formData, "value");
    if (value == null || value < 0) return { error: "Enter a valid, non-negative amount" };
    return { category, label, value, holdings: null, taxTreatment };
  }

  const tickers = formData.getAll("ticker").map((t) => String(t).trim());
  const unitsRaw = formData.getAll("units");
  const costBasisRaw = formData.getAll("cost_basis");
  if (tickers.length === 0) return { error: "Add at least one holding" };

  const holdings: ParsedHolding[] = [];
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (!ticker) return { error: `Holding ${i + 1} is missing a ticker symbol` };
    const units = Number(unitsRaw[i]);
    if (!Number.isFinite(units) || units <= 0) {
      return { error: `Holding ${i + 1} needs a valid number of units` };
    }
    const rawCostBasis = costBasisRaw[i];
    let costBasis: number | null = null;
    if (rawCostBasis != null && rawCostBasis !== "") {
      const n = Number(rawCostBasis);
      costBasis = Number.isFinite(n) ? n : null;
    }
    holdings.push({ ticker, units, costBasis });
  }
  return { category, label, value: null, holdings, taxTreatment };
}

export async function addManualAccount(
  formData: FormData,
): Promise<ManualAccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  const isDebt = parsed.category === "debt";
  const initialBalance =
    parsed.category === "investment" ? (parsed.holdings ? 0 : parsed.value) : parsed.value;

  const { data: inserted, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      is_manual: true,
      manual_category: parsed.category,
      name: parsed.label,
      is_debt: isDebt,
      tax_treatment: parsed.category === "investment" ? parsed.taxTreatment : "taxable",
      current_balance: initialBalance,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (parsed.category === "investment" && parsed.holdings) {
    let total = 0;
    for (const h of parsed.holdings) {
      try {
        total += await createManualInvestmentHolding(
          supabase,
          user.id,
          inserted.id as string,
          h.ticker,
          h.units,
          h.costBasis,
        );
      } catch {
        return { error: `Couldn't find a price for "${h.ticker}". Check the ticker symbol.` };
      }
    }
    await supabase.from("accounts").update({ current_balance: total }).eq("id", inserted.id);
  }

  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}

export async function updateManualAccount(
  formData: FormData,
): Promise<ManualAccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing account" };

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  // Each save submits the full current set of holdings; clear the old set
  // before recreating it (covers added/removed/changed tickers alike).
  await deleteManualInvestmentHolding(supabase, id);

  const isDebt = parsed.category === "debt";
  const initialBalance =
    parsed.category === "investment" ? (parsed.holdings ? 0 : parsed.value) : parsed.value;

  const { error } = await supabase
    .from("accounts")
    .update({
      manual_category: parsed.category,
      name: parsed.label,
      is_debt: isDebt,
      tax_treatment: parsed.category === "investment" ? parsed.taxTreatment : "taxable",
      current_balance: initialBalance,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  if (parsed.category === "investment" && parsed.holdings) {
    let total = 0;
    for (const h of parsed.holdings) {
      try {
        total += await createManualInvestmentHolding(
          supabase,
          user.id,
          id,
          h.ticker,
          h.units,
          h.costBasis,
        );
      } catch {
        return { error: `Couldn't find a price for "${h.ticker}". Check the ticker symbol.` };
      }
    }
    await supabase.from("accounts").update({ current_balance: total }).eq("id", id);
  }

  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}

export async function deleteManualAccount(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // RLS already scopes to the owner; the explicit filter is belt-and-suspenders.
  await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id);

  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
  revalidatePath("/accounts");
}

/** User-triggered "Sync" for manually added accounts: re-prices every
 *  ticker-backed manual holding from Yahoo Finance (the same refresh the
 *  daily cron runs automatically). */
export async function refreshManualAccountPrices(): Promise<
  ManualAccountActionState & { refreshed?: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const refreshed = await refreshManualHoldingPrices(user.id);
  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true, refreshed };
}
