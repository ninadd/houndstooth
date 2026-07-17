import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser, extractProviderError } from "@/lib/sync";
import { generateDailySummary } from "@/lib/daily-summary";
import { classifyMissingSectors } from "@/lib/sector-classify";
import { refreshManualHoldingPrices } from "@/lib/manual-investments";
import { computeAndStoreSnapshot } from "@/lib/snapshot";

// Always run on-demand (never cached/statically optimized).
export const dynamic = "force-dynamic";

/** Current hour (0–23) in Pacific Time. */
function pacificHour(date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  }).format(date);
  // Intl can return "24" for midnight in some runtimes; normalize to 0.
  return Number(h) % 24;
}

/**
 * Daily snapshot cron. Invoked by Vercel Cron (GET) at two UTC times so that
 * 1:10 PM Pacific fires exactly once year-round despite DST. The handler gates
 * on PT wall-clock so only the run that maps to 1 PM PT does work.
 *
 * Security: when CRON_SECRET is set, the request must carry
 * `Authorization: Bearer <CRON_SECRET>` (Vercel injects this automatically).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `force=1` bypasses the PT gate for manual/local testing (still auth-gated).
  const force = request.nextUrl.searchParams.get("force") === "1";
  const hour = pacificHour();
  if (!force && hour !== 13) {
    return NextResponse.json({ skipped: true, reason: `PT hour ${hour}` });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const results: {
    userId: string;
    accounts?: number;
    holdings?: number;
    summary?: string;
    sectors?: number;
    error?: string;
  }[] = [];

  for (const user of data.users) {
    try {
      // Refresh manual-investment prices first so syncUser's snapshot at the
      // end of this call picks up today's fresh values too. syncUser skips
      // the snapshot entirely when SnapTrade isn't configured, so recompute
      // explicitly here as well — manual prices can change daily on their own.
      await refreshManualHoldingPrices(user.id);
      await computeAndStoreSnapshot(user.id);
      const r = await syncUser(user.id);
      let summary = "skipped_no_key";
      let sectors: number | undefined;
      if (hasGemini) {
        // Classify before generating so today's summary sees fresh sectors.
        // Never let a classification failure block the summary itself.
        try {
          sectors = (await classifyMissingSectors(user.id)).classified;
        } catch (err) {
          console.error("sector classify failed", user.id, err);
        }
        const s = await generateDailySummary(user.id);
        summary = s.ok ? "generated" : s.reason;
      }
      results.push({ userId: user.id, ...r, summary, sectors });
    } catch (err) {
      console.error("cron failed", user.id, extractProviderError(err));
      results.push({ userId: user.id, error: "sync_failed" });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
