import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";

export interface MonthlyCollection {
  month: string;
  collectedSen: number;
}

/**
 * Calculates total approved payments for each calendar month of receivedAt in Malaysia time.
 * Includes all months in range [from, to] inclusive, with collectedSen: 0 for empty months.
 */
export async function getCollectionsReport(orgId: string, from: string, to: string): Promise<MonthlyCollection[]> {
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthRegex.test(from) || !monthRegex.test(to)) {
    throw new AuthError("from and to must be in YYYY-MM format", 400);
  }

  if (from > to) {
    throw new AuthError("from month cannot be after to month", 400);
  }

  // Generate complete list of months from `from` to `to`
  const months: string[] = [];
  const [fromY, fromM] = from.split("-").map(Number);
  const [toY, toM] = to.split("-").map(Number);

  let curY = fromY;
  let curM = fromM;

  while (curY < toY || (curY === toY && curM <= toM)) {
    const mStr = curM < 10 ? `0${curM}` : `${curM}`;
    months.push(`${curY}-${mStr}`);

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  // Fetch approved payments for the organization
  const payments = await prisma.payment.findMany({
    where: {
      orgId,
      status: "approved",
    },
  });

  // Aggregate in memory using Malaysia time (UTC+8)
  const collectionsByMonth = new Map<string, bigint>();
  for (const m of months) {
    collectionsByMonth.set(m, BigInt(0));
  }

  for (const p of payments) {
    // Add 8 hours for Malaysia time
    const msInUtc8 = new Date(p.receivedAt).getTime() + 8 * 3600 * 1000;
    const d = new Date(msInUtc8);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    const monthKey = `${y}-${mStr}`;

    if (collectionsByMonth.has(monthKey)) {
      const current = collectionsByMonth.get(monthKey)!;
      collectionsByMonth.set(monthKey, current + BigInt(p.amountSen));
    }
  }

  return months.map((m) => ({
    month: m,
    collectedSen: Number(collectionsByMonth.get(m)!),
  }));
}
