"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeAndStoreSnapshot } from "@/lib/snapshot";

const ASSET_CLASSES = ["real_estate", "equity_comp", "529", "other"] as const;
type AssetClass = (typeof ASSET_CLASSES)[number];

export type ManualAssetActionState = { error?: string; ok?: boolean };

export async function addManualAsset(
  formData: FormData,
): Promise<ManualAssetActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const label = String(formData.get("label") ?? "").trim();
  const assetClass = String(formData.get("asset_class") ?? "") as AssetClass;
  const value = Number(formData.get("value"));
  const isDebt = formData.get("is_debt") === "on";

  if (!label) return { error: "Label is required" };
  if (!ASSET_CLASSES.includes(assetClass)) return { error: "Invalid asset class" };
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Enter a valid, non-negative amount" };
  }

  // 529 is inherently tax-advantaged; real estate is excluded from the tax
  // split. Everything else defaults to taxable unless explicitly set.
  const submittedTreatment = formData.get("tax_treatment");
  const taxTreatment =
    assetClass === "529"
      ? "tax_advantaged"
      : submittedTreatment === "tax_advantaged"
        ? "tax_advantaged"
        : "taxable";

  const { error } = await supabase.from("manual_assets").insert({
    user_id: user.id,
    label,
    asset_class: assetClass,
    value,
    is_debt: isDebt,
    tax_treatment: taxTreatment,
  });
  if (error) return { error: error.message };

  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteManualAsset(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // RLS already scopes to the owner; the explicit filter is belt-and-suspenders.
  await supabase.from("manual_assets").delete().eq("id", id).eq("user_id", user.id);

  await computeAndStoreSnapshot(user.id);
  revalidatePath("/");
}
