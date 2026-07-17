"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function SortHeader<C extends string>({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: {
  column: C;
  label: string;
  sort: { column: C; dir: SortDir };
  onSort: (c: C) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.column === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 font-medium outline-none hover:text-foreground focus-visible:underline",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}
