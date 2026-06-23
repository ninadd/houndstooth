"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Strip everything but digits and a single leading "-" / decimal point. */
function sanitize(raw: string, maxDecimals: number): string {
  let value = raw.replace(/[^0-9.]/g, "");
  const firstDot = value.indexOf(".");
  if (firstDot !== -1) {
    value =
      value.slice(0, firstDot + 1) +
      value.slice(firstDot + 1).replace(/\./g, "").slice(0, maxDecimals);
  }
  return value;
}

/** "1234.5" -> "1,234.5". Keeps a trailing "." while the user is still typing. */
function formatGrouped(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart === "" ? "" : Number(intPart).toLocaleString("en-US");
  return decPart === undefined ? grouped : `${grouped}.${decPart}`;
}

/**
 * Numeric text input that auto-formats with US thousands separators as the
 * user types (e.g. "1234567" -> "1,234,567"). Submits the raw unformatted
 * number via a hidden input named `name`; the visible field is unnamed so
 * FormData never sees the comma-formatted string.
 */
export function CurrencyInput({
  name,
  id,
  defaultValue,
  placeholder = "0.00",
  required,
  prefix = "$",
  maxDecimals = 2,
}: {
  name: string;
  id?: string;
  defaultValue?: number | null;
  placeholder?: string;
  required?: boolean;
  /** Shown to the left of the input, e.g. "$"; pass "" for non-currency fields. */
  prefix?: string;
  maxDecimals?: number;
}) {
  const [raw, setRaw] = useState(
    defaultValue == null ? "" : String(defaultValue),
  );

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={formatGrouped(raw)}
        onChange={(e) => setRaw(sanitize(e.target.value, maxDecimals))}
        placeholder={placeholder}
        required={required}
        className={prefix ? "pl-6" : undefined}
      />
      <input type="hidden" name={name} value={raw} />
    </div>
  );
}
