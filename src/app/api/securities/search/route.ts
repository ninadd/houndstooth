import { NextResponse, type NextRequest } from "next/server";
import yahooFinance from "@/lib/yahoo-finance";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type TickerSearchResult = { symbol: string; name: string };

/**
 * Ticker autocomplete for the manual investment account form. Wraps Yahoo
 * Finance search (same data source as the `yfinance` Python library) since
 * this Next.js app can't run a Python runtime.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });

  try {
    const { quotes } = await yahooFinance.search(q, { quotesCount: 8 });
    const results: TickerSearchResult[] = quotes
      .filter((quote): quote is typeof quote & { symbol: string } =>
        typeof quote.symbol === "string" && quote.symbol.length > 0,
      )
      .map((quote) => ({
        symbol: quote.symbol,
        name: quote.shortname ?? quote.longname ?? quote.symbol,
      }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
