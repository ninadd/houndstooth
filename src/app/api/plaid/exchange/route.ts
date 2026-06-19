import { NextResponse, type NextRequest } from "next/server";
import { CountryCode } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { getPlaidClient, PLAID_COUNTRY_CODES } from "@/lib/plaid";
import { syncUser, extractPlaidError } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { public_token } = await request.json();
  if (!public_token) {
    return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
  }

  try {
    const plaid = getPlaidClient();

    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const plaidItemId = exchange.data.item_id;

    // Resolve a friendly institution name (best-effort).
    let institutionId: string | null = null;
    let institutionName: string | null = null;
    try {
      const itemRes = await plaid.itemGet({ access_token: accessToken });
      institutionId = itemRes.data.item.institution_id ?? null;
      if (institutionId) {
        const inst = await plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: PLAID_COUNTRY_CODES as CountryCode[],
        });
        institutionName = inst.data.institution.name;
      }
    } catch {
      // Non-fatal — store the item without a friendly name.
    }

    const admin = createAdminClient();
    const { error: insertError } = await admin.from("plaid_items").upsert(
      {
        user_id: user.id,
        plaid_item_id: plaidItemId,
        access_token_encrypted: encrypt(accessToken),
        institution_id: institutionId,
        institution_name: institutionName,
        status: "active",
      },
      { onConflict: "plaid_item_id" },
    );
    if (insertError) throw insertError;

    // Initial pull so the dashboard is populated immediately.
    const result = await syncUser(user.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("exchange error", extractPlaidError(err));
    return NextResponse.json(
      { error: "Failed to link institution" },
      { status: 500 },
    );
  }
}
