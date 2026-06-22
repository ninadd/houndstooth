"use client";

import { createContext, useContext, useState } from "react";
import type { SummaryDrivers } from "@/lib/daily-summary";

export type DailySummary = {
  date: string;
  model: string | null;
  drivers: SummaryDrivers;
};

type DailySummaryContextValue = {
  summary: DailySummary | null;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DailySummaryContext = createContext<DailySummaryContextValue | null>(null);

export function DailySummaryProvider({
  summary,
  children,
}: {
  summary: DailySummary | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DailySummaryContext.Provider value={{ summary, open, setOpen }}>
      {children}
    </DailySummaryContext.Provider>
  );
}

export function useDailySummary(): DailySummaryContextValue {
  const ctx = useContext(DailySummaryContext);
  if (!ctx) {
    throw new Error("useDailySummary must be used within a DailySummaryProvider");
  }
  return ctx;
}
