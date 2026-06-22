"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createTrustToken, TRUST_COOKIE, TRUST_TTL_MS } from "@/lib/mfa-trust";

export type TrustDeviceResult = { ok?: boolean; error?: string };

/**
 * Marks the current browser as trusted so future logins skip the TOTP prompt
 * for TRUST_TTL_MS. Only issued to a fully verified (aal2) session; the cookie
 * is an HMAC-signed, httpOnly token bound to this user (see lib/mfa-trust).
 */
export async function trustThisDevice(): Promise<TrustDeviceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { error: "Finish MFA first" };

  const secret = process.env.MFA_TRUST_SECRET;
  if (!secret) return { error: "Device trust is not configured" };

  const token = await createTrustToken(user.id, secret);
  const store = await cookies();
  store.set(TRUST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TRUST_TTL_MS / 1000),
  });
  return { ok: true };
}
