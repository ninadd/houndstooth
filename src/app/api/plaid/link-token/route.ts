import { NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { createClient } from "@/lib/supabase/server";
import {
  getPlaidClient,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
} from "@/lib/plaid";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plaid = getPlaidClient();
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Houndstooth",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES as CountryCode[],
      language: "en",
      // Required for OAuth institutions (Chase, Wells Fargo, BofA, …). Must
      // EXACTLY match an Allowed redirect URI registered in the Plaid Dashboard
      // (https in prod; http://localhost allowed in Sandbox). Omitted when unset
      // so non-OAuth Sandbox linking still works.
      ...(process.env.PLAID_REDIRECT_URI
        ? { redirect_uri: process.env.PLAID_REDIRECT_URI }
        : {}),
      // Optional: references a named Link customization configured in the
      // Plaid Dashboard (brand color, account-select defaults, etc.).
      ...(process.env.PLAID_LINK_CUSTOMIZATION_NAME
        ? { link_customization_name: process.env.PLAID_LINK_CUSTOMIZATION_NAME }
        : {}),
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("link-token error", extractPlaidError(err));
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 },
    );
  }
}

function extractPlaidError(err: unknown) {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: unknown } }).response;
    return r?.data ?? err;
  }
  return err;
}
