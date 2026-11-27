import {
  energyPicture,
  entriesOn,
  formatDelta,
  formatPoints,
  gapLabel,
  groupByDate,
  highestMilestone,
  pendingMilestone,
  signOf,
  todayMood,
  todaySummary,
  totalFor,
} from "./scoring.ts";
import { formatClock, formatHistoryDate, formatHomeDate, shanghaiDateKey } from "./time.ts";
import {
  CATEGORIES,
  categoryMeta,
  type AppData,
  type CategoryId,
  type Delta,
} from "./types.ts";

export type ViewName = "welcome" | "home" | "log" | "history" | "settings";
export type HistoryFilter = "all" | CategoryId;

export interface UiState {
  view: ViewName;
  category: CategoryId | null;
  note: string;
  delta: Delta | null;
  filter: HistoryFilter;
  message: string | null;
  logError: string | null;
  goalError: string | null;
  deleteId: string | null;
  importPreview: AppData | null;
  importError: string | null;
  confirmClear: boolean;
  goalDraft: Record<CategoryId, string>;
  homeIndex: number;
  now: Date;
}

export function createUi(now = new Date()): UiState {
  return {
    view: "home",
    category: null,
    note: "",
    delta: null,
    filter: "all",
    message: null,
    logError: null,
    goalError: null,
    deleteId: null,
    importPreview: null,
    importError: null,
    confirmClear: false,
    goalDraft: { wealth: "", health: "", network: "", growth: "" },
    homeIndex: 0,
    now,
  };
}

export function goalDraftFrom(data: AppData): Record<CategoryId, string> {
  return {
    wealth: data.goals.wealth === null ? "" : String(data.goals.wealth),
    health: data.goals.health === null ? "" : String(data.goals.health),
    network: data.goals.network === null ? "" : String(data.goals.network),
    growth: data.goals.growth === null ? "" : String(data.goals.growth),
  };
}

export function renderApp(data: AppData, ui: UiState): string {
  const screen = renderScreen(data, ui);
  const tabs = ui.view === "welcome" ? "" : renderTabs(ui.view);
  return `${screen}${tabs}`;
}

function renderScreen(data: AppData, ui: UiState): string {
  switch (ui.view) {
    case "welcome":
      return renderWelcome(ui);
    case "home":
      return renderHome(data, ui);
    case "log":
      return renderLog(ui);
    case "history":
      return renderHistory(data, ui);
    case "settings":
      return renderSettings(ui);
  }
}

function renderWelcome(ui: UiState): string {
  return `
    <main class="main">
      <p class="brand">富足记</p>
      <h1 class="screen-title">先有个方向，<br />也可以直接开始记。</h1>
      <p class="lede">财富、健康、人脉、成长。每天写一句：近了 +100、远了 −100，或原地踏步。</p>
      <section class="block">
        <h2 class="section-title">四个目标，都可以以后再设</h2>
        <p class="help">留空也完全可以。点数和积分相同。</p>
        ${renderGoalFields(ui)}
        ${ui.goalError ? `<p class="form-error" role="alert">${esc(ui.goalError)}</p>` : ""}
        <div class="button-col">
          <button type="button" class="primary" data-action="welcome-start">开始记</button>
          <button type="button" class="quiet" data-action="welcome-skip">先不设目标</button>
        </div>
      </section>
    </main>
  `;
}

