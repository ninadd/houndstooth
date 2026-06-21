import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePortalUrl } from "@/lib/providers/snaptrade/auth";
import { snapTradeCredentials } from "@/lib/providers/snaptrade/credentials";
import { extractProviderError } from "@/lib/sync";

/**
 * Start a SnapTrade connection. Personal tier uses the single pre-provisioned
 * user (no registration), so we generate a Connection Portal URL straight from
 * the env credentials and return it for the client to redirect to.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = snapTradeCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "SnapTrade credentials not configured" },
      { status: 500 },
    );
  }

  try {
    // Return the user to the dashboard after the portal; the webhook (deployed)
    // or the Sync button (local) pulls the freshly connected data.
    const origin = new URL(request.url).origin;
    const redirectURI = await generatePortalUrl(
      creds.userId,
      creds.userSecret,
      `${origin}/`,
    );

    return NextResponse.json({ redirectURI });
  } catch (err) {
    console.error("snaptrade connect error", extractProviderError(err));
    return NextResponse.json(
      { error: "Failed to start connection" },
      { status: 500 },
    );
  }
}
