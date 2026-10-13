/** YYYY-MM helpers for dashboard date filters. */

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return currentMonthKey(d);
}

export function monthRange(monthKey: string | null | undefined): {
  dateFrom?: string;
  dateTo?: string;
  label: string;
} {
  if (!monthKey || monthKey === "all") {
    return { label: "All time" };
  }
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return monthRange(currentMonthKey());
  }
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateFrom = `${monthKey}-01`;
  const dateTo = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { dateFrom, dateTo, label };
}

export function normalizeMonthParam(raw: string | undefined): string {
  if (!raw || raw === "all") return "all";
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return currentMonthKey();
}
