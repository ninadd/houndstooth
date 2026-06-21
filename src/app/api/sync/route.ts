import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUser, extractProviderError } from "@/lib/sync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncUser(user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync error", extractProviderError(err));
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
