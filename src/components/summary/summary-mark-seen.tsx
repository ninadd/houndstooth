"use client";

import { useEffect } from "react";
import { SEEN_KEY } from "@/components/dashboard/daily-summary";

/** Visiting the summary page marks it seen so the dashboard banner dismisses. */
export function SummaryMarkSeen({ date }: { date: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, date);
    } catch {
      // ignore storage failures
    }
  }, [date]);
  return null;
}
