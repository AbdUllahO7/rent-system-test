/**
 * lib/billing.ts
 * Pure billing engine: no I/O, no framework imports, no reliance on local machine timezone.
 */

export type InvoiceKind = 'deposit' | 'rent';

export interface ScheduledInvoice {
  kind: InvoiceKind;
  periodIndex: number | null; // 0, 1, 2... for rent; null for the deposit
  periodStart: string | null; // 'YYYY-MM-DD'; null for the deposit
  periodEnd: string | null;   // 'YYYY-MM-DD', inclusive; null for the deposit
  dueDate: string;            // 'YYYY-MM-DD'
  amountSen: number;          // integer
}

export type InvoiceStatus = 'paid' | 'partially_paid' | 'unpaid' | 'overdue';

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: return 31;
    case 2: return isLeapYear(year) ? 29 : 28;
    case 3: return 31;
    case 4: return 30;
    case 5: return 31;
    case 6: return 30;
    case 7: return 31;
    case 8: return 31;
    case 9: return 30;
    case 10: return 31;
    case 11: return 30;
    case 12: return 31;
    default: return 0;
  }
}

function validateAndParseDate(dateStr: string): { year: number; month: number; day: number } {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD`);
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid calendar month: ${month} in date "${dateStr}"`);
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    throw new Error(`Invalid calendar day: ${day} for month ${month} in date "${dateStr}"`);
  }

  return { year, month, day };
}

function formatDateString(year: number, month: number, day: number): string {
  const m = month < 10 ? `0${month}` : `${month}`;
  const d = day < 10 ? `0${day}` : `${day}`;
  return `${year}-${m}-${d}`;
}

/**
 * Calculates calendar days between two inclusive YYYY-MM-DD dates using pure date arithmetic.
 */
function daysBetweenInclusive(startStr: string, endStr: string): number {
  const start = validateAndParseDate(startStr);
  const end = validateAndParseDate(endStr);

  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  const diffMs = endUtc - startUtc;
  return Math.round(diffMs / 86400000) + 1;
}

/**
 * Subtracts 1 calendar day from a valid YYYY-MM-DD date string.
 */
function dayBefore(dateStr: string): string {
  const { year, month, day } = validateAndParseDate(dateStr);
  if (day > 1) {
    return formatDateString(year, month, day - 1);
  }
  // Previous month
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevDay = daysInMonth(prevYear, prevMonth);
  return formatDateString(prevYear, prevMonth, prevDay);
}

/**
 * Calculates anchor k for a start date (Y, M, D) plus k months.
 * Always counted from the start date. If that month has fewer days, uses month's last day.
 */
function getAnchorDate(startYear: number, startMonth: number, startDay: number, k: number): string {
  const totalMonths = (startMonth - 1) + k;
  const targetYear = startYear + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const maxDays = daysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(startDay, maxDays);
  return formatDateString(targetYear, targetMonth, targetDay);
}

/**
 * Generates deposit and monthly rent schedule for a lease.
 */
export function generateSchedule(lease: {
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
}): ScheduledInvoice[] {
  const { startDate, endDate, monthlyRentSen, depositSen } = lease;

  // Validation
  const start = validateAndParseDate(startDate);
  const end = validateAndParseDate(endDate);

  if (endDate < startDate) {
    throw new Error(`endDate (${endDate}) cannot be before startDate (${startDate})`);
  }
  if (!Number.isInteger(monthlyRentSen) || monthlyRentSen <= 0) {
    throw new Error(`monthlyRentSen must be a positive integer, got: ${monthlyRentSen}`);
  }
  if (!Number.isInteger(depositSen) || depositSen < 0) {
    throw new Error(`depositSen must be a non-negative integer, got: ${depositSen}`);
  }

  const invoices: ScheduledInvoice[] = [];

  // 1. Deposit
  if (depositSen > 0) {
    invoices.push({
      kind: 'deposit',
      periodIndex: null,
      periodStart: null,
      periodEnd: null,
      dueDate: startDate,
      amountSen: depositSen,
    });
  }

  // 2. Rent Periods
  let k = 0;
  while (true) {
    const anchorK = getAnchorDate(start.year, start.month, start.day, k);
    if (anchorK > endDate) {
      break;
    }

    const anchorNext = getAnchorDate(start.year, start.month, start.day, k + 1);
    const fullPeriodEnd = dayBefore(anchorNext);

    // Actual period end is cut at endDate if shorter
    const periodEnd = fullPeriodEnd <= endDate ? fullPeriodEnd : endDate;

    let amountSen: number;
    if (periodEnd === fullPeriodEnd) {
      amountSen = monthlyRentSen;
    } else {
      // Last period cut at endDate: prorate
      const daysInFull = daysBetweenInclusive(anchorK, fullPeriodEnd);
      const daysUsed = daysBetweenInclusive(anchorK, periodEnd);
      // monthlyRentSen x days used / days in the full period, rounded half up
      amountSen = Math.floor((monthlyRentSen * daysUsed) / daysInFull + 0.5);
    }

    invoices.push({
      kind: 'rent',
      periodIndex: k,
      periodStart: anchorK,
      periodEnd,
      dueDate: anchorK,
      amountSen,
    });

    k++;
  }

  return invoices;
}

/**
 * Computes current invoice status based on payment progress and Malaysia (UTC+8) time.
 */
export function invoiceStatus(
  invoice: { dueDate: string; amountSen: number; paidSen: number },
  now: Date,
): InvoiceStatus {
  // 1. paid if paidSen >= amountSen
  if (invoice.paidSen >= invoice.amountSen) {
    return 'paid';
  }

  // Convert `now` to Malaysia date string (UTC+8)
  const msInUtc8 = now.getTime() + 8 * 60 * 60 * 1000;
  const utc8Date = new Date(msInUtc8);
  const myYear = utc8Date.getUTCFullYear();
  const myMonth = utc8Date.getUTCMonth() + 1;
  const myDay = utc8Date.getUTCDate();
  const todayMalaysia = formatDateString(myYear, myMonth, myDay);

  // 2. overdue if today's Malaysia date is strictly after dueDate
  if (todayMalaysia > invoice.dueDate) {
    return 'overdue';
  }

  // 3. partially_paid if paidSen > 0
  if (invoice.paidSen > 0) {
    return 'partially_paid';
  }

  // 4. Otherwise unpaid
  return 'unpaid';
}

/**
 * Parses user input into integer sen.
 * Accepts digits with optional comma thousands separators (groups of exactly three)
 * and an optional decimal part of one or two digits.
 */
export function parseRinggitToSen(input: string): number {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Input cannot be empty');
  }

  // Group 1: Integer part (\d+ or \d{1,3}(,\d{3})+)
  // Group 2: Optional decimal part (\.\d{1,2})
  const pattern = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;
  const match = trimmed.match(pattern);

  if (!match) {
    throw new Error(`Invalid Ringgit amount: "${input}"`);
  }

  const rawIntPart = match[1];
  const decPart = match[2];

  const intPart = rawIntPart.replace(/,/g, '');
  const intVal = parseInt(intPart, 10);

  let decVal = 0;
  if (decPart !== undefined) {
    if (decPart.length === 1) {
      decVal = parseInt(decPart, 10) * 10;
    } else {
      decVal = parseInt(decPart, 10);
    }
  }

  return intVal * 100 + decVal;
}
