import { describe, expect, it } from "vitest";
import { parseBackup, serializeBackup } from "./backup.ts";
import { loadData, saveData, STORAGE_KEY } from "./store.ts";
import { emptyData, type AppData } from "./types.ts";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("backup", () => {
  it("round-trips entries, goals, and a negative total", () => {
    const data: AppData = {
      ...emptyData(),
      welcomeDone: true,
      milestoneAck: 10_000,
      goals: { wealth: 10000, health: null, network: 0, growth: null },
      entries: [
        {
          id: "1",
          category: "wealth",
          note: "见了一个客户",
          delta: 100,
          createdAt: "2026-11-26T02:00:00.000Z",
          dateKey: "2026-11-26",
        },
        {
          id: "2",
          category: "health",
          note: "熬夜",
          delta: -100,
          createdAt: "2026-11-26T14:00:00.000Z",
          dateKey: "2026-11-26",
        },
      ],
    };
    const parsed = parseBackup(serializeBackup(data, "2026-11-26T00:00:00.000Z"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.goals).toEqual(data.goals);
    expect(parsed.data.entries).toEqual(data.entries);
    expect(parsed.data.milestoneAck).toBe(0);
  });

  it("rejects a file that is not this app's backup or uses a point value other than 100", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ version: 2, entries: [] })).ok).toBe(false);
    const bad = parseBackup(
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: "1",
            category: "wealth",
            note: "不行",
            delta: 50,
            createdAt: "2026-11-26T02:00:00.000Z",
            dateKey: "2026-11-26",
          },
        ],
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it("derives the Shanghai day when the backup has no date key", () => {
    const parsed = parseBackup(
      JSON.stringify({
        version: 1,
        entries: [
          {
            category: "growth",
            note: "读完一章",
            delta: 0,
            createdAt: "2026-11-26T16:30:00.000Z",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.entries[0]?.dateKey).toBe("2026-11-27");
    expect(parsed.data.entries[0]?.delta).toBe(0);
  });

  it("keeps both notes when ids collide", () => {
    const parsed = parseBackup(
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: "same",
            category: "network",
            note: "第一件",
            delta: 100,
            createdAt: "2026-11-26T02:00:00.000Z",
            dateKey: "2026-11-26",
          },
          {
            id: "same",
            category: "network",
            note: "第二件",
            delta: -100,
            createdAt: "2026-11-26T03:00:00.000Z",
            dateKey: "2026-11-26",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.entries).toHaveLength(2);
    expect(parsed.data.entries.map((entry) => entry.note)).toEqual(["第一件", "第二件"]);
  });
});

describe("local persistence", () => {
  it("reloads entries and goals after a save", () => {
    const storage = memory();
    const data: AppData = {
      ...emptyData(),
      welcomeDone: true,
      goals: { wealth: 500, health: null, network: null, growth: null },
      entries: [
        {
          id: "kept",
          category: "wealth",
          note: "还在",
          delta: -100,
          createdAt: "2026-11-26T02:00:00.000Z",
          dateKey: "2026-11-26",
        },
      ],
    };
    expect(saveData(data, storage)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toContain("还在");
    const loaded = loadData(storage);
    expect(loaded.entries).toEqual(data.entries);
    expect(loaded.goals.wealth).toBe(500);
    expect(loaded.welcomeDone).toBe(true);
  });
});
