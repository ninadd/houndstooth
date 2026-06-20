import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDailySummary } from "@/lib/daily-summary";

/**
 * Dev-only: generate today's summary on demand.
 *   ?mock=1  -> skip Gemini, write a canned summary (no API key needed).
 * Disabled in production.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId = user?.id;
  if (!userId) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    userId = data.users[0]?.id;
  }
  if (!userId) {
    return NextResponse.json({ error: "No user found" }, { status: 404 });
  }

  const mock = request.nextUrl.searchParams.get("mock") === "1";
  try {
    const result = await generateDailySummary(userId, { mock });
    return NextResponse.json(result);
  } catch (err) {
    console.error("dev summary error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
