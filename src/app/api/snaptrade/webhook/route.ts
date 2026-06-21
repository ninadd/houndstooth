import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser, extractProviderError } from "@/lib/sync";

// Webhooks carry runtime data; never cache/prerender.
export const dynamic = "force-dynamic";

/** Events that mean a connection or holdings changed — re-pull the user. */
const SYNC_EVENTS = new Set([
  "CONNECTION_ADDED",
  "NEW_ACCOUNT_AVAILABLE",
  "ACCOUNT_HOLDINGS_UPDATED",
]);

/**
 * Verify SnapTrade's `Signature` header: base64 HMAC-SHA256 of the raw body,
 * keyed by the consumer key. Constant-time compare to avoid timing leaks.
 */
function verifySignature(
  rawBody: string,
  signature: string | null,
  key: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", key)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const key = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!key) {
    console.error("snaptrade webhook: SNAPTRADE_CONSUMER_KEY not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Read the raw body BEFORE parsing — the signature is over the exact bytes.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("Signature"), key)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { eventType?: string; userId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventType, userId } = payload;
  if (eventType && userId && SYNC_EVENTS.has(eventType)) {
    try {
      // The payload userId is the personal-tier SnapTrade account, not our app
      // user. Single-user app: re-sync the app's user(s), scoped by auth.uid().
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.listUsers();
      for (const u of data.users) await syncUser(u.id);
    } catch (err) {
      // Log but still 200 so SnapTrade doesn't hammer retries on an app bug.
      console.error("snaptrade webhook sync failed", extractProviderError(err));
    }
  }

  return NextResponse.json({ ok: true });
}
