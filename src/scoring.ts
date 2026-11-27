import type { AppData, CategoryId, Entry, Goals, TodayMood } from "./types.ts";
import { emptyGoals } from "./types.ts";

export const MINUS = "−";

export interface WealthMilestone {
  points: number;
  title: string;
  banner: string;
}

export const WEALTH_MILESTONES: readonly WealthMilestone[] = [
  {
    points: 10_000,
    title: "万元户",
    banner: "财富积分跨过一万，到了「万元户」。",
  },
  {
    points: 100_000,
    title: "积蓄十万",
    banner: "财富积分跨过十万。",
  },
  {
    points: 1_000_000,
    title: "百万富翁",
    banner: "财富积分跨过一百万，到了「百万富翁」。",
  },
  {
    points: 10_000_000,
    title: "千万富翁",
    banner: "财富积分跨过一千万，到了「千万富翁」。",
  },
];

export type GoalGap =
  | { kind: "unset" }
  | { kind: "remaining"; amount: number }
  | { kind: "reached" }
  | { kind: "past"; amount: number };

export interface DateGroup {
  dateKey: string;
  entries: Entry[];
}

const GOAL_LIMIT = 100_000_000_000;

export function totalFor(entries: readonly Entry[], category?: CategoryId): number {
  let sum = 0;
  for (const entry of entries) {
    if (category && entry.category !== category) continue;
    sum += entry.delta;
  }
  return sum;
}

export function entriesOn(
  entries: readonly Entry[],
  dateKey: string,
  category?: CategoryId,
): Entry[] {
  return entries.filter(
    (entry) => entry.dateKey === dateKey && (!category || entry.category === category),
  );
}

export function todayMood(entries: readonly Entry[]): TodayMood {
  if (entries.length === 0) return "none";
  const net = totalFor(entries);
  if (net > 0) return "closer";
  if (net < 0) return "farther";
  return "still";
}

export function goalGap(total: number, goal: number | null): GoalGap {
  if (goal === null) return { kind: "unset" };
  const diff = goal - total;
  if (diff > 0) return { kind: "remaining", amount: diff };
  if (diff < 0) return { kind: "past", amount: -diff };
  return { kind: "reached" };
}

export function formatPoints(value: number): string {
  const abs = Math.abs(Math.trunc(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (value < 0) return `${MINUS}${abs}`;
  return abs;
}

export function formatDelta(value: number): string {
  if (value > 0) return `+${formatPoints(value)}`;
  return formatPoints(value);
}

export function todaySummary(mood: TodayMood, net: number): string {
  switch (mood) {
    case "none":
      return "今天还没记";
    case "closer":
      return `今天离目标近了 ${formatDelta(net)}`;
    case "farther":
      return `今天离目标远了 ${formatDelta(net)}`;
    case "still":
      return "今天原地踏步";
  }
}

export function gapLabel(total: number, goal: number | null): string | null {
  const gap = goalGap(total, goal);
  if (gap.kind === "unset") return null;
  const target = `目标 ${formatPoints(goal ?? 0)}`;
  switch (gap.kind) {
    case "remaining":
      return `${target} · 还差 ${formatPoints(gap.amount)}`;
    case "reached":
      return `${target} · 已经到达`;
    case "past":
      return `${target} · 已超过 ${formatPoints(gap.amount)}`;
  }
}

export type EnergyMode = "unset" | "deficit" | "progress";

/** How the home energy bar should look. Below zero never fills as progress. */
export interface EnergyPicture {
  mode: EnergyMode;
  percent: number;
  label: string;
}

export function energyPicture(total: number, goal: number | null): EnergyPicture {
  if (total < 0) {
    return {
      mode: "deficit",
      percent: 0,
      label: goal === null ? "" : `目标 ${formatPoints(goal)}`,
    };
  }
  if (goal === null) {
    return { mode: "unset", percent: 0, label: "还没设目标" };
  }
  if (goal <= 0) {
    return {
      mode: "progress",
      percent: total >= goal ? 100 : 0,
      label: gapLabel(total, goal) ?? formatPoints(total),
    };
  }
  const percent = Math.round(Math.max(0, Math.min(1, total / goal)) * 100);
  return {
    mode: "progress",
    percent,
    label: `${formatPoints(total)} / ${formatPoints(goal)}`,
  };
}

export function highestMilestone(total: number): WealthMilestone | null {
  let found: WealthMilestone | null = null;
  for (const milestone of WEALTH_MILESTONES) {
    if (total >= milestone.points) found = milestone;
  }
  return found;
}

export function reconcileMilestoneAck(total: number, ack: number): number {
  const highest = highestMilestone(total)?.points ?? 0;
  if (!Number.isFinite(ack) || ack < 0) return 0;
  return Math.min(ack, highest);
}

export function pendingMilestone(total: number, ack: number): WealthMilestone | null {
  const milestone = highestMilestone(total);
  if (!milestone) return null;
  const effective = reconcileMilestoneAck(total, ack);
  return milestone.points > effective ? milestone : null;
}

export function withReconciledAck(data: AppData): AppData {
  const milestoneAck = reconcileMilestoneAck(totalFor(data.entries, "wealth"), data.milestoneAck);
  if (milestoneAck === data.milestoneAck) return data;
  return { ...data, milestoneAck };
}

export function groupByDate(
  entries: readonly Entry[],
  filter: "all" | CategoryId,
): DateGroup[] {
  const filtered = filter === "all" ? [...entries] : entries.filter((entry) => entry.category === filter);
  filtered.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  const groups: DateGroup[] = [];
  for (const entry of filtered) {
    const last = groups.at(-1);
    if (!last || last.dateKey !== entry.dateKey) {
      groups.push({ dateKey: entry.dateKey, entries: [entry] });
    } else {
      last.entries.push(entry);
    }
  }
  return groups;
}

export type GoalParse =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function parseGoalField(raw: string): GoalParse {
  const normalized = raw
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[，,\s]/g, "")
    .replace(/^−/, "-")
    .replace(/^－/, "-");
  if (normalized === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(normalized)) {
    return { ok: false, error: "请填整数，也可以留空。" };
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || Math.abs(value) > GOAL_LIMIT) {
    return { ok: false, error: "这个数字太大了。" };
  }
  return { ok: true, value };
}

export function goalsFromDraft(
  draft: Record<CategoryId, string>,
): { ok: true; goals: Goals } | { ok: false; error: string } {
  const goals = emptyGoals();
  const order: CategoryId[] = ["wealth", "health", "network", "growth"];
  const names: Record<CategoryId, string> = {
    wealth: "财富积分",
    health: "健康积分",
    network: "人脉积分",
    growth: "成长积分",
  };
  for (const id of order) {
    const parsed = parseGoalField(draft[id]);
    if (!parsed.ok) return { ok: false, error: `${names[id]}：${parsed.error}` };
    goals[id] = parsed.value;
  }
  return { ok: true, goals };
}

export function signOf(value: number): "pos" | "neg" | "zero" {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "zero";
}
