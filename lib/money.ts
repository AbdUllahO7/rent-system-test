import { Prisma } from "@prisma/client";

/**
 * Money utilities for handling currency, rounding, and precise decimal calculations.
 * Prevents floating point errors in rent collection, invoices, and payments.
 */

export function toCents(amount: Prisma.Decimal | string | number): number {
  const num = typeof amount === "number" ? amount : Number(amount.toString());
  return Math.round(num * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toDecimal(amount: string | number): Prisma.Decimal {
  const formatted = typeof amount === "number" ? amount.toFixed(2) : Number(amount).toFixed(2);
  return new Prisma.Decimal(formatted);
}

export function addMoney(
  a: Prisma.Decimal | string | number,
  b: Prisma.Decimal | string | number
): Prisma.Decimal {
  const centsA = toCents(a);
  const centsB = toCents(b);
  return new Prisma.Decimal(fromCents(centsA + centsB));
}

export function subtractMoney(
  minuend: Prisma.Decimal | string | number,
  subtrahend: Prisma.Decimal | string | number
): Prisma.Decimal {
  const centsA = toCents(minuend);
  const centsB = toCents(subtrahend);
  return new Prisma.Decimal(fromCents(centsA - centsB));
}

export function formatMoney(
  amount: Prisma.Decimal | string | number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  const val = typeof amount === "number" ? amount : Number(amount.toString());
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function isValidMoney(amount: unknown): boolean {
  if (typeof amount !== "number" && typeof amount !== "string") return false;
  const num = Number(amount);
  if (isNaN(num) || num <= 0) return false;
  // Check maximum 2 decimal places
  const str = String(amount);
  const parts = str.split(".");
  if (parts.length > 2) return false;
  if (parts.length === 2 && parts[1].length > 2) return false;
  return true;
}
