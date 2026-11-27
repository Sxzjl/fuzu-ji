/** Calendar dates in 富足记 always use Asia/Shanghai, not the device zone. */
export const SHANGHAI = "Asia/Shanghai";

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

export function shanghaiDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("missing Shanghai date parts");
  }
  return `${year}-${month}-${day}`;
}

export function isRealDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function shiftDateKey(dateKey: string, days: number): string {
  if (!isRealDateKey(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  const nextYear = utc.getUTCFullYear();
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function weekdayIndex(dateKey: string): number {
  if (!isRealDateKey(dateKey)) return 0;
  const [year, month, day] = dateKey.split("-").map(Number);
  const instant = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 4, 0, 0));
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI,
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

export function formatHomeDate(dateKey: string): string {
  if (!isRealDateKey(dateKey)) return dateKey;
  const [, month, day] = dateKey.split("-");
  const weekday = WEEKDAYS[weekdayIndex(dateKey)] ?? "";
  return `${Number(month)}月${Number(day)}日 ${weekday}`;
}

export function formatHistoryDate(dateKey: string, todayKey: string): string {
  const body = formatHomeDate(dateKey);
  if (dateKey === todayKey) return `今天 · ${body}`;
  if (dateKey === shiftDateKey(todayKey, -1)) return `昨天 · ${body}`;
  const year = dateKey.slice(0, 4);
  if (year !== todayKey.slice(0, 4)) return `${year}年${body}`;
  return body;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SHANGHAI,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
