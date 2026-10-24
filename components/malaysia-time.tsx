"use client";

import React from "react";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/dates";

interface MalaysiaTimeDisplayProps {
  date: Date | string | null | undefined;
  type?: "date" | "datetime";
  className?: string;
  fallback?: string;
}

export function MalaysiaTimeDisplay({
  date,
  type = "date",
  className = "",
  fallback = "—",
}: MalaysiaTimeDisplayProps) {
  if (!date) return <span className={className}>{fallback}</span>;

  const formatted =
    type === "datetime" ? formatMalaysiaDateTime(date) : formatMalaysiaDate(date);

  return (
    <span className={className} suppressHydrationWarning title={`${formatted} (Asia/Kuala_Lumpur)`}>
      {formatted}
    </span>
  );
}
