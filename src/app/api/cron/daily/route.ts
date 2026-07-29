import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser, extractProviderError } from "@/lib/sync";
import { generateDailySummary } from "@/lib/daily-summary";
import { classifyMissingSectors } from "@/lib/sector-classify";
import { refreshManualHoldingPrices } from "@/lib/manual-investments";
import { computeAndStoreSnapshot, pacificDate } from "@/lib/snapshot";
import { TimeoutError, withTimeout } from "@/lib/with-timeout";

// Always run on-demand (never cached/statically optimized).
export const dynamic = "force-dynamic";

// Vercel kills the invocation here no matter what is in flight, so the stage
// budgets below must sum to comfortably less than this.
export const maxDuration = 300;

/** Per-stage ceilings; sum (250s) leaves headroom under maxDuration. */
const STAGE_MS = {
  prices: 25_000,
  sync: 90_000,
  classify: 45_000,
  summary: 90_000,
} as const;

/** Don't start another user unless at least this much budget is left. */
const PER_USER_RESERVE_MS = 60_000;

/** Earliest PT hour the job may run — 1 PM PT is after the US market close. */
const EARLIEST_PT_HOUR = 13;

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

type UserResult = {
  userId: string;
  accounts?: number;
  holdings?: number;
  summary?: string;
  sectors?: number;
  skipped?: string;
  error?: string;
};

/**
 * Daily snapshot cron. Invoked by Vercel Cron (GET) at two UTC times so that
 * one run lands after the 1 PM PT close year-round despite DST.
 *
 * The gate is "at or after the close AND today's summary isn't written yet",
 * not an exact wall-clock hour. That matters twice over: Vercel's Hobby tier
 * only guarantees a cron fires within the hour of its slot, and it makes the
 * later invocation a free retry when the earlier one failed partway through.
 * In PDT both invocations qualify, so a transient upstream failure at 20:10
 * UTC self-heals at 21:10. In PST only the later one clears the close, so
 * there's no retry slot — Hobby caps us at two crons.
 *
 * Security: when CRON_SECRET is set, the request must carry
 * `Authorization: Bearer <CRON_SECRET>` (Vercel injects this automatically).
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `force=1` bypasses both the close gate and the already-generated check,
  // for manual/local testing (still auth-gated).
  const force = request.nextUrl.searchParams.get("force") === "1";
  const hour = pacificHour();
  if (!force && hour < EARLIEST_PT_HOUR) {
    return NextResponse.json({
      skipped: true,
      reason: `PT hour ${hour} is before the ${EARLIEST_PT_HOUR}:00 close`,
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Users whose summary already landed today. The second invocation is purely
  // a retry, so it should do no work at all when the first one succeeded.
  const today = pacificDate();
  const { data: done } = await admin
    .from("daily_summaries")
    .select("user_id")
    .eq("summary_date", today);
  const alreadyGenerated = new Set((done ?? []).map((r) => r.user_id as string));

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const deadline = startedAt + (maxDuration - 30) * 1000;
  const results: UserResult[] = [];
  let attempted = 0;
  let failed = 0;

  for (const user of data.users) {
    if (!force && alreadyGenerated.has(user.id)) {
      results.push({ userId: user.id, skipped: "already_generated" });
      continue;
    }
    if (Date.now() > deadline - PER_USER_RESERVE_MS) {
      // Better to leave a user for the retry invocation than to start one we
      // can't finish and get killed mid-write.
      results.push({ userId: user.id, skipped: "out_of_budget" });
      continue;
    }

    attempted++;
    try {
      // Refresh manual-investment prices first so the snapshot below picks up
      // today's fresh values.
      await withTimeout(
        refreshManualHoldingPrices(user.id),
        STAGE_MS.prices,
        "refresh_prices",
      );
      // Deliberately also computed inside syncUser at the end. This early call
      // is cheap insurance: it keeps net worth current even when the brokerage
      // sync below fails outright, and it leaves a timestamped breadcrumb of
      // how far a failed run actually got.
      await computeAndStoreSnapshot(user.id);
      const r = await withTimeout(syncUser(user.id), STAGE_MS.sync, "sync");

      let summary = "skipped_no_key";
      let sectors: number | undefined;
      if (hasGemini) {
        // Classify before generating so today's summary sees fresh sectors.
        // Never let a classification failure block the summary itself.
        try {
          sectors = (
            await withTimeout(
              classifyMissingSectors(user.id),
              STAGE_MS.classify,
              "classify",
            )
          ).classified;
        } catch (err) {
          console.error("sector classify failed", user.id, err);
        }
        const s = await withTimeout(
          generateDailySummary(user.id),
          STAGE_MS.summary,
          "summary",
        );
        summary = s.ok ? "generated" : s.reason;
        if (!s.ok) failed++;
      }
      results.push({ userId: user.id, ...r, summary, sectors });
    } catch (err) {
      failed++;
      console.error("cron failed", user.id, extractProviderError(err));
      // Stage labels are our own strings, never provider text, so naming the
      // stalled stage here leaks nothing and saves a trip to the logs — which
      // on Hobby are gone an hour later.
      results.push({
        userId: user.id,
        error: err instanceof TimeoutError ? `timeout_${err.label}` : "sync_failed",
      });
    }
  }

  // A run where every attempted user failed must not report itself as green —
  // that is precisely how a silent breakage hides until someone notices a
  // stale summary days later.
  const allFailed = attempted > 0 && failed === attempted;
  return NextResponse.json(
    {
      ok: failed === 0,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      attempted,
      failed,
      results,
    },
    { status: allFailed ? 500 : 200 },
  );
}
