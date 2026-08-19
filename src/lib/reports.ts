import { addDays, endOfDay, format, startOfDay, subDays, subMonths } from "date-fns";

export type ReportPreset = "7d" | "30d" | "3m" | "6m" | "12m";
export type DatedAmount = { date: Date; amount: number };

export function presetRange(preset: string | undefined, now = new Date()) {
  const safe: ReportPreset = ["7d", "30d", "3m", "6m", "12m"].includes(preset ?? "") ? preset as ReportPreset : "30d";
  const to = endOfDay(now);
  const from = safe === "7d" ? subDays(startOfDay(now), 6) : safe === "30d" ? subDays(startOfDay(now), 29) : subMonths(startOfDay(now), Number(safe.slice(0, -1)));
  return { preset: safe, from, to };
}

export function customRange(from: string | undefined, to: string | undefined, now = new Date()) {
  const fallback = presetRange("30d", now);
  const parsedFrom = from ? new Date(`${from}T00:00:00`) : fallback.from;
  const parsedTo = to ? new Date(`${to}T23:59:59.999`) : fallback.to;
  if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime()) || parsedFrom > parsedTo) return fallback;
  return { from: parsedFrom, to: parsedTo };
}

export function sumAmounts(rows: DatedAmount[], from: Date, to: Date) {
  return rows.filter(row => row.date >= from && row.date <= to).reduce((sum, row) => sum + row.amount, 0);
}

export function dailyMoneySeries(rows: DatedAmount[], from: Date, to: Date) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.date < from || row.date > to) continue;
    const key = format(row.date, "yyyy-MM-dd");
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }
  const result: { date: string; value: number }[] = [];
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const key = format(day, "yyyy-MM-dd");
    result.push({ date: key, value: totals.get(key) ?? 0 });
  }
  return result;
}

export function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}
