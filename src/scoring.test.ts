import { describe, expect, it } from "vitest";
import {
  energyPicture,
  formatDelta,
  formatPoints,
  gapLabel,
  goalGap,
  goalsFromDraft,
  groupByDate,
  highestMilestone,
  parseGoalField,
  pendingMilestone,
  reconcileMilestoneAck,
  todayMood,
  todaySummary,
  totalFor,
  withReconciledAck,
} from "./scoring.ts";
import { emptyData, type Entry } from "./types.ts";

function entry(partial: Partial<Entry> & Pick<Entry, "category" | "delta" | "dateKey">): Entry {
  return {
    id: partial.id ?? `${partial.category}-${partial.dateKey}-${partial.delta}`,
    note: partial.note ?? "一件事",
    createdAt: partial.createdAt ?? `${partial.dateKey}T02:00:00.000Z`,
    category: partial.category,
    delta: partial.delta,
    dateKey: partial.dateKey,
  };
}

describe("points", () => {
  it("sums every entry, including several on the same day, and allows negatives", () => {
    const entries = [
      entry({ id: "a", category: "wealth", delta: 100, dateKey: "2026-11-26" }),
      entry({ id: "b", category: "wealth", delta: 100, dateKey: "2026-11-26" }),
      entry({ id: "c", category: "wealth", delta: -100, dateKey: "2026-11-26" }),
      entry({ id: "d", category: "health", delta: -100, dateKey: "2026-11-26" }),
    ];
    expect(totalFor(entries, "wealth")).toBe(100);
    expect(totalFor(entries, "health")).toBe(-100);
    expect(totalFor(entries, "network")).toBe(0);
    expect(totalFor(entries)).toBe(0);
  });

  it("formats positives, negatives, and zero in steps that stay readable", () => {
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(100)).toBe("100");
    expect(formatPoints(-1200)).toBe("−1,200");
    expect(formatDelta(100)).toBe("+100");
    expect(formatDelta(-100)).toBe("−100");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(10000)).toBe("+10,000");
  });
});

describe("today", () => {
  it("distinguishes not logged, closer, farther, and standing still", () => {
    expect(todayMood([])).toBe("none");
    expect(todaySummary("none", 0)).toBe("今天还没记");

    const closer = [entry({ category: "growth", delta: 100, dateKey: "2026-11-26" })];
    expect(todayMood(closer)).toBe("closer");
    expect(todaySummary("closer", 200)).toBe("今天离目标近了 +200");

    const farther = [entry({ category: "health", delta: -100, dateKey: "2026-11-26" })];
    expect(todayMood(farther)).toBe("farther");
    expect(todaySummary("farther", -100)).toBe("今天离目标远了 −100");

    const still = [
      entry({ id: "1", category: "wealth", delta: 100, dateKey: "2026-11-26" }),
      entry({ id: "2", category: "wealth", delta: -100, dateKey: "2026-11-26" }),
    ];
    expect(todayMood(still)).toBe("still");
    expect(todaySummary("still", 0)).toBe("今天原地踏步");
  });
});

describe("goals", () => {
  it("treats a goal as optional and reports remaining, reached, or past", () => {
    expect(goalGap(100, null)).toEqual({ kind: "unset" });
    expect(gapLabel(100, null)).toBeNull();
    expect(gapLabel(100, 1000)).toBe("目标 1,000 · 还差 900");
    expect(gapLabel(-200, 0)).toBe("目标 0 · 还差 200");
    expect(gapLabel(1000, 1000)).toBe("目标 1,000 · 已经到达");
    expect(gapLabel(1200, 1000)).toBe("目标 1,000 · 已超过 200");
  });

  it("draws an energy bar only toward a real goal, and never for a deficit", () => {
    expect(energyPicture(3_200, 10_000)).toEqual({
      mode: "progress",
      percent: 32,
      label: "3,200 / 10,000",
    });
    expect(energyPicture(10_000, 10_000).percent).toBe(100);
    expect(energyPicture(12_000, 10_000)).toMatchObject({ mode: "progress", percent: 100, label: "12,000 / 10,000" });
    expect(energyPicture(0, 10_000)).toEqual({ mode: "progress", percent: 0, label: "0 / 10,000" });
    expect(energyPicture(500, null)).toEqual({ mode: "unset", percent: 0, label: "还没设目标" });
    expect(energyPicture(-100, 10_000)).toEqual({ mode: "deficit", percent: 0, label: "目标 10,000" });
    expect(energyPicture(-100, null)).toEqual({ mode: "deficit", percent: 0, label: "" });
  });

  it("accepts an empty goal, fullwidth digits, and rejects words", () => {
    expect(parseGoalField("")).toEqual({ ok: true, value: null });
    expect(parseGoalField("  １０,０００ ")).toEqual({ ok: true, value: 10000 });
    expect(parseGoalField("不是数字").ok).toBe(false);
    const parsed = goalsFromDraft({
      wealth: "10000",
      health: "",
      network: "0",
      growth: "abc",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("wealth milestones", () => {
  it("recognizes the four thresholds and nothing in between", () => {
    expect(highestMilestone(9_999)).toBeNull();
    expect(highestMilestone(10_000)?.title).toBe("万元户");
    expect(highestMilestone(99_999)?.title).toBe("万元户");
    expect(highestMilestone(100_000)?.title).toBe("积蓄十万");
    expect(highestMilestone(1_000_000)?.title).toBe("百万富翁");
    expect(highestMilestone(10_000_000)?.title).toBe("千万富翁");
  });

  it("asks once when a threshold is crossed, and again only after falling below it", () => {
    expect(pendingMilestone(10_000, 0)?.title).toBe("万元户");
    expect(pendingMilestone(10_000, 10_000)).toBeNull();
    expect(pendingMilestone(1_000_000, 10_000)?.title).toBe("百万富翁");
    expect(reconcileMilestoneAck(0, 1_000_000)).toBe(0);
    expect(reconcileMilestoneAck(50_000, 1_000_000)).toBe(10_000);
    const dropped = withReconciledAck({
      ...emptyData(),
      milestoneAck: 10_000_000,
      entries: [],
    });
    expect(dropped.milestoneAck).toBe(0);
  });
});

describe("history groups", () => {
  it("lists newer days first and can filter by category", () => {
    const entries = [
      entry({
        id: "old",
        category: "wealth",
        delta: 100,
        dateKey: "2026-11-25",
        createdAt: "2026-11-25T01:00:00.000Z",
      }),
      entry({
        id: "new-late",
        category: "health",
        delta: -100,
        dateKey: "2026-11-26",
        createdAt: "2026-11-26T08:00:00.000Z",
      }),
      entry({
        id: "new-early",
        category: "wealth",
        delta: 0,
        dateKey: "2026-11-26",
        createdAt: "2026-11-26T02:00:00.000Z",
      }),
    ];
    const groups = groupByDate(entries, "all");
    expect(groups.map((group) => group.dateKey)).toEqual(["2026-11-26", "2026-11-25"]);
    expect(groups[0]?.entries.map((item) => item.id)).toEqual(["new-late", "new-early"]);
    expect(groupByDate(entries, "health")).toHaveLength(1);
    expect(groupByDate(entries, "network")).toHaveLength(0);
  });
});
