/**
 * Date and timezone utilities for rent systems, billing cycles, and due dates.
 * Always handles dates in UTC to avoid server-client timezone shifting bugs.
 */

export function parseUTCDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function formatUTCDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

export function isOverdue(dueDate: Date | string): boolean {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  return due.getTime() < now.getTime();
}

/**
 * Calculates monthly billing dates between lease start and end dates.
 * DayOfMonth defaults to 1st of month or lease start day.
 */
export function generateBillingSchedule(
  startDate: Date,
  endDate: Date,
  dueDayOfMonth: number = 1
): Date[] {
  const dueDates: Date[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const currentYear = start.getUTCFullYear();
  const currentMonth = start.getUTCMonth();

  let pointer = new Date(Date.UTC(currentYear, currentMonth, dueDayOfMonth, 0, 0, 0, 0));
  if (pointer < start) {
    pointer = new Date(Date.UTC(currentYear, currentMonth + 1, dueDayOfMonth, 0, 0, 0, 0));
  }

  while (pointer <= end) {
    dueDates.push(new Date(pointer));
    pointer = new Date(Date.UTC(pointer.getUTCFullYear(), pointer.getUTCMonth() + 1, dueDayOfMonth, 0, 0, 0, 0));
  }

  return dueDates;
}

export function formatMalaysiaDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + " MYT";
}

export function formatMalaysiaDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDateDisplay(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(d);
}