function renderHome(data: AppData, ui: UiState): string {
  const todayKey = shanghaiDateKey(ui.now);
  const todayEntries = entriesOn(data.entries, todayKey);
  const mood = todayMood(todayEntries);
  const net = totalFor(todayEntries);
  const wealthTotal = totalFor(data.entries, "wealth");
  const milestone = pendingMilestone(wealthTotal, data.milestoneAck);
  const banner = milestone
    ? `
      <div class="banner">
        <p>${esc(milestone.banner)}</p>
        <button type="button" class="quiet left" data-action="dismiss-milestone">知道了</button>
      </div>
    `
    : "";
  const slides = CATEGORIES.map((category) => renderSlide(data, todayKey, category.id)).join("");
  const dots = CATEGORIES.map((category, index) => {
    const on = index === ui.homeIndex;
    return `
      <button
        type="button"
        class="dot${on ? " is-on" : ""}"
        data-action="home-go"
        data-index="${index}"
        aria-label="${esc(category.name)}"
        aria-current="${on ? "true" : "false"}"
      ><span></span></button>
    `;
  }).join("");
  return `
    <main class="main home-main">
      <header class="home-head">
        <p class="brand">富足记</p>
        <h1 class="screen-title">${esc(formatHomeDate(todayKey))}</h1>
        <p class="today-line" data-mood="${mood}">${esc(todaySummary(mood, net))}</p>
      </header>
      ${ui.message ? `<p class="message" role="status">${esc(ui.message)}</p>` : ""}
      ${banner}
      <div class="pager" data-pager tabindex="0" aria-label="左右滑动，切换四个方向">
        ${slides}
      </div>
      <div class="home-foot">
        <div class="dots" role="tablist" aria-label="切换方向">${dots}</div>
        <button type="button" class="primary" data-action="go" data-view="log">记一笔</button>
      </div>
    </main>
  `;
}

function renderSlide(data: AppData, todayKey: string, category: CategoryId): string {
  const meta = categoryMeta(category);
  const total = totalFor(data.entries, category);
  const todayEntries = entriesOn(data.entries, todayKey, category);
  const mood = todayMood(todayEntries);
  const summary = todaySummary(mood, totalFor(todayEntries));
  const goal = data.goals[category];
  const picture = energyPicture(total, goal);
  const gap = picture.mode === "progress" ? gapLabel(total, goal) : null;
  const milestone = category === "wealth" ? highestMilestone(total) : null;
  const below = total < 0 ? `<p class="quiet-note">低于零，这段时间在远离这个目标。</p>` : "";
  const invite =
    picture.mode === "unset"
      ? `<button type="button" class="set-goal" data-action="go" data-view="settings">去设一个目标</button>`
      : "";
  return `
    <section class="slide" data-category="${category}" aria-label="${esc(meta.name)}">
      <p class="slide-name">${esc(meta.name)}</p>
      <p class="slide-realm">${esc(meta.realm)}</p>
      <p class="hero-score" data-sign="${signOf(total)}">${esc(formatPoints(total))}</p>
      <p class="today-line" data-mood="${mood}">${esc(summary)}</p>
      <div class="energy" data-mode="${picture.mode}" aria-hidden="true">
        <div class="energy-fill" style="width: ${picture.percent}%"></div>
      </div>
      ${picture.label ? `<p class="energy-read">${esc(picture.label)}</p>` : ""}
      ${gap ? `<p class="gap">${esc(gap)}</p>` : ""}
      ${milestone ? `<p class="milestone">${esc(milestone.title)}</p>` : ""}
      ${below}
      ${invite}
    </section>
  `;
}

function renderLog(ui: UiState): string {
  const categories = CATEGORIES.map((category) => {
    const selected = ui.category === category.id;
    return `
      <button
        type="button"
        class="cat-pick${selected ? " is-selected" : ""}"
        data-action="pick-category"
        data-category="${category.id}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        <span class="cat-name">${esc(category.name)}</span>
        <span class="cat-realm">${esc(category.realm)}</span>
      </button>
    `;
  }).join("");
  const choices: { delta: Delta; label: string; points: string }[] = [
    { delta: 100, label: "离目标近了", points: "+100" },
    { delta: -100, label: "离目标远了", points: "−100" },
    { delta: 0, label: "原地踏步", points: "0" },
  ];
  const choiceHtml = choices
    .map((choice) => {
      const selected = ui.delta === choice.delta;
      return `
        <button
          type="button"
          class="choice${selected ? " is-selected" : ""}"
          data-action="delta"
          data-delta="${choice.delta}"
          aria-pressed="${selected ? "true" : "false"}"
        >
          <span>${choice.label}</span>
          <span class="choice-points">${choice.points}</span>
        </button>
      `;
    })
    .join("");
  return `
    <main class="main">
      <p class="brand">富足记</p>
      <h1 class="screen-title">记一笔</h1>
      <p class="lede">选一类，写一句，再选今天是近了、远了，还是原地踏步。一天可以记很多笔。</p>
      ${ui.message ? `<p class="message" role="status">${esc(ui.message)}</p>` : ""}
      <section class="block">
        <h2 class="section-title">哪一类</h2>
        <div class="cat-grid">${categories}</div>
      </section>
      <section class="block">
        <label class="section-title" for="note">今天的一句</label>
        <textarea
          id="note"
          data-field="note"
          maxlength="160"
          rows="4"
          placeholder="写一句就好"
        >${esc(ui.note)}</textarea>
      </section>
      <section class="block">
        <h2 class="section-title">这一笔</h2>
        <div class="choices">${choiceHtml}</div>
      </section>
      <p class="form-error" id="log-error" role="alert">${esc(ui.logError ?? "")}</p>
      <button type="button" class="primary" data-action="save-entry">记下</button>
    </main>
  `;
}

