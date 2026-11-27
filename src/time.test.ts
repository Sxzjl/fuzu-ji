import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatHistoryDate,
  formatHomeDate,
  isRealDateKey,
  shanghaiDateKey,
  shiftDateKey,
} from "./time.ts";

describe("Asia/Shanghai dates", () => {
  it("uses the Shanghai calendar day, including after UTC midnight", () => {
    expect(shanghaiDateKey(new Date("2026-11-26T15:59:00.000Z"))).toBe("2026-11-26");
    expect(shanghaiDateKey(new Date("2026-11-26T16:30:00.000Z"))).toBe("2026-11-27");
  });

  it("formats the home date in Chinese", () => {
    expect(formatHomeDate("2026-11-26")).toBe("11月26日 星期四");
  });

  it("labels today and yesterday, and keeps the year when it changes", () => {
    expect(formatHistoryDate("2026-11-26", "2026-11-26")).toBe("今天 · 11月26日 星期四");
    expect(formatHistoryDate("2026-11-25", "2026-11-26")).toBe("昨天 · 11月25日 星期三");
    expect(formatHistoryDate("2025-12-31", "2026-11-26")).toBe("2025年12月31日 星期三");
  });

  it("shifts calendar days across months and leap years", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("rejects impossible dates", () => {
    expect(isRealDateKey("2026-02-31")).toBe(false);
    expect(isRealDateKey("2026-11-26")).toBe(true);
  });

  it("formats the clock in Shanghai", () => {
    expect(formatClock("2026-11-26T16:30:00.000Z")).toBe("00:30");
  });
});
