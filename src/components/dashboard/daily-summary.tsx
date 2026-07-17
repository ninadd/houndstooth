"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailySummary } from "@/lib/daily-summary";

export const SEEN_KEY = "houndstooth:summary-seen";

/** SSR-safe read of the last-seen summary date from localStorage. */
function useSeenDate(): string | null {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    return () => window.removeEventListener("storage", cb);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(SEEN_KEY),
    () => null,
  );
}

export function DailySummaryBanner({
  summary,
}: {
  summary: DailySummary | null;
}) {
  const seenDate = useSeenDate();
  const [dismissed, setDismissed] = useState(false);

  if (!summary) return null;

  const persistedSeen = seenDate === summary.date;
  if (dismissed || persistedSeen) return null;

  function markSeen() {
    setDismissed(true);
    try {
      localStorage.setItem(SEEN_KEY, summary!.date);
    } catch {
      // ignore storage failures
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
      <Sparkles className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Your daily summary is ready</div>
        <div className="truncate text-sm text-muted-foreground">
          {summary.drivers.headline}
        </div>
      </div>
      <Button size="sm" nativeButton={false} render={<Link href="/summary" />}>
        View
      </Button>
      <button
        aria-label="Dismiss"
        onClick={markSeen}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
