import { withReconciledAck } from "./scoring.ts";
import { shanghaiDateKey, isRealDateKey } from "./time.ts";
import {
  emptyData,
  emptyGoals,
  isCategoryId,
  isDelta,
  type AppData,
  type CategoryId,
  type Entry,
  type Goals,
} from "./types.ts";

const NOTE_LIMIT = 2000;

export type BackupResult = { ok: true; data: AppData } | { ok: false; error: string };

export function serializeBackup(data: AppData, exportedAt = new Date().toISOString()): string {
  return JSON.stringify(
    {
      app: "富足记",
      version: 1,
      exportedAt,
      welcomeDone: data.welcomeDone,
      milestoneAck: data.milestoneAck,
      goals: data.goals,
      entries: data.entries,
    },
    null,
    2,
  );
}

export function parseBackup(text: string): BackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "这份文件不是 JSON。" };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "这份备份读不出来。" };
  }
  const record = json as Record<string, unknown>;
  if (record.version !== 1) {
    return { ok: false, error: "这不是富足记的备份，或版本对不上。" };
  }
  if (!Array.isArray(record.entries)) {
    return { ok: false, error: "备份里没有记录列表。" };
  }
  if (record.entries.length > 50_000) {
    return { ok: false, error: "备份里的记录太多了。" };
  }

  const goals = readGoals(record.goals);
  if (!goals.ok) return goals;

  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < record.entries.length; index += 1) {
    const parsed = readEntry(record.entries[index], index);
    if (!parsed.ok) return parsed;
    let id = parsed.entry.id;
    while (seen.has(id)) {
      id = `${id}-${entries.length + 1}`;
    }
    seen.add(id);
    entries.push({ ...parsed.entry, id });
  }
  entries.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const welcomeDone = typeof record.welcomeDone === "boolean" ? record.welcomeDone : true;
  const milestoneAck = readAck(record.milestoneAck);
  const data = withReconciledAck({
    version: 1,
    entries,
    goals: goals.goals,
    welcomeDone,
    milestoneAck,
  });
  return { ok: true, data };
}

function readAck(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

function readGoals(value: unknown): { ok: true; goals: Goals } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, goals: emptyGoals() };
  }
  if (typeof value !== "object") {
    return { ok: false, error: "备份里的目标格式不对。" };
  }
  const record = value as Record<string, unknown>;
  const goals = emptyGoals();
  const ids: CategoryId[] = ["wealth", "health", "network", "growth"];
  for (const id of ids) {
    const raw = record[id];
    if (raw === undefined || raw === null) {
      goals[id] = null;
      continue;
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || !Number.isSafeInteger(raw)) {
      return { ok: false, error: "备份里的目标需要是整数，或留空。" };
    }
    goals[id] = raw;
  }
  return { ok: true, goals };
}

function readEntry(
  value: unknown,
  index: number,
): { ok: true; entry: Entry } | { ok: false; error: string } {
  const label = `第 ${index + 1} 笔记录`;
  if (!value || typeof value !== "object") {
    return { ok: false, error: `${label}格式不对，没有导入。` };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.category !== "string" || !isCategoryId(record.category)) {
    return { ok: false, error: `${label}的类别不对，没有导入。` };
  }
  if (typeof record.delta !== "number" || !isDelta(record.delta)) {
    return { ok: false, error: `${label}的点数不对，没有导入。每次只能是 +100、−100 或 0。` };
  }
  if (typeof record.createdAt !== "string" || Number.isNaN(new Date(record.createdAt).getTime())) {
    return { ok: false, error: `${label}的时间不对，没有导入。` };
  }
  const note = typeof record.note === "string" ? record.note.trim().slice(0, NOTE_LIMIT) : "";
  const dateKey =
    typeof record.dateKey === "string" && isRealDateKey(record.dateKey)
      ? record.dateKey
      : shanghaiDateKey(new Date(record.createdAt));
  const id =
    typeof record.id === "string" && record.id.trim() !== ""
      ? record.id.trim()
      : `imported-${index + 1}`;
  return {
    ok: true,
    entry: {
      id,
      category: record.category,
      note: note === "" ? "（空白）" : note,
      delta: record.delta,
      createdAt: new Date(record.createdAt).toISOString(),
      dateKey,
    },
  };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function freshData(): AppData {
  return emptyData();
}
