import { createAdminClient } from "@/lib/supabase/admin";
import { classifySectors } from "@/lib/gemini";

/** Cap per run; anything beyond it is picked up on the next daily cron. */
const BATCH_LIMIT = 50;

/**
 * Fill in `securities.sector` for a user's holdings. SnapTrade never provides
 * sector data, so rows start NULL; this classifies them once via Gemini
 * (tickers + names only) and persists the result. Cash equivalents are set
 * directly without a model call. Rows the model can't classify stay NULL and
 * are retried on the next run.
 */
export async function classifyMissingSectors(
  userId: string,
): Promise<{ classified: number }> {
  const admin = createAdminClient();

  const { data: missing, error } = await admin
    .from("securities")
    .select("id, ticker, name, is_cash_equivalent")
    .eq("user_id", userId)
    .is("sector", null)
    .not("ticker", "is", null);
  if (error) throw new Error(error.message);
  if (!missing || missing.length === 0) return { classified: 0 };

  let classified = 0;

  const cash = missing.filter((s) => s.is_cash_equivalent);
  for (const c of cash) {
    const { error: updateError } = await admin
      .from("securities")
      .update({ sector: "Cash" })
      .eq("id", c.id);
    if (!updateError) classified++;
  }

  const rest = missing
    .filter((s) => !s.is_cash_equivalent)
    .slice(0, BATCH_LIMIT);
  if (rest.length === 0) return { classified };

  const sectorByTicker = await classifySectors(
    rest.map((s) => ({ ticker: s.ticker as string, name: s.name })),
  );

  for (const s of rest) {
    const sector = sectorByTicker.get((s.ticker as string).toUpperCase());
    if (!sector) continue;
    const { error: updateError } = await admin
      .from("securities")
      .update({ sector })
      .eq("id", s.id);
    if (!updateError) classified++;
  }

  return { classified };
}
