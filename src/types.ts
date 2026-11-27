export const CATEGORY_IDS = ["wealth", "health", "network", "growth"] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type Delta = 100 | -100 | 0;

export type TodayMood = "none" | "closer" | "farther" | "still";

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  realm: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { id: "wealth", name: "财富积分", realm: "事业" },
  { id: "health", name: "健康积分", realm: "健康" },
  { id: "network", name: "人脉积分", realm: "人际" },
  { id: "growth", name: "成长积分", realm: "个人" },
];

export interface Entry {
  id: string;
  category: CategoryId;
  note: string;
  delta: Delta;
  createdAt: string;
  dateKey: string;
}

export type Goals = Record<CategoryId, number | null>;

export interface AppData {
  version: 1;
  entries: Entry[];
  goals: Goals;
  welcomeDone: boolean;
  milestoneAck: number;
}

export function emptyGoals(): Goals {
  return {
    wealth: null,
    health: null,
    network: null,
    growth: null,
  };
}

export function emptyData(): AppData {
  return {
    version: 1,
    entries: [],
    goals: emptyGoals(),
    welcomeDone: false,
    milestoneAck: 0,
  };
}

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

export function categoryMeta(id: CategoryId): CategoryMeta {
  const found = CATEGORIES.find((category) => category.id === id);
  if (!found) {
    throw new Error(`unknown category: ${id}`);
  }
  return found;
}

export function isDelta(value: number): value is Delta {
  return value === 100 || value === -100 || value === 0;
}