function renderHistory(data: AppData, ui: UiState): string {
  const todayKey = shanghaiDateKey(ui.now);
  const groups = groupByDate(data.entries, ui.filter);
  const filterLabel: Record<CategoryId, string> = {
    wealth: "财富",
    health: "健康",
    network: "人脉",
    growth: "成长",
  };
  const filters: { id: HistoryFilter; label: string }[] = [
    { id: "all", label: "全部" },
    ...CATEGORIES.map((category) => ({ id: category.id, label: filterLabel[category.id] })),
  ];
  const chips = filters
    .map((filter) => {
      const selected = ui.filter === filter.id;
      return `
        <button
          type="button"
          class="chip${selected ? " is-selected" : ""}"
          data-action="filter"
          data-filter="${filter.id}"
          aria-pressed="${selected ? "true" : "false"}"
        >${esc(filter.label)}</button>
      `;
    })
    .join("");
  const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const body =
    count === 0
      ? `<p class="empty">${
          ui.filter === "all" ? "还没有记录。记下一笔，就从今天开始。" : "这一类还没有记录。"
        }</p>`
      : groups.map((group) => renderDay(group.dateKey, group.entries, todayKey, ui.deleteId)).join("");
  return `
    <main class="main">
      <p class="brand">富足记</p>
      <h1 class="screen-title">足迹</h1>
      <p class="lede">${count === 0 ? "记下的句子会按日期留在这里。" : `共 ${count} 笔`}</p>
      ${ui.message ? `<p class="message" role="status">${esc(ui.message)}</p>` : ""}
      <div class="filters" role="tablist" aria-label="按类别看">${chips}</div>
      <div class="days">${body}</div>
    </main>
  `;
}

function renderDay(
  dateKey: string,
  entries: AppData["entries"],
  todayKey: string,
  deleteId: string | null,
): string {
  const items = entries
    .map((entry) => {
      const meta = categoryMeta(entry.category);
      const confirming = deleteId === entry.id;
      const actions = confirming
        ? `
          <div class="confirm-row">
            <span>删掉这一笔？</span>
            <button type="button" class="text-btn" data-action="confirm-delete" data-id="${esc(entry.id)}">确认删除</button>
            <button type="button" class="text-btn" data-action="cancel-delete">取消</button>
          </div>
        `
        : `<button type="button" class="text-btn" data-action="ask-delete" data-id="${esc(entry.id)}">删除</button>`;
      return `
        <article class="entry">
          <div class="entry-top">
            <p class="entry-cat">${esc(meta.name)}</p>
            <p class="delta" data-sign="${signOf(entry.delta)}">${esc(formatDelta(entry.delta))}<span class="when">${esc(formatClock(entry.createdAt))}</span></p>
          </div>
          <p class="note">${esc(entry.note)}</p>
          ${actions}
        </article>
      `;
    })
    .join("");
  return `
    <section class="day">
      <h2 class="day-title">${esc(formatHistoryDate(dateKey, todayKey))}</h2>
      ${items}
    </section>
  `;
}

