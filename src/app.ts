import { createId, freshData, parseBackup, serializeBackup } from "./backup.ts";
import { formatDelta, goalsFromDraft, pendingMilestone, totalFor, withReconciledAck } from "./scoring.ts";
import { saveData, loadData } from "./store.ts";
import { shanghaiDateKey } from "./time.ts";
import { CATEGORY_IDS, categoryMeta, isCategoryId, type AppData, type CategoryId, type Delta } from "./types.ts";
import {
  createUi,
  goalDraftFrom,
  renderApp,
  type HistoryFilter,
  type ViewName,
} from "./view.ts";

export function startApp(root: HTMLElement): void {
  const loaded = loadData();
  let data = withReconciledAck(loaded);
  if (data.milestoneAck !== loaded.milestoneAck) {
    saveData(data);
  }
  const ui = createUi(new Date());
  ui.view = data.welcomeDone ? "home" : "welcome";
  ui.goalDraft = goalDraftFrom(data);

  const paint = (scroll = false) => {
    root.classList.toggle("with-tabs", ui.view !== "welcome");
    root.innerHTML = renderApp(data, ui);
    if (scroll) root.querySelector(".main")?.scrollTo(0, 0);
    if (ui.view === "home") {
      requestAnimationFrame(() => placePager(ui.homeIndex, false));
    }
  };

  const placePager = (index: number, smooth: boolean) => {
    const pager = root.querySelector<HTMLElement>(".pager");
    if (!pager || pager.clientWidth <= 0) return;
    const left = pager.clientWidth * index;
    if (Math.abs(pager.scrollLeft - left) < 2) return;
    pager.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  };

  const markDots = (index: number) => {
    root.querySelectorAll<HTMLElement>("[data-action='home-go']").forEach((dot) => {
      const on = Number(dot.dataset.index) === index;
      dot.classList.toggle("is-on", on);
      dot.setAttribute("aria-current", on ? "true" : "false");
    });
  };

  const persist = (): boolean => {
    data = withReconciledAck(data);
    return saveData(data);
  };

  const go = (view: ViewName) => {
    ui.view = view;
    ui.message = null;
    ui.logError = null;
    ui.deleteId = null;
    ui.confirmClear = false;
    if (view !== "settings") {
      ui.importPreview = null;
      ui.importError = null;
    }
    if (view === "settings" || view === "welcome") {
      ui.goalDraft = goalDraftFrom(data);
      ui.goalError = null;
    }
    ui.now = new Date();
    paint(true);
  };

  const applyGoals = (goals: AppData["goals"], doneMessage: string) => {
    const previous = data;
    data = { ...data, goals, welcomeDone: true };
    if (!persist()) {
      data = previous;
      ui.goalError = "没有保存。这台设备的存储可能满了，或浏览器禁止了本地存储。";
      paint();
      return;
    }
    ui.goalError = null;
    ui.goalDraft = goalDraftFrom(data);
    ui.message = doneMessage || null;
    ui.view = ui.view === "welcome" ? "home" : ui.view;
    paint(ui.view === "home");
  };

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "go") {
      const view = el.dataset.view;
      if (view === "log" && ui.view === "home") {
        const current = CATEGORY_IDS[ui.homeIndex];
        if (current) ui.category = current;
      }
      if (isView(view)) go(view);
      return;
    }
    if (action === "home-go") {
      const index = Number(el.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= CATEGORY_IDS.length) return;
      ui.homeIndex = index;
      placePager(index, true);
      markDots(index);
      return;
    }
    if (action === "pick-category") {
      const category = el.dataset.category;
      if (category && isCategoryId(category)) {
        ui.category = category;
        ui.logError = null;
        paint();
      }
      return;
    }
    if (action === "delta") {
      const delta = readDelta(el.dataset.delta);
      if (delta !== null) {
        ui.delta = delta;
        ui.logError = null;
        paint();
      }
      return;
    }
    if (action === "save-entry") {
      saveEntry();
      return;
    }
    if (action === "filter") {
      const filter = el.dataset.filter;
      if (isFilter(filter)) {
        ui.filter = filter;
        ui.deleteId = null;
        paint(true);
      }
      return;
    }
    if (action === "ask-delete") {
      ui.deleteId = el.dataset.id ?? null;
      paint();
      return;
    }
    if (action === "cancel-delete") {
      ui.deleteId = null;
      paint();
      return;
    }
    if (action === "confirm-delete") {
      const id = el.dataset.id;
      if (!id) return;
      const previous = data;
      data = { ...data, entries: data.entries.filter((entry) => entry.id !== id) };
      if (!persist()) {
        data = previous;
        ui.message = "没有删掉。这台设备的存储可能满了。";
        paint();
        return;
      }
      ui.deleteId = null;
      ui.message = "已删除这一笔";
      paint();
      return;
    }
    if (action === "save-goals") {
      const parsed = goalsFromDraft(ui.goalDraft);
      if (!parsed.ok) {
        ui.goalError = parsed.error;
        paint();
        return;
      }
      applyGoals(parsed.goals, "目标已保存");
      return;
    }
    if (action === "welcome-start") {
      const parsed = goalsFromDraft(ui.goalDraft);
      if (!parsed.ok) {
        ui.goalError = parsed.error;
        paint();
        return;
      }
      applyGoals(parsed.goals, "");
      return;
    }
    if (action === "welcome-skip") {
      data = { ...data, welcomeDone: true };
      if (!persist()) {
        ui.goalError = "没有保存。这台设备的存储可能满了，或浏览器禁止了本地存储。";
        paint();
        return;
      }
      ui.view = "home";
      ui.goalError = null;
      ui.message = null;
      paint(true);
      return;
    }
    if (action === "dismiss-milestone") {
      const milestone = pendingMilestone(totalFor(data.entries, "wealth"), data.milestoneAck);
      if (milestone) {
        data = { ...data, milestoneAck: milestone.points };
        persist();
      }
      paint();
      return;
    }
    if (action === "export") {
      downloadBackup(data);
      ui.message = "已开始下载备份";
      paint();
      return;
    }
    if (action === "import-pick") {
      root.querySelector<HTMLInputElement>("#import-file")?.click();
      return;
    }
    if (action === "cancel-import") {
      ui.importPreview = null;
      ui.importError = null;
      paint();
      return;
    }
    if (action === "confirm-import") {
      if (!ui.importPreview) return;
      data = { ...ui.importPreview, welcomeDone: true };
      data = withReconciledAck(data);
      if (!persist()) {
        ui.importError = "没有导入。这台设备的存储可能满了。";
        paint();
        return;
      }
      const count = data.entries.length;
      ui.importPreview = null;
      ui.importError = null;
      ui.confirmClear = false;
      ui.goalDraft = goalDraftFrom(data);
      ui.view = "home";
      ui.message = `已导入 ${count} 笔记录`;
      paint(true);
      return;
    }
    if (action === "ask-clear") {
      ui.confirmClear = true;
      ui.importPreview = null;
      paint();
      return;
    }
    if (action === "cancel-clear") {
      ui.confirmClear = false;
      paint();
      return;
    }
    if (action === "confirm-clear") {
      data = { ...freshData(), welcomeDone: true };
      if (!persist()) {
        ui.message = "没有清空。这台设备的存储可能满了。";
        paint();
        return;
      }
      ui.confirmClear = false;
      ui.goalDraft = goalDraftFrom(data);
      ui.message = "已清空这台设备上的记录";
      paint();
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.dataset.field === "note") {
      ui.note = target.value;
      if (ui.logError) {
        ui.logError = null;
        const node = root.querySelector("#log-error");
        if (node) node.textContent = "";
      }
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.goal && isCategoryId(target.dataset.goal)) {
      ui.goalDraft[target.dataset.goal] = target.value;
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.field !== "import") return;
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        ui.importError = parsed.error;
        ui.importPreview = null;
        paint();
        return;
      }
      ui.importPreview = parsed.data;
      ui.importError = null;
      ui.confirmClear = false;
      paint();
    };
    reader.onerror = () => {
      ui.importError = "这份文件读不出来。";
      ui.importPreview = null;
      paint();
    };
    reader.readAsText(file);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const next = new Date();
    const changed = shanghaiDateKey(ui.now) !== shanghaiDateKey(next);
    ui.now = next;
    if (changed) paint();
  });

  function saveEntry(): void {
    if (!ui.category) {
      ui.logError = "先选一类。";
      paint();
      return;
    }
    const note = ui.note.trim();
    if (!note) {
      ui.logError = "写一句就好。";
      paint();
      return;
    }
    if (ui.delta === null) {
      ui.logError = "选一下：近了、远了，或原地踏步。";
      paint();
      return;
    }
    const now = new Date();
    const category: CategoryId = ui.category;
    const delta: Delta = ui.delta;
    data = {
      ...data,
      welcomeDone: true,
      entries: [
        ...data.entries,
        {
          id: createId(),
          category,
          note: note.slice(0, 160),
          delta,
          createdAt: now.toISOString(),
          dateKey: shanghaiDateKey(now),
        },
      ],
    };
    if (!persist()) {
      data = {
        ...data,
        entries: data.entries.slice(0, -1),
      };
      ui.logError = "没有写进去。这台设备的存储可能满了，或浏览器禁止了本地存储。";
      paint();
      return;
    }
    ui.now = now;
    ui.note = "";
    ui.delta = null;
    ui.category = null;
    ui.logError = null;
    ui.homeIndex = Math.max(0, CATEGORY_IDS.indexOf(category));
    ui.view = "home";
    ui.message = `已记下 · ${categoryMeta(category).name} ${formatDelta(delta)}`;
    paint(true);
  }

  root.addEventListener(
    "scroll",
    (event) => {
      const pager = event.target;
      if (!(pager instanceof HTMLElement) || !pager.classList.contains("pager")) return;
      const width = pager.clientWidth;
      if (width <= 0) return;
      const index = Math.max(0, Math.min(CATEGORY_IDS.length - 1, Math.round(pager.scrollLeft / width)));
      ui.homeIndex = index;
      markDots(index);
    },
    true,
  );

  root.addEventListener("keydown", (event) => {
    if (ui.view !== "home") return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const next = ui.homeIndex + (event.key === "ArrowRight" ? 1 : -1);
    if (next < 0 || next >= CATEGORY_IDS.length) return;
    event.preventDefault();
    ui.homeIndex = next;
    placePager(next, true);
    markDots(next);
  });

  window.addEventListener("resize", () => {
    if (ui.view !== "home") return;
    placePager(ui.homeIndex, false);
  });

  let drag: { pointerId: number; x: number; left: number; moved: boolean } | null = null;

  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    const pager = event.target instanceof Element ? event.target.closest(".pager") : null;
    if (!(pager instanceof HTMLElement)) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, left: pager.scrollLeft, moved: false };
    pager.setPointerCapture(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pager = root.querySelector<HTMLElement>(".pager");
    if (!pager) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    drag.moved = true;
    pager.classList.add("is-dragging");
    pager.scrollLeft = drag.left - dx;
    event.preventDefault();
  });

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    const pager = root.querySelector<HTMLElement>(".pager");
    pager?.classList.remove("is-dragging");
    if (!moved || !pager || pager.clientWidth <= 0) return;
    const index = Math.max(
      0,
      Math.min(CATEGORY_IDS.length - 1, Math.round(pager.scrollLeft / pager.clientWidth)),
    );
    ui.homeIndex = index;
    placePager(index, true);
    markDots(index);
  };

  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  paint();
}

function isView(value: string | undefined): value is ViewName {
  return value === "home" || value === "log" || value === "history" || value === "settings" || value === "welcome";
}

function isFilter(value: string | undefined): value is HistoryFilter {
  return value === "all" || (value !== undefined && isCategoryId(value));
}

function readDelta(value: string | undefined): Delta | null {
  if (value === "100") return 100;
  if (value === "-100") return -100;
  if (value === "0") return 0;
  return null;
}

function downloadBackup(data: AppData): void {
  const today = shanghaiDateKey(new Date());
  const blob = new Blob([serializeBackup(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `富足记-备份-${today}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
