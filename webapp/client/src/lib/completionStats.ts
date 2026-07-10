import type { CompletionEntry } from './api';

export type RangeKey = '30' | '90' | '365' | 'all';

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '1 year', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const MONTH_DAY = { month: 'short', day: 'numeric' } as const;
const FULL_DATE = { month: 'short', day: 'numeric', year: 'numeric' } as const;

function keyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString(undefined, MONTH_DAY);
}

function fullLabel(d: Date): string {
  return d.toLocaleDateString(undefined, FULL_DATE);
}

export interface ChartPoint {
  label: string;
  fullLabel: string;
  value: number;
}

export interface CompletionSummary {
  cumulative: ChartPoint[];
  activity: ChartPoint[];
  solvedInRange: number;
  bestDay: { label: string; count: number } | null;
}

/** Buckets completion entries into a cumulative trend and an activity (per-day/week) series for the given range. */
export function summarizeCompletions(
  entries: CompletionEntry[],
  untrackedSolved: number,
  range: RangeKey
): CompletionSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDay = new Map<string, number>();
  for (const e of entries) {
    const k = keyOf(new Date(e.solvedAt));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }

  const firstEntryDate = entries.length ? new Date(new Date(entries[0].solvedAt).setHours(0, 0, 0, 0)) : today;
  const rangeOpt = RANGE_OPTIONS.find((r) => r.key === range);
  const windowStart = rangeOpt?.days != null ? addDays(today, -(rangeOpt.days - 1)) : firstEntryDate;
  const start = windowStart < firstEntryDate ? firstEntryDate : windowStart;

  // Everything solved strictly before the window start — including untracked-date solves —
  // carries forward as the cumulative baseline so the line never resets to 0 on a zoomed range.
  let baseline = untrackedSolved;
  for (const [k, c] of byDay) {
    if (new Date(`${k}T00:00:00`) < start) baseline += c;
  }

  const totalDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);

  const daily: { date: Date; count: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    daily.push({ date, count: byDay.get(keyOf(date)) ?? 0 });
  }

  let running = baseline;
  const cumulative: ChartPoint[] = daily.map((d) => {
    running += d.count;
    return { label: shortLabel(d.date), fullLabel: fullLabel(d.date), value: running };
  });

  // Daily bars stay readable up to ~60 points; beyond that, aggregate by week.
  const useWeekly = daily.length > 60;
  let activity: ChartPoint[];
  if (!useWeekly) {
    activity = daily.map((d) => ({ label: shortLabel(d.date), fullLabel: fullLabel(d.date), value: d.count }));
  } else {
    const weeks = new Map<string, { start: Date; count: number }>();
    for (const d of daily) {
      const weekStart = addDays(d.date, -d.date.getDay());
      const wk = keyOf(weekStart);
      const bucket = weeks.get(wk) ?? { start: weekStart, count: 0 };
      bucket.count += d.count;
      weeks.set(wk, bucket);
    }
    activity = [...weeks.values()]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((w) => ({ label: shortLabel(w.start), fullLabel: `Week of ${fullLabel(w.start)}`, value: w.count }));
  }

  const solvedInRange = daily.reduce((sum, d) => sum + d.count, 0);
  const bestDay = daily.reduce<{ label: string; count: number } | null>((best, d) => {
    if (d.count === 0) return best;
    if (!best || d.count > best.count) return { label: fullLabel(d.date), count: d.count };
    return best;
  }, null);

  return { cumulative, activity, solvedInRange, bestDay };
}
