import { describe, expect, it } from "vitest";
import { emptyData, type AppData, type Entry } from "./types.ts";
import { createUi, renderApp } from "./view.ts";

const now = new Date("2026-11-26T04:00:00.000Z");

function data(partial: Partial<AppData> = {}): AppData {
  return {
    ...emptyData(),
    welcomeDone: true,
    ...partial,
    goals: { ...emptyData().goals, ...partial.goals },
    entries: partial.entries ?? [],
  };
}

function entry(
  partial: Partial<Entry> & Pick<Entry, "category" | "delta" | "dateKey" | "note">,
): Entry {
  return {
    id: partial.id ?? partial.note,
    createdAt: partial.createdAt ?? `${partial.dateKey}T04:00:00.000Z`,
    category: partial.category,
    delta: partial.delta,
    dateKey: partial.dateKey,
    note: partial.note,
  };
}

function sliceCategory(html: string, category: string): string {
  const start = html.indexOf(`data-category="${category}"`);
  const rest = html.slice(start + 1);
  const next = rest.indexOf('data-category="');
  return next === -1 ? html.slice(start) : html.slice(start, start + 1 + next);
}

describe("screens", () => {
  it("explains the first run and lets the goal step be skipped", () => {
    const ui = createUi(now);
    ui.view = "welcome";
    const html = renderApp(data({ welcomeDone: false }), ui);
    expect(html).toContain("先不设目标");
    expect(html).toContain("开始记");
    expect(html).not.toContain("主导航");
  });

  it("shows one swipeable picture per direction, with a way to log", () => {
    const html = renderApp(data(), createUi(now));
    expect(html).toContain('class="pager"');
    expect(html).not.toContain('class="cards"');
    expect(html).toContain("财富积分");
    expect(html).toContain("健康积分");
    expect(html).toContain("人脉积分");
    expect(html).toContain("成长积分");
    expect(html).toContain("今天还没记");
    expect(html).toContain("记一笔");
    expect(html).toContain("还没设目标");
    expect(html).toContain("11月26日 星期四");
    expect(html).toContain('data-mode="unset"');
  });

  it("fills an energy bar against a set goal and leaves a deficit empty", () => {
    const html = renderApp(
      data({
        goals: { wealth: 10_000, health: 5_000, network: null, growth: null },
        entries: [
          ...Array.from({ length: 32 }, (_, index) =>
            entry({
              id: `w${index}`,
              category: "wealth",
              delta: 100,
              dateKey: "2026-11-20",
              note: "累积",
            }),
          ),
          entry({ category: "health", delta: -100, dateKey: "2026-11-20", note: "亏了" }),
        ],
      }),
      createUi(now),
    );
    const wealth = sliceCategory(html, "wealth");
    const health = sliceCategory(html, "health");
    const network = sliceCategory(html, "network");
    expect(wealth).toContain("3,200");
    expect(wealth).toContain("3,200 / 10,000");
    expect(wealth).toContain('data-mode="progress"');
    expect(wealth).toContain("width: 32%");
    expect(health).toContain("−100");
    expect(health).toContain('data-mode="deficit"');
    expect(health).toContain("width: 0%");
    expect(health).not.toContain("width: 100%");
    expect(health).toContain("低于零，这段时间在远离这个目标。");
    expect(network).toContain("还没设目标");
    expect(network).toContain('data-mode="unset"');
    expect(network).not.toContain("10,000");
  });

  it("counts only Shanghai-today entries toward today, and shows a negative total plainly", () => {
    const html = renderApp(
      data({
        entries: [
          entry({
            category: "wealth",
            delta: 100,
            dateKey: "2026-11-25",
            note: "昨天的事",
          }),
          entry({
            category: "health",
            delta: -100,
            dateKey: "2026-11-26",
            note: "熬夜",
          }),
        ],
      }),
      createUi(now),
    );
    expect(html).toContain("今天离目标远了 −100");
    expect(html).toContain("今天还没记");
    expect(html).toContain("−100");
    expect(html).toContain("低于零，这段时间在远离这个目标。");
    expect(html).not.toContain("昨天的事");
  });

  it("shows optional goal distance and a quiet wealth milestone", () => {
    const entries = Array.from({ length: 100 }, (_, index) =>
      entry({
        id: `w${index}`,
        category: "wealth",
        delta: 100,
        dateKey: "2026-11-20",
        note: "累积",
      }),
    );
    const html = renderApp(
      data({
        goals: { wealth: 20000, health: null, network: null, growth: null },
        milestoneAck: 0,
        entries,
      }),
      createUi(now),
    );
    expect(html).toContain("目标 20,000 · 还差 10,000");
    expect(html).toContain("万元户");
    expect(html).toContain("财富积分跨过一万，到了「万元户」。");

    const seen = renderApp(
      data({
        milestoneAck: 10_000,
        entries,
      }),
      createUi(now),
    );
    expect(seen).toContain("万元户");
    expect(seen).not.toContain("财富积分跨过一万");
  });

  it("escapes notes and lists history newest day first", () => {
    const ui = createUi(now);
    ui.view = "history";
    const html = renderApp(
      data({
        entries: [
          entry({
            category: "network",
            delta: 0,
            dateKey: "2026-11-25",
            note: "<img src=x>",
            createdAt: "2026-11-25T02:00:00.000Z",
          }),
          entry({
            category: "growth",
            delta: 100,
            dateKey: "2026-11-26",
            note: "读完一章",
            createdAt: "2026-11-26T02:00:00.000Z",
          }),
        ],
      }),
      ui,
    );
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img src=x>");
    expect(html.indexOf("读完一章")).toBeLessThan(html.indexOf("&lt;img"));
    expect(html).toContain('data-sign="zero"');
  });

  it("offers the three point choices on the log screen", () => {
    const ui = createUi(now);
    ui.view = "log";
    const html = renderApp(data(), ui);
    expect(html).toContain("离目标近了");
    expect(html).toContain("离目标远了");
    expect(html).toContain("原地踏步");
    expect(html).toContain("+100");
    expect(html).toContain("−100");
  });
});
