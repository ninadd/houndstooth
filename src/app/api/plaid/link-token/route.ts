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
      client_name: "Portfolio",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES as CountryCode[],
      language: "en",
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
