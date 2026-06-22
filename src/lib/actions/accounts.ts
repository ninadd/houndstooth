"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AccountActionState = { error?: string; ok?: boolean };

/**
 * Set (or clear) a user's custom display name for a connected account. An empty
 * value clears the override, reverting the UI to the broker-provided name. Does
 * not affect net-worth figures, so no snapshot recompute is needed.
 */
export async function renameAccount(
  formData: FormData,
): Promise<AccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing account" };

  const customName = String(formData.get("custom_name") ?? "").trim();

  // RLS already scopes to the owner; the explicit filter is belt-and-suspenders.
  const { error } = await supabase
    .from("accounts")
    .update({ custom_name: customName || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}