function renderSettings(ui: UiState): string {
  const importPanel = ui.importPreview
    ? `
      <div class="panel">
        <p>用这份备份替换这台设备上的记录？备份里有 ${ui.importPreview.entries.length} 笔。</p>
        <div class="panel-actions">
          <button type="button" class="primary" data-action="confirm-import">替换</button>
          <button type="button" class="secondary" data-action="cancel-import">取消</button>
        </div>
      </div>
    `
    : "";
  const clearPanel = ui.confirmClear
    ? `
      <div class="panel">
        <p>清空后无法恢复。如果还需要这些记录，请先导出。</p>
        <div class="panel-actions">
          <button type="button" class="primary" data-action="confirm-clear">确认清空</button>
          <button type="button" class="secondary" data-action="cancel-clear">取消</button>
        </div>
      </div>
    `
    : "";
  return `
    <main class="main">
      <p class="brand">富足记</p>
      <h1 class="screen-title">设置</h1>
      <p class="lede">目标和备份都在这台设备上。</p>
      ${ui.message ? `<p class="message" role="status">${esc(ui.message)}</p>` : ""}
      <section class="block">
        <h2 class="section-title">四个目标</h2>
        <p class="help">可以不填。填写后，首页会显示还差多少，或已经超过多少。留空再保存，就是不设目标。</p>
        ${renderGoalFields(ui)}
        ${ui.goalError ? `<p class="form-error" role="alert">${esc(ui.goalError)}</p>` : ""}
        <button type="button" class="primary" data-action="save-goals">保存目标</button>
      </section>
      <section class="block">
        <h2 class="section-title">备份</h2>
        <p class="help">记录只留在这台设备的浏览器里。换手机前，先导出一份 JSON。</p>
        <div class="button-col">
          <button type="button" class="secondary" data-action="export">导出备份</button>
          <button type="button" class="secondary" data-action="import-pick">导入备份</button>
        </div>
        <input id="import-file" data-field="import" type="file" accept="application/json,.json" hidden />
        ${ui.importError ? `<p class="form-error" role="alert">${esc(ui.importError)}</p>` : ""}
        ${importPanel}
      </section>
      <section class="block">
        <h2 class="section-title">主屏幕</h2>
        <p class="help">用 Safari 打开这个页面，点分享，再选「添加到主屏幕」。第一次需要联网，之后可以离线打开。</p>
      </section>
      <section class="block">
        <button type="button" class="text-btn danger" data-action="ask-clear">清空本机记录</button>
        ${clearPanel}
      </section>
    </main>
  `;
}

function renderGoalFields(ui: UiState): string {
  return CATEGORIES.map((category) => {
    return `
      <label class="field">
        <span>${esc(category.name)}</span>
        <input
          data-goal="${category.id}"
          inputmode="numeric"
          autocomplete="off"
          placeholder="不设目标"
          value="${esc(ui.goalDraft[category.id])}"
        />
      </label>
    `;
  }).join("");
}

function renderTabs(view: ViewName): string {
  const tabs: { id: ViewName; label: string; icon: string }[] = [
    { id: "home", label: "首页", icon: iconHome() },
    { id: "log", label: "记一笔", icon: iconPen() },
    { id: "history", label: "足迹", icon: iconLines() },
    { id: "settings", label: "设置", icon: iconSliders() },
  ];
  const buttons = tabs
    .map((tab) => {
      const current = view === tab.id;
      return `
        <button
          type="button"
          class="tab${current ? " is-active" : ""}"
          data-action="go"
          data-view="${tab.id}"
          ${current ? 'aria-current="page"' : ""}
        >
          ${tab.icon}
          <span>${tab.label}</span>
        </button>
      `;
    })
    .join("");
  return `<nav class="tabbar" aria-label="主导航">${buttons}</nav>`;
}

function iconHome(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
}

function iconPen(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5 14.5 5.5 4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
}

function iconLines(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function iconSliders(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="15" cy="16" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
