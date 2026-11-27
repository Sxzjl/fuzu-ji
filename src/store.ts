import { parseBackup, serializeBackup } from "./backup.ts";
import { emptyData, type AppData } from "./types.ts";

export const STORAGE_KEY = "fuzuji.v1";

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadData(storage: Pick<Storage, "getItem"> | null = browserStorage()): AppData {
  if (!storage) return emptyData();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = parseBackup(raw);
    if (!parsed.ok) return emptyData();
    return parsed.data;
  } catch {
    return emptyData();
  }
}

export function saveData(
  data: AppData,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeBackup(data));
    return true;
  } catch {
    return false;
  }
}
