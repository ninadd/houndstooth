import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillSnapshots } from "@/lib/backfill";

/**
 * Dev-only: seed synthetic daily snapshot history so the charts populate.
 * Disabled in production. Single-user app, so if there's no session it falls
 * back to the only existing user.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prefer the signed-in user; otherwise resolve the single user via admin.
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

  const days = Number(request.nextUrl.searchParams.get("days") ?? "365");

  try {
    const result = await backfillSnapshots(userId, Number.isFinite(days) ? days : 365);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("backfill error", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
