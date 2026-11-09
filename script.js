
// ===================================
// 基本設定
// ===================================

const MAX_COUNTERS = 15;
const MAX_MODES = 4;
const MIN_COUNTERS = 1;
// 小役ごとのカウント値は3桁（0〜999）まで。総ゲーム数には適用しない。
const MAX_COUNT_VALUE = 999;

const DEFAULT_COUNTER_COLOR = "#202B3D";

const STORAGE_KEY = "counters";
const OLD_STORAGE_KEY = "counterCount";
const MODE_STORAGE_KEY = "counterModesV1";
const SELECTED_MODE_KEY = "selectedCounterModeV1";
const DEFAULT_MODE_ID = "mode-default";
const COMMON_MODE_ID = "common";

function newModeId() {
  return `mode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadModes() {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved !== null) {
      const value = JSON.parse(saved);
      if (Array.isArray(value)) {
        const seen = new Set();
        return value.filter(mode => mode && typeof mode.id === "string" &&
          /^mode-[a-z0-9-]+$/i.test(mode.id) && !seen.has(mode.id) && seen.add(mode.id))
          .map(mode => ({ id: mode.id, name: typeof mode.name === "string" ? mode.name.slice(0, 30) : "モード" }));
      }
    }
  } catch (error) { console.warn("モードの読み込みに失敗しました", error); }
  return [{ id: DEFAULT_MODE_ID, name: "モード1" }];
}

let modes = loadModes();
let selectedModeId = modes.some(mode => mode.id === localStorage.getItem(SELECTED_MODE_KEY))
  ? localStorage.getItem(SELECTED_MODE_KEY) : (modes[0]?.id || null);

function saveModes() {
  localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(modes));
  if (selectedModeId) localStorage.setItem(SELECTED_MODE_KEY, selectedModeId);
  else localStorage.removeItem(SELECTED_MODE_KEY);
}


// 並び替え・名称変更後も確率式が同じ小役を参照できる固定ID。
function newCounterId() {
  return `counter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}


// ===================================
// HEXカラー処理
// ===================================

function normalizeHex(value) {
  let hex = value.trim();

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    hex = "#" + hex;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }

  return null;
}


// HSLからHEXに変換
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  const toHex = value => {
    return Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  };

  return (
    "#" +
    toHex(r) +
    toHex(g) +
    toHex(b)
  ).toUpperCase();
}


// ===================================
// カウンターデータ
// ===================================

// カウンター作成
function createCounter(
  name,
  count = 0,
  color = DEFAULT_COUNTER_COLOR,
  id = newCounterId(),
  modeId = DEFAULT_MODE_ID
) {
  return {
    id,
    name,
    // 旧バージョンで9999を超えていた保存値も表示上限に揃える。
    count: Math.min(count, MAX_COUNT_VALUE),
    color,
    modeId
  };
}


// 保存済みデータを読み込む
function loadCounters() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved !== null) {
    try {
      const data = JSON.parse(saved);

      if (Array.isArray(data)) {
        const loaded = data.map((item, index) => {

          // 旧データ形式
          if (
            Number.isSafeInteger(item) &&
            item >= 0
          ) {
            return createCounter(
              `カウンター ${index + 1}`,
              item
            );
          }

          // 現在のデータ形式
          if (
            item &&
            typeof item === "object" &&
            Number.isSafeInteger(item.count) &&
            item.count >= 0
          ) {
            return createCounter(
              typeof item.name === "string"
                ? item.name.slice(0, 30)
                : `カウンター ${index + 1}`,
              item.count,
              normalizeHex(item.color || "") ||
                DEFAULT_COUNTER_COLOR,
              typeof item.id === "string" && /^counter-[a-z0-9-]+$/i.test(item.id)
                ? item.id
                : newCounterId(),
              item.modeId === COMMON_MODE_ID || modes.some(mode => mode.id === item.modeId)
                ? item.modeId : (modes[0]?.id || COMMON_MODE_ID)
            );
          }

          return null;

        }).filter(Boolean);

        if (loaded.length > 0) {
          // 上限15個は各グループ（共通・モード別）の「追加時」に適用する。
          // 全グループの合計を15個で切り捨てると保存済みデータを失うため、
          // 読み込み時には有効なカウンターをすべて復元する。
          return loaded;
        }
      }

    } catch (error) {
      console.error("データ読み込みエラー", error);
    }
  }

  // 古い単一カウンターのデータを引き継ぐ
  const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);

  if (oldSaved !== null) {
    const oldCount = Number(oldSaved);

    if (
      Number.isSafeInteger(oldCount) &&
      oldCount >= 0
    ) {
      return [
        createCounter("カウンター 1", oldCount)
      ];
    }
  }

  return [createCounter("カウンター 1")];
}


let counters = loadCounters();


// ===================================
// HTML要素
// ===================================

const counterList = document.getElementById("counter-list");
const totalGamesInput = document.getElementById("total-games");
const decrementSwitch = document.getElementById("decrement-switch");
// 加算／減算の状態はスイッチの位置で示す（テキスト表示なし）。
const commonCounterList = document.getElementById("common-counter-list");
const commonCounterArea = document.getElementById("common-counter-area");
const counterModeTabs = document.getElementById("counter-mode-tabs");
const commonSettingsToggle = document.getElementById("common-settings-toggle");
const commonSettingsContent = document.getElementById("common-settings-content");
const modeSettingsList = document.getElementById("mode-settings-list");
const settingsOverview = document.getElementById("settings-overview");
const settingsModeDetail = document.getElementById("settings-mode-detail");
const settingsModeDetailTitle = document.getElementById("settings-mode-detail-title");
const settingsModeDetailContent = document.getElementById("settings-mode-detail-content");
const settingsModeBack = document.getElementById("settings-mode-back");
const addModeButton = document.getElementById("add-mode");
const portraitColumnSelect = document.getElementById("counter-columns-portrait");
const landscapeColumnSelect = document.getElementById("counter-columns-landscape");
const shapeButtons = document.querySelectorAll("[data-counter-shape]");

const mainScreen = document.getElementById("main-screen");
const memoScreen = document.getElementById("memo-screen");
const probabilityScreen = document.getElementById("probability-screen");
const settingsScreen = document.getElementById("settings-screen");
const appContent = document.getElementById("app-content");
const headerTitle = document.getElementById("header-title");

const resetAllButton = document.getElementById("reset-all");
const resetMemoButton = document.getElementById("reset-memo");
const memoInput = document.getElementById("memo-input");
const tabButtons = document.querySelectorAll(".tab-button");

// カウント履歴・Undo/Redoの共通操作
const countUndoButton = document.getElementById("count-undo");
const countRedoButton = document.getElementById("count-redo");
const countHistoryCurrent = document.getElementById("count-history-current");
const countHistoryScrollSpace = document.getElementById("count-history-scroll-space");
const countHistoryScrollArea = document.querySelector(".count-history-table-wrap");
const countHistoryList = document.getElementById("count-history-list");
const countHistoryMore = document.getElementById("count-history-more");

// 長押し時の数値編集
const countEditDialog = document.getElementById("count-edit-dialog");
const countEditForm = document.getElementById("count-edit-form");
const countEditTitle = document.getElementById("count-edit-title");
const countEditInput = document.getElementById("count-edit-input");
const countEditError = document.getElementById("count-edit-error");
const countEditCancel = document.getElementById("count-edit-cancel");
const countEditReset = document.getElementById("count-edit-reset");

// カウント値の文字サイズ設定
const fontSizeButtons = document.querySelectorAll("[data-font-size]");
const numberFontSizePreview = document.getElementById("number-font-size-preview");

// 現在開いているカラーピッカー
let activeColorPickerSection = null;


// ===================================
// 保存処理
// ===================================

// カウンターの保存だけを担当する。モード保存・画面描画は呼び出し側で行う。
function saveCounters() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counters));
}


// ===================================
// カウント履歴とUndo/Redo（小役共通・時系列）
// ===================================

const HISTORY_STORAGE_KEY = "counterHistoryV1";
const HISTORY_PAGE_SIZE = 50;
let historyShown = HISTORY_PAGE_SIZE;

function isCountChange(entry) {
  return Boolean(entry && typeof entry === "object" &&
    typeof entry.counterId === "string" &&
    typeof entry.counterName === "string" &&
    ["+1", "-1", "編集", "リセット"].includes(entry.action) &&
    Number.isSafeInteger(entry.before) && entry.before >= 0 &&
    Number.isSafeInteger(entry.after) && entry.after >= 0 &&
    typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at)));
}

function loadCountHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.past) && Array.isArray(saved.future)) {
      const ids = new Set(counters.map(counter => counter.id));
      return {
        // 削除済みの小役は操作できないので、Undo/Redoの対象から除外する。
        past: saved.past.filter(entry => isCountChange(entry) && ids.has(entry.counterId)),
        future: saved.future.filter(entry => isCountChange(entry) && ids.has(entry.counterId))
      };
    }
  } catch (error) {
    console.warn("履歴の読み込みに失敗しました", error);
  }
  return { past: [], future: [] };
}

let countHistory = loadCountHistory();

function saveCountHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(countHistory));
  } catch (error) {
    // 保存容量等で履歴を保存できなければ操作はできても履歴が失われる可能性を通知する。
    console.error("履歴の保存に失敗しました", error);
    countHistoryList.dataset.saveError = "true";
  }
}

// 履歴一覧では時刻だけを hh:mm:ss 形式で表示する。
function formatCountTime(iso) {
  const date = new Date(iso);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

// 履歴データの表示順はUndo/Redoの状態から決定し、DOM生成と切り離す。
function getHistoryDisplayEntries() {
  // futureはUndoされた順にpushされるため、元の操作順に戻す。
  return [
    ...countHistory.past.map(entry => ({ entry, undone: false })),
    ...countHistory.future.slice().reverse().map(entry => ({ entry, undone: true }))
  ];
}

// 履歴の1行を作成する。時刻・操作・変更前後の表示形式は維持する。
function createHistoryRow(entry, undone, latestApplied) {
  const row = document.createElement("tr");
  if (undone) {
    row.classList.add("count-history-undone");
    row.title = "Undoで取り消した操作（Redoでやり直し可能）";
    row.setAttribute("aria-label", "取り消し済みの操作");
  } else if (entry === latestApplied) {
    // 「最新」の文字は付けず、最後に確定している操作だけを背景色で区別。
    row.classList.add("count-history-latest");
  }

  const timeCell = document.createElement("td");
  timeCell.className = "count-history-time";
  const time = document.createElement("time");
  time.dateTime = entry.at;
  time.title = new Date(entry.at).toLocaleDateString("ja-JP");
  time.textContent = formatCountTime(entry.at);
  timeCell.appendChild(time);

  const nameCell = document.createElement("td");
  nameCell.className = "count-history-name";
  nameCell.textContent = entry.counterName;

  const operationCell = document.createElement("td");
  operationCell.className = "count-history-operation";
  operationCell.textContent = entry.action;

  const numbersCell = document.createElement("td");
  numbersCell.className = "count-history-values";
  const valuesLayout = document.createElement("span");
  valuesLayout.className = "count-history-values-layout";
  const beforeValue = document.createElement("span");
  beforeValue.className = "count-history-before";
  beforeValue.textContent = entry.before;
  const arrow = document.createElement("span");
  arrow.className = "count-history-arrow";
  arrow.textContent = "→";
  arrow.setAttribute("aria-hidden", "true");
  const afterValue = document.createElement("span");
  afterValue.className = "count-history-after";
  afterValue.textContent = entry.after;
  valuesLayout.append(beforeValue, arrow, afterValue);
  numbersCell.appendChild(valuesLayout);
  numbersCell.setAttribute("aria-label", `${entry.before} から ${entry.after}`);

  row.append(timeCell, nameCell, operationCell, numbersCell);
  return row;
}

function renderCountHistory() {
  countUndoButton.disabled = countHistory.past.length === 0;
  countRedoButton.disabled = countHistory.future.length === 0;
  countHistoryCurrent.replaceChildren();
  countHistoryList.replaceChildren();
  countHistoryScrollSpace.style.height = "0px";

  const entries = getHistoryDisplayEntries();
  const latestApplied = countHistory.past[countHistory.past.length - 1];

  // 横表示の簡易履歴は、現在有効な最後の操作のみ。
  // 縦表示の通常一覧とは別の表示領域に置き、縦表示では非表示にする。
  if (latestApplied) {
    countHistoryCurrent.appendChild(createHistoryRow(latestApplied, false, latestApplied));
  } else {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = 4;
    empty.className = "count-history-empty";
    empty.textContent = entries.length ? "有効な履歴はありません" : "履歴はありません";
    row.appendChild(empty);
    countHistoryCurrent.appendChild(row);
  }

  // 縦表示はUndo済みのグレー行も含む元の履歴順を維持する。
  // Undoを何十回繰り返しても青い行が一覧に含まれるよう、必要な分だけ表示件数を広げる。
  if (latestApplied) {
    const position = entries.findIndex(({ entry }) => entry === latestApplied);
    const needed = entries.length - position;
    if (position >= 0 && needed > historyShown) {
      historyShown = Math.ceil(needed / HISTORY_PAGE_SIZE) * HISTORY_PAGE_SIZE;
    }
  }
  // 青い行を別の位置に移したり、一覧から除外したりしない。
  const recent = entries.slice(-historyShown).reverse();
  const fragment = document.createDocumentFragment();
  if (recent.length === 0) {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = 4;
    empty.className = "count-history-empty";
    empty.textContent = "履歴はありません";
    row.appendChild(empty);
    fragment.appendChild(row);
  } else {
    recent.forEach(({ entry, undone }) => {
      fragment.appendChild(createHistoryRow(entry, undone, latestApplied));
    });
  }
  countHistoryList.appendChild(fragment);
  countHistoryMore.hidden = entries.length <= historyShown;
}

// Undo/Redo後、縦表示では青い行が列見出しの直下に来るよう、
// 通常の履歴一覧だけをスクロールする。履歴の順番も内容も変えない。
function scrollHistoryToLatestApplied() {
  if (document.documentElement.classList.contains("landscape-mode")) return;
  const activeRow = countHistoryList.querySelector(".count-history-latest");
  if (!activeRow) {
    countHistoryScrollArea.scrollTop = 0;
    return;
  }

  // 選択行より後の行が少なくても先頭にスクロールできる余地を確保。
  const table = countHistoryList.closest("table");
  const rowTop = activeRow.getBoundingClientRect().top - table.getBoundingClientRect().top;
  const remainingHeight = table.getBoundingClientRect().height - rowTop;
  const maxHeight = parseFloat(getComputedStyle(countHistoryScrollArea).maxHeight);
  const requiredSpace = Number.isFinite(maxHeight) && rowTop > 0
    ? Math.max(0, maxHeight - remainingHeight) : 0;
  countHistoryScrollSpace.style.height = `${Math.ceil(requiredSpace) + (requiredSpace > 0 ? 2 : 0)}px`;

  // scrollIntoViewは画面全体も動かすため使わず、履歴一覧のみスクロール。
  countHistoryScrollArea.scrollTop = rowTop;
}

countHistoryMore.addEventListener("click", function() {
  historyShown += HISTORY_PAGE_SIZE;
  renderCountHistory();
});

// 加算・減算・直接編集・個別リセットは必ずこの関数を通す。
function changeCount(counterData, newValue, action) {
  if (!counterData || !Number.isSafeInteger(newValue) ||
      newValue < 0 || newValue > MAX_COUNT_VALUE ||
      newValue === counterData.count) return false;

  const entry = {
    counterId: counterData.id,
    counterName: counterData.name.trim() || `カウンター ${counters.indexOf(counterData) + 1}`,
    action,
    before: counterData.count,
    after: newValue,
    at: new Date().toISOString()
  };

  counterData.count = newValue;
  // 新しい操作が行われたらRedo側の履歴を破棄する（Excelと同じ）。
  countHistory.past.push(entry);
  countHistory.future.length = 0;
  saveCounters();
  refreshProbabilityDisplay();
  saveCountHistory();
  // 数値だけの変更では、ボタンと長押しイベントを作り直さない。
  if (!refreshVisibleCounterNumber(counterData)) renderCounters();
  renderCountHistory();
  return true;
}

// 指定された小役の履歴を破棄する（小役そのものを削除した場合）。
function dropDeletedCounterHistory(id) {
  countHistory.past = countHistory.past.filter(entry => entry.counterId !== id);
  countHistory.future = countHistory.future.filter(entry => entry.counterId !== id);
  saveCountHistory();
  renderCountHistory();
}

function stepCountHistory(isRedo) {
  const from = isRedo ? countHistory.future : countHistory.past;
  const to = isRedo ? countHistory.past : countHistory.future;
  const entry = from[from.length - 1];
  if (!entry) return;
  const target = counters.find(counter => counter.id === entry.counterId);
  if (!target) {
    from.pop();
    saveCountHistory();
    renderCountHistory();
    return;
  }
  // 旧履歴に5桁以上の数値が残っていても、Undo/Redoで上限を超えない。
  target.count = Math.min(isRedo ? entry.after : entry.before, MAX_COUNT_VALUE);
  from.pop();
  to.push(entry);
  saveCounters();
  refreshProbabilityDisplay();
  saveCountHistory();
  let switchedMode = false;
  if (target.modeId !== COMMON_MODE_ID && modes.some(mode => mode.id === target.modeId)) {
    switchedMode = selectedModeId !== target.modeId;
    selectedModeId = target.modeId;
    saveModes();
  }
  // 別モードへの切り替え時だけリスト全体を再描画する。
  if (switchedMode || !refreshVisibleCounterNumber(target)) renderCounters();
  renderCountHistory();
  scrollHistoryToLatestApplied();
  // 別モードの操作を戻した場合は、その小役が見える位置に移動。
  const location = (target.modeId === COMMON_MODE_ID ? commonCounterList : counterList)
    .querySelector(`[data-counter-id="${target.id}"]`);
  if (location && !mainScreen.hidden) location.scrollIntoView({ block: "center", behavior: "smooth" });
}

countUndoButton.addEventListener("click", () => stepCountHistory(false));
countRedoButton.addEventListener("click", () => stepCountHistory(true));

// ===================================
// カウント値の文字サイズ
// ===================================

const COUNT_FONT_SIZE_KEY = "countFontSize";
const ALLOWED_FONT_SIZES = [8, 20, 32, 44, 56];
function readCountFontSize() {
  const value = Number(localStorage.getItem(COUNT_FONT_SIZE_KEY));
  // 旧スライダーの保存値は、最も近い選択肢へ移行する。
  return localStorage.getItem(COUNT_FONT_SIZE_KEY) === null ? 32 :
    ALLOWED_FONT_SIZES.reduce((nearest, size) =>
      Math.abs(size - value) < Math.abs(nearest - value) ? size : nearest, 32);
}
let countFontSize = readCountFontSize();
function updateFontSizeSelection() {
  numberFontSizePreview.style.fontSize = `${countFontSize}px`;
  fontSizeButtons.forEach(button => {
    const active = Number(button.dataset.fontSize) === countFontSize;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
fontSizeButtons.forEach(button => button.addEventListener("click", function() {
  countFontSize = Number(button.dataset.fontSize);
  localStorage.setItem(COUNT_FONT_SIZE_KEY, String(countFontSize));
  updateFontSizeSelection();
  renderCounters();
}));
updateFontSizeSelection();

// ===================================
// カウンターの横並び数（縦1～4列／横1～6列）
// ===================================

const LEGACY_COLUMN_STORAGE_KEY = "counterColumns";
const PORTRAIT_COLUMN_STORAGE_KEY = "counterColumnsPortrait";
const LANDSCAPE_COLUMN_STORAGE_KEY = "counterColumnsLandscape";
const DEFAULT_COLUMNS = 1;

// 以前の共通設定を引き継ぐ。縦表示は最大4列へ収め、横表示は最大6列を維持する。
function readColumns(key, maximum) {
  const saved = localStorage.getItem(key) ?? localStorage.getItem(LEGACY_COLUMN_STORAGE_KEY);
  const value = Number(saved);
  return saved !== null && Number.isInteger(value) && value >= 1
    ? Math.min(value, maximum)
    : DEFAULT_COLUMNS;
}

let portraitColumnCount = readColumns(PORTRAIT_COLUMN_STORAGE_KEY, 4);
let landscapeColumnCount = readColumns(LANDSCAPE_COLUMN_STORAGE_KEY, 6);

function getActiveColumnCount() {
  return document.documentElement.classList.contains("landscape-mode")
    ? landscapeColumnCount : portraitColumnCount;
}

// 表示中の向きだけの列数を適用し、入力欄はそれぞれ独立して表示する。
function applyColumnCount() {
  const count = getActiveColumnCount();
  counterList.dataset.columns = String(count);
  commonCounterList.dataset.columns = String(count);
  portraitColumnSelect.value = String(portraitColumnCount);
  landscapeColumnSelect.value = String(landscapeColumnCount);
  // 開いている小役選択欄も表示方向に合わせる（計算式の内容は変更しない）。
  document.querySelectorAll(".probability-counter-grid").forEach(grid => {
    grid.dataset.columns = String(count);
  });
  // カウンターDOMは維持したまま、列数変更後の幅に合わせて数字のみ調整する。
  requestAnimationFrame(resizeCounterNumbers);
}

portraitColumnSelect.addEventListener("change", function() {
  const count = Number(portraitColumnSelect.value);
  if (!Number.isInteger(count) || count < 1 || count > 4) return;
  portraitColumnCount = count;
  localStorage.setItem(PORTRAIT_COLUMN_STORAGE_KEY, String(count));
  applyColumnCount();
});

landscapeColumnSelect.addEventListener("change", function() {
  const count = Number(landscapeColumnSelect.value);
  if (!Number.isInteger(count) || count < 1 || count > 6) return;
  landscapeColumnCount = count;
  localStorage.setItem(LANDSCAPE_COLUMN_STORAGE_KEY, String(count));
  applyColumnCount();
});

applyColumnCount();


// ===================================
// カウントボタンの形（四角・丸）
// ===================================

const SHAPE_STORAGE_KEY = "counterShape";

function applyCounterShape(shape) {
  const selectedShape = shape === "circle" ? "circle" : "square";
  counterList.dataset.shape = selectedShape;
  commonCounterList.dataset.shape = selectedShape;

  shapeButtons.forEach(button => {
    const selected = button.dataset.counterShape === selectedShape;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

shapeButtons.forEach(button => {
  button.addEventListener("click", function() {
    const shape = button.dataset.counterShape;
    applyCounterShape(shape);
    localStorage.setItem(SHAPE_STORAGE_KEY, shape);
  });
});

applyCounterShape(localStorage.getItem(SHAPE_STORAGE_KEY));


// ===================================
// 文字色の自動調整
// ===================================

function getTextColors(color) {
  const hex = color.replace("#", "");

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const brightness =
    (r * 299 + g * 587 + b * 114) / 1000;

  if (brightness > 155) {
    return {
      main: "#202B3D",
      sub: "#52647F"
    };
  }

  return {
    main: "#FFFFFF",
    sub: "#B9C7DC"
  };
}


// ===================================
// カウンター画面：加算・減算の切り替え
// ===================================

// 再起動時は安全のため加算モードから開始する。
decrementSwitch.checked = false;

decrementSwitch.addEventListener("change", function() {
  renderCounters();
});


// ===================================
// メイン画面
// ===================================

const LONG_PRESS_MS = 650;
const LONG_PRESS_MOVE_LIMIT = 12;

// カウンターの表示更新をDOM作成から分離する。
// 既存ボタンを維持することで、連続タップ時のフォーカスや長押し状態を壊さない。
function updateCounterNumber(counterData, button, titleText) {
  const number = button.querySelector(".number");
  if (!number) return;
  number.textContent = counterData.count;
  // 数字が長い場合は、指定サイズを上限にしてボタン内へ収める。
  const width = button.getBoundingClientRect().width || 150;
  const digits = String(counterData.count).length;
  const safeSize = Math.max(8, Math.floor((width - 12) / Math.max(digits * 0.62, 1)));
  number.style.fontSize = `${Math.min(countFontSize, safeSize)}px`;
  const operation = decrementSwitch.checked ? "減算" : "加算";
  button.setAttribute("aria-label",
    `${titleText}、${counterData.count}回。タップで${operation}、長押しで数値編集`);
}

// 表示中の同じ小役だけ更新する。別モードにある小役は再描画対象外。
function refreshVisibleCounterNumber(counterData) {
  let updated = false;
  for (const list of [commonCounterList, counterList]) {
    for (const item of list.querySelectorAll(".counter-item")) {
      if (item.dataset.counterId !== counterData.id) continue;
      const button = item.querySelector(".counter");
      const title = item.querySelector(".title");
      if (button && title) {
        updateCounterNumber(counterData, button, title.textContent);
        updated = true;
      }
    }
  }
  return updated;
}

// 手動横表示でボタンの横幅が変わるため、既存の数字だけ再調整する。
// ボタンそのものを作り直さず、長押し・タップのイベントを維持する。
function resizeCounterNumbers() {
  const counterById = new Map(counters.map(counter => [counter.id, counter]));
  for (const list of [commonCounterList, counterList]) {
    list.querySelectorAll(".counter-item").forEach(item => {
      const data = counterById.get(item.dataset.counterId);
      const button = item.querySelector(".counter");
      const title = item.querySelector(".title");
      if (data && button && title) updateCounterNumber(data, button, title.textContent);
    });
  }
}

function renderCounterGroup(targetList, groupCounters) {
  targetList.replaceChildren();
  groupCounters.forEach((counterData, index) => {
    const item = document.createElement("div");
    item.className = "counter-item";
    item.dataset.counterId = counterData.id;

    // 小役名（ボタンの下）
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = counterData.name.trim() || `カウンター ${index + 1}`;

    // 数字を大きく表示するカウントボタン
    const counter = document.createElement("button");
    counter.type = "button";
    counter.className = "counter";
    counter.style.backgroundColor = counterData.color;
    counter.style.color = getTextColors(counterData.color).main;
    counter.title = "長押しで数値を編集・リセット";

    const number = document.createElement("div");
    number.className = "number";
    counter.appendChild(number);

    // 長押しを通常タップと区別する。指を動かしてスクロールしたときは取り消す。
    let holdTimer = null;
    let longPressed = false;
    let pointerMoved = false;
    let pointerStartX = 0;
    let pointerStartY = 0;

    function cancelHoldTimer() {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }

    counter.addEventListener("pointerdown", function(event) {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

      cancelHoldTimer();
      longPressed = false;
      pointerMoved = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;

      holdTimer = setTimeout(function() {
        holdTimer = null;
        longPressed = true;
        openCountEditor(counterData);
      }, LONG_PRESS_MS);
    });

    counter.addEventListener("pointermove", function(event) {
      if (holdTimer === null) return;
      if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY)
          > LONG_PRESS_MOVE_LIMIT) {
        pointerMoved = true;
        cancelHoldTimer();
      }
    });

    counter.addEventListener("pointerup", cancelHoldTimer);
    counter.addEventListener("pointercancel", function() {
      pointerMoved = true;
      cancelHoldTimer();
    });
    counter.addEventListener("pointerleave", cancelHoldTimer);

    // iPhone等で長押し時に出るコンテキストメニューを抑止する。
    counter.addEventListener("contextmenu", function(event) {
      event.preventDefault();
    });

    // キーボード操作では通常のclickとして扱う。
    counter.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        longPressed = false;
        pointerMoved = false;
      }
    });

    // 長押し・スクロール操作後のclickは無視する。
    counter.addEventListener("click", function() {
      if (longPressed || pointerMoved) {
        longPressed = false;
        pointerMoved = false;
        return;
      }

      const before = counterData.count;
      const delta = decrementSwitch.checked ? -1 : 1;
      if (delta === -1 && before === 0) return;
      if (delta === 1 && before >= MAX_COUNT_VALUE) return;
      changeCount(counterData, before + delta, delta === 1 ? "+1" : "-1");
    });

    item.append(counter, title);
    targetList.appendChild(item);
    updateCounterNumber(counterData, counter, title.textContent);
  });
}

function selectCounterMode(modeId) {
  // モードが1つしかないときは、表示中のタブは操作を受け付けない。
  if (modes.length <= 1 || !modes.some(mode => mode.id === modeId)) return;
  selectedModeId = modeId;
  saveModes();
  renderCounters();
}

function renderCounterModeTabs() {
  counterModeTabs.replaceChildren();
  counterModeTabs.hidden = modes.length === 0;
  if (counterModeTabs.hidden) return;
  modes.forEach(mode => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode.name.trim() || "名前なし";
    button.className = "counter-mode-tab";
    button.classList.toggle("active", mode.id === selectedModeId);
    button.setAttribute("aria-pressed", String(mode.id === selectedModeId));
    // 1モード時もタブは表示するが、タップ・クリック・キーボード操作は無効にする。
    button.disabled = modes.length === 1;
    button.addEventListener("click", () => selectCounterMode(mode.id));
    counterModeTabs.appendChild(button);
  });
}

function renderCounters() {
  if (!modes.some(mode => mode.id === selectedModeId)) selectedModeId = modes[0]?.id || null;
  const common = counters.filter(counter => counter.modeId === COMMON_MODE_ID);
  commonCounterArea.hidden = common.length === 0;
  // モードが0件なら共通カウンターの見出しは表示しない（カウンター自体は表示）。
  const commonHeading = commonCounterArea.querySelector(".counter-area-heading");
  if (commonHeading) commonHeading.hidden = modes.length === 0;
  renderCounterGroup(commonCounterList, common);
  renderCounterModeTabs();
  renderCounterGroup(counterList, counters.filter(counter => counter.modeId === selectedModeId));
}

// ===================================
// 長押し：カウントを直接編集、または確認してリセット
// ===================================

let editingCounter = null;

function openCountEditor(counterData) {
  editingCounter = counterData;
  countEditTitle.textContent = counterData.name.trim() || "小役";
  countEditInput.value = String(counterData.count);
  countEditError.hidden = true;
  if (typeof countEditDialog.showModal === "function" && !countEditDialog.open) {
    countEditDialog.showModal();
    countEditInput.focus();
    countEditInput.select();
  }
}

function closeCountEditor() {
  if (countEditDialog.open) countEditDialog.close();
  editingCounter = null;
}

countEditDialog.addEventListener("close", function() {
  editingCounter = null;
});
countEditCancel.addEventListener("click", closeCountEditor);

countEditInput.addEventListener("input", function() {
  countEditInput.value = countEditInput.value.replace(/[^0-9]/g, "").slice(0, 3);
  countEditError.hidden = true;
});

countEditForm.addEventListener("submit", function(event) {
  event.preventDefault();
  if (!editingCounter) return;
  const raw = countEditInput.value.trim();
  // 空欄を保存した場合は、カウント値を0にする。
  const nextCount = raw === "" ? 0 : Number(raw);
  if (!/^\d*$/.test(raw) || !Number.isSafeInteger(nextCount) || nextCount > MAX_COUNT_VALUE) {
    countEditError.textContent = "0〜999の整数を入力してください。";
    countEditError.hidden = false;
    return;
  }
  changeCount(editingCounter, nextCount, "編集");
  closeCountEditor();
});

countEditReset.addEventListener("click", function() {
  if (!editingCounter) return;
  const confirmed = window.confirm(
    `${editingCounter.name.trim() || "小役"}を0にリセットします。\nよろしいですか？`
  );
  if (!confirmed) return;
  changeCount(editingCounter, 0, "リセット");
  closeCountEditor();
});

// 設定画面の各アコーディオンに編集状態を保持する。
const counterEditorStates = new Map();
let commonSettingsOpen = false;
let editingModeId = null;

function editorState(groupId) {
  if (!counterEditorStates.has(groupId)) counterEditorStates.set(groupId, { reorder: false, selectedId: null });
  return counterEditorStates.get(groupId);
}

function groupCounters(groupId) {
  return counters.filter(counter => counter.modeId === groupId);
}

// ===================================
// カラーピッカー外側の操作
// ===================================

document.addEventListener("pointerdown", function(event) {
  if (!activeColorPickerSection) return;

  // 開いている色変更エリアの外側を押したら閉じる
  if (!activeColorPickerSection.contains(event.target)) {
    const panel =
      activeColorPickerSection.querySelector(".color-picker-panel");

    if (panel) {
      panel.hidden = true;
    }

    activeColorPickerSection = null;
  }
});


// ===================================
// 設定画面
// ===================================

function createCounterEditor(groupId) {
  const panel = document.createElement("div");
  panel.className = "counter-settings-group nested-counter-settings";
  panel.innerHTML = `
    <div class="counter-settings-heading">
      <span class="counter-settings-title">小役</span>
    </div>
    <div class="settings-list"></div>
    <button type="button" class="button add-button">＋ カウンターを追加</button>`;
  const settingsList = panel.querySelector(".settings-list");
  const addButton = panel.querySelector(".add-button");
  const members = groupCounters(groupId);

  function moveCounter(counterId, delta) {
    const current = groupCounters(groupId);
    const index = current.findIndex(counter => counter.id === counterId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= current.length) return;
    const a = counters.indexOf(current[index]);
    const b = counters.indexOf(current[next]);
    [counters[a], counters[b]] = [counters[b], counters[a]];
    saveCounters();
    refreshProbabilityDisplay();
    renderCounters();
    renderSettings();
  }
  function deleteCounter(id) {
    if (!window.confirm("この小役を削除しますか？")) return;
    counters = counters.filter(counter => counter.id !== id);
    dropDeletedCounterHistory(id);
    saveCounters();
    refreshProbabilityDisplay();
    renderCounters();
    renderSettings();
  }

  members.forEach((counterData, index) => {

    const item = document.createElement("div");
    item.className = "setting-item";

    // 通常モードでは通番・小役名・色のみを表示する。
    // 名前入力
    const input = document.createElement("input");

    input.type = "text";
    input.className = "setting-input";
    input.maxLength = 30;
    input.value = counterData.name;
    input.placeholder = "例：チェリー";
    input.setAttribute("aria-label", `${index + 1}番の小役名`);

    input.addEventListener("input", function() {
      counterData.name = input.value;
      saveCounters();
      refreshProbabilityDisplay();
    });


    // ===================================
    // カラーピッカー
    // ===================================

    const colorSection = document.createElement("div");
    colorSection.className = "setting-color-section";

    // 開閉ボタン
    const openButton = document.createElement("button");

    openButton.type = "button";
    openButton.className = "color-open-button";

    const preview = document.createElement("span");
    preview.className = "color-preview";
    preview.style.backgroundColor = counterData.color;

    // 色見本だけを表示し、説明文は表示しない
    openButton.appendChild(preview);
    openButton.title = "背景色を変更";
    openButton.setAttribute("aria-label", "背景色を変更");

    // ピッカー本体
    const panel = document.createElement("div");

    panel.className = "color-picker-panel";
    panel.hidden = true;

    openButton.addEventListener("click", function() {
      // 別のカラーピッカーが開いていれば先に閉じる
      if (
        activeColorPickerSection &&
        activeColorPickerSection !== colorSection
      ) {
        const previousPanel =
          activeColorPickerSection.querySelector(".color-picker-panel");

        if (previousPanel) {
          previousPanel.hidden = true;
        }
      }

      // 同じボタンなら開閉を切り替える
      panel.hidden = !panel.hidden;

      activeColorPickerSection = panel.hidden
        ? null
        : colorSection;
    });


    // カラーマトリクス
    const matrix = document.createElement("div");
    matrix.className = "color-matrix";


    // HEX入力
    const hexInput = document.createElement("input");

    hexInput.type = "text";
    hexInput.className = "color-hex";
    hexInput.maxLength = 7;
    hexInput.value = counterData.color;
    hexInput.placeholder = "#202B3D";

    hexInput.setAttribute(
      "aria-label",
      "HEXカラーコード"
    );


    // OS標準カラーピッカー
    const nativeInput = document.createElement("input");

    nativeInput.type = "color";
    nativeInput.className = "native-color";
    nativeInput.value = counterData.color;
    nativeInput.title = "自由に色を選択";


    // 選択中のマスを更新
    function updateSelected() {

      matrix.querySelectorAll("[data-color]").forEach(button => {

        const selected =
          button.dataset.color === counterData.color;

        button.classList.toggle("selected", selected);

        button.setAttribute(
          "aria-pressed",
          String(selected)
        );

      });

    }


    // 色を適用
    function applyColor(color) {

      const normalized = normalizeHex(color);

      if (!normalized) return;

      counterData.color = normalized;

      preview.style.backgroundColor = normalized;
      hexInput.value = normalized;
      nativeInput.value = normalized;

      saveCounters();
      refreshProbabilityDisplay();

      renderCounters();

      updateSelected();
    }


    // ===================================
    // 15列 × 6行のマトリクス
    // ===================================

    const hues = Array.from(
      { length: 14 },
      (_, i) => i * 360 / 14
    );

    const lights = [
      25, 35, 45, 55, 65, 75
    ];

    lights.forEach(light => {

      // 通常カラー14列
      hues.forEach(hue => {

        const color = hslToHex(hue, 100, light);

        const swatch = document.createElement("button");

        swatch.type = "button";
        swatch.className = "matrix-swatch";
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.title = color;

        swatch.setAttribute(
          "aria-label",
          color
        );

        swatch.addEventListener("click", function() {
          applyColor(color);
        });

        matrix.appendChild(swatch);
      });


      // 白黒・グレー系1列
      // 通常カラーと同じHSL明度を使用
      const grayColor = hslToHex(0, 0, light);

      const graySwatch = document.createElement("button");

      graySwatch.type = "button";
      graySwatch.className = "matrix-swatch";
      graySwatch.style.backgroundColor = grayColor;
      graySwatch.dataset.color = grayColor;
      graySwatch.title = grayColor;

      graySwatch.setAttribute(
        "aria-label",
        `グレー ${light}%`
      );

      graySwatch.addEventListener("click", function() {
        applyColor(grayColor);
      });

      matrix.appendChild(graySwatch);

    });


    // HEX入力
    hexInput.addEventListener("input", function() {

      const color = normalizeHex(hexInput.value);

      if (color) {
        applyColor(color);
      }

    });


    // OS標準カラーピッカー
    nativeInput.addEventListener("input", function() {
      applyColor(nativeInput.value);
    });


    // 入力欄
    const inputRow = document.createElement("div");

    inputRow.className = "color-input-row";

    inputRow.append(
      hexInput,
      nativeInput
    );


    // 初期選択状態
    updateSelected();


    // ピッカーに追加
    panel.append(
      matrix,
      inputRow
    );

    colorSection.append(
      openButton,
      panel
    );

    // 小役名入力欄と、その右に色変更ボタンを配置
    const nameRow = document.createElement("div");
    nameRow.className = "setting-name-row";

    const orderNumber = document.createElement("span");
    orderNumber.className = "setting-number";
    orderNumber.textContent = `${index + 1}.`;

    nameRow.append(orderNumber, input, colorSection);

    item.append(nameRow);
    const controls = createMoveControls(
      index > 0, index < members.length - 1,
      () => moveCounter(counterData.id, -1),
      () => moveCounter(counterData.id, 1),
      "小役"
    );
    nameRow.appendChild(controls);
    installRowActions(item, () => deleteCounter(counterData.id), `小役「${counterData.name || "名前なし"}」`);
    settingsList.appendChild(item);

  });


  if (members.length >= MAX_COUNTERS) {
    addButton.disabled = true;
    addButton.textContent = `最大${MAX_COUNTERS}個です`;
  } else {
    addButton.disabled = false;
    addButton.textContent = "＋ カウンターを追加";
  }
  addButton.addEventListener("click", function() {
    if (groupCounters(groupId).length >= MAX_COUNTERS) return;
    counters.push(createCounter(getNewCounterName(groupId), 0, DEFAULT_COUNTER_COLOR, newCounterId(), groupId));
    saveCounters();
    refreshProbabilityDisplay();
    renderCounters();
    renderSettings();
  });
  return panel;
}

function getNewCounterName(groupId) {
  let number = 1;
  while (groupCounters(groupId).some(counter => counter.name === `カウンター ${number}`)) number++;
  return `カウンター ${number}`;
}

function renderSettings() {
  activeColorPickerSection = null;
  const editingMode = modes.find(mode => mode.id === editingModeId);
  // モード削除などで編集対象がなくなったら一覧へ戻す。
  if (!editingMode) editingModeId = null;
  settingsOverview.hidden = !!editingModeId;
  settingsModeDetail.hidden = !editingModeId;
  settingsModeDetailContent.replaceChildren();
  if (editingModeId) {
    settingsModeDetailTitle.textContent = editingMode.name.trim() || "名前なし";
    settingsModeDetailContent.appendChild(createCounterEditor(editingModeId));
  }
  // モードがなければ「共通」という区別が不要なので通常の名称にする。
  const commonTitle = commonSettingsToggle.querySelector("span:first-child");
  if (commonTitle) commonTitle.textContent = modes.length === 0 ? "カウンター" : "全モード共通";
  commonSettingsToggle.setAttribute("aria-expanded", String(commonSettingsOpen));
  commonSettingsContent.hidden = !commonSettingsOpen;
  commonSettingsToggle.querySelector(".accordion-chevron").textContent = commonSettingsOpen ? "⌃" : "⌄";
  commonSettingsContent.replaceChildren();
  if (commonSettingsOpen) commonSettingsContent.appendChild(createCounterEditor(COMMON_MODE_ID));
  renderModeSettings();
  // 上限に達したら追加操作を無効化。既存データは勝手に削除しない。
  addModeButton.disabled = modes.length >= MAX_MODES;
  addModeButton.textContent = addModeButton.disabled
    ? `モードは最大${MAX_MODES}個まで` : "＋ モードを追加";
}

// 通常表示で上下移動できるボタン。先頭・末尾も同じスペースを確保する。
function createMoveControls(canUp, canDown, onUp, onDown, subject) {
  const group = document.createElement("div");
  group.className = "always-move-controls";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "always-move-button";
  up.textContent = "↑";
  up.setAttribute("aria-label", `${subject}を上へ移動`);
  up.disabled = !canUp;
  up.addEventListener("click", onUp);
  const down = document.createElement("button");
  down.type = "button";
  down.className = "always-move-button";
  down.textContent = "↓";
  down.setAttribute("aria-label", `${subject}を下へ移動`);
  down.disabled = !canDown;
  down.addEventListener("click", onDown);
  group.append(up, down);
  return group;
}

// iPhone: 設定行の長押しで削除メニューを表示。
// Windows: 右クリックで同じ削除メニュー。スクロールや通常タップは維持。
let activeRowActionClose = null;
function installRowActions(row, onDelete, label) {
  row.classList.add("gesture-row");
  const menu = document.createElement("div");
  menu.className = "gesture-context-menu";
  menu.hidden = true;
  const menuDelete = document.createElement("button");
  menuDelete.type = "button";
  menuDelete.textContent = "削除";
  menuDelete.setAttribute("aria-label", `${label}を削除`);
  menuDelete.addEventListener("click", event => {
    event.stopPropagation();
    close();
    onDelete();
  });
  menu.appendChild(menuDelete);
  row.appendChild(menu);

  function close() {
    menu.hidden = true;
    if (activeRowActionClose === close) activeRowActionClose = null;
  }
  function openContext() {
    if (activeRowActionClose && activeRowActionClose !== close) activeRowActionClose();
    menu.hidden = false;
    activeRowActionClose = close;
  }

  let startX = 0;
  let startY = 0;
  let pressTimer = null;
  let pressed = false;
  let triggered = false;
  row.addEventListener("contextmenu", event => {
    event.preventDefault();
    openContext();
  });
  row.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch") return;
    if (event.target.closest(".gesture-context-menu,.always-move-controls,.color-open-button,.color-picker-panel")) return;
    startX = event.clientX;
    startY = event.clientY;
    triggered = false;
    pressed = true;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (!pressed) return;
      triggered = true;
      openContext();
    }, 550);
  });
  row.addEventListener("pointermove", event => {
    if (!pressed || event.pointerType !== "touch") return;
    if (Math.abs(event.clientX - startX) > 12 || Math.abs(event.clientY - startY) > 12) {
      clearTimeout(pressTimer);
      pressed = false;
    }
  });
  function finish() {
    pressed = false;
    clearTimeout(pressTimer);
  }
  row.addEventListener("pointerup", finish);
  row.addEventListener("pointercancel", finish);
  row.addEventListener("pointerleave", event => { if (event.pointerType === "touch") finish(); });
  row.addEventListener("click", event => {
    if (triggered) { event.preventDefault(); event.stopPropagation(); triggered = false; }
  }, true);
}

document.addEventListener("pointerdown", event => {
  if (activeRowActionClose && !event.target.closest(".gesture-row")) activeRowActionClose();
});

function deleteMode(modeId) {
  const index = modes.findIndex(mode => mode.id === modeId);
  if (index < 0 || !window.confirm("このモードを削除しますか？")) return;
  const ids = new Set(groupCounters(modeId).map(counter => counter.id));
  counters = counters.filter(counter => counter.modeId !== modeId);
  countHistory.past = countHistory.past.filter(entry => !ids.has(entry.counterId));
  countHistory.future = countHistory.future.filter(entry => !ids.has(entry.counterId));
  saveCountHistory();
  renderCountHistory();
  modes.splice(index, 1);
  counterEditorStates.delete(modeId);
  if (editingModeId === modeId) editingModeId = null;
  if (selectedModeId === modeId) selectedModeId = modes[0]?.id || null;
  saveCounters();
  saveModes();
  renderSettings();
  renderCounters();
  refreshProbabilityDisplay();
}

function moveMode(modeId, delta) {
  const index = modes.findIndex(mode => mode.id === modeId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= modes.length) return;
  [modes[index], modes[next]] = [modes[next], modes[index]];
  saveModes();
  renderSettings();
  renderCounters();
}

function renderModeSettings() {
  modeSettingsList.replaceChildren();
  modes.forEach((mode, index) => {
    const item = document.createElement("div");
    item.className = "mode-settings-item";
    const row = document.createElement("div");
    row.className = "mode-settings-row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mode-row-toggle";
    toggle.dataset.modeId = mode.id;
    toggle.setAttribute("aria-label", `${mode.name.trim() || "名前なし"}の小役設定へ移動`);
    const label = document.createElement("span");
    label.className = "mode-row-name";
    label.textContent = mode.name.trim() || "名前なし";
    const chevron = document.createElement("span");
    chevron.className = "mode-row-arrow";
    chevron.setAttribute("aria-hidden", "true");
    toggle.append(label, chevron);
    toggle.addEventListener("click", () => {
      editingModeId = mode.id;
      renderSettings();
      appContent.scrollTop = 0;
      settingsModeBack.focus({ preventScroll: true });
    });
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "mode-rename-button";
    rename.textContent = "編集";
    rename.setAttribute("aria-label", `${mode.name.trim() || "名前なし"}のモード名を編集`);
    rename.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "setting-input mode-name-input";
      input.maxLength = 30;
      input.value = mode.name;
      input.setAttribute("aria-label", "モード名");
      input.addEventListener("input", () => {
        mode.name = input.value;
        saveModes();
        renderCounterModeTabs();
        refreshProbabilityDisplay();
      });
      input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); });
      input.addEventListener("blur", () => renderModeSettings(), { once: true });
      row.replaceChild(input, toggle);
      rename.hidden = true;
      input.focus();
      input.select();
    });
    const move = createMoveControls(index > 0, index < modes.length - 1,
      () => moveMode(mode.id, -1), () => moveMode(mode.id, 1), "モード");
    row.append(toggle, rename, move);
    item.appendChild(row);
    installRowActions(item, () => deleteMode(mode.id), `モード「${mode.name || "名前なし"}」`);
    modeSettingsList.appendChild(item);
  });
}

settingsModeBack.addEventListener("click", function() {
  const previousModeId = editingModeId;
  editingModeId = null;
  renderSettings();
  appContent.scrollTop = 0;
  const sourceButton = Array.from(modeSettingsList.querySelectorAll(".mode-row-toggle"))
    .find(button => button.dataset.modeId === previousModeId);
  if (sourceButton) sourceButton.focus({ preventScroll: true });
});

commonSettingsToggle.addEventListener("click", function() {
  commonSettingsOpen = !commonSettingsOpen;
  renderSettings();
});
addModeButton.addEventListener("click", function() {
  if (modes.length >= MAX_MODES) return;
  let number = 1;
  while (modes.some(mode => mode.name === `モード${number}`)) number++;
  const mode = { id: newModeId(), name: `モード${number}` };
  modes.push(mode);
  // 新規モードを追加しても編集画面は開かず、現在の選択モードも維持する。
  saveModes();
  renderSettings();
  renderCounters();
});

// ===================================
// 全カウンターリセット
// ===================================

resetAllButton.addEventListener("click", function() {

  // 実行前に確認する
  const confirmed = window.confirm(
    "すべてのカウンターと履歴をリセットします。\nよろしいですか？"
  );

  if (!confirmed) return;

  // カウントだけを0にする（名前・色・並び順は残す）
  counters.forEach(counterData => {
    counterData.count = 0;
  });

  countHistory = { past: [], future: [] };
  historyShown = HISTORY_PAGE_SIZE;
  saveCounters();
  refreshProbabilityDisplay();
  saveCountHistory();
  renderCounters();
  renderCountHistory();

});


// ===================================
// メモ：入力の自動保存と個別リセット
// ===================================

const MEMO_STORAGE_KEY = "counterMemo";

// 保存済みのメモを復元する。
memoInput.value = localStorage.getItem(MEMO_STORAGE_KEY) || "";

// 入力のたびに保存するため、保存ボタンは不要。
memoInput.addEventListener("input", function() {
  localStorage.setItem(MEMO_STORAGE_KEY, memoInput.value);
});

// メモだけを削除する（カウンターや設定には触れない）。
resetMemoButton.addEventListener("click", function() {
  const confirmed = window.confirm(
    "メモの内容をすべて削除します。\nよろしいですか？"
  );

  if (!confirmed) return;

  memoInput.value = "";
  localStorage.setItem(MEMO_STORAGE_KEY, "");
});


// ===================================
// タブ切り替え
// ===================================

const tabScreens = {
  counter: mainScreen,
  memo: memoScreen,
  probability: probabilityScreen,
  settings: settingsScreen
};

// ヘッダーと下部タブはそのまま、中央の画面だけ切り替える
function selectTab(tabName) {
  if (!Object.hasOwn(tabScreens, tabName)) return;

  Object.entries(tabScreens).forEach(([name, screen]) => {
    screen.hidden = name !== tabName;
  });

  tabButtons.forEach(button => {
    const selected = button.dataset.tab === tabName;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  // ヘッダーには選択したタブと同じ名前を表示する。
  const selectedTab = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
  headerTitle.textContent = selectedTab.querySelector(".tab-label").textContent.trim();

  // リセットは表示しているタブ専用。
  resetAllButton.hidden = tabName !== "counter";
  resetMemoButton.hidden = tabName !== "memo";

  // 設定タブを離れたら、次回は設定の一覧画面から開く。
  if (tabName !== "settings") editingModeId = null;
  // 設定タブを離れたら並び替えモードを終了する。
  if (tabName !== "settings") {
    if (activeRowActionClose) activeRowActionClose();
  }

  // 設定・確率タブを開くときに保存済みデータから最新表示にする。
  if (tabName === "settings") renderSettings();
  if (tabName === "counter") renderCounters();
  if (tabName === "probability") refreshProbabilityDisplay();

  // 前のタブのスクロール位置は持ち越さない。
  appContent.scrollTop = 0;
}

// タップ・クリックで切り替える
 tabButtons.forEach(button => {
  button.addEventListener("click", function() {
    selectTab(button.dataset.tab);
  });

  // キーボード操作にも対応（左右キーでタブを移動）。
  button.addEventListener("keydown", function(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const buttons = Array.from(tabButtons);
    const index = buttons.indexOf(button);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    const nextButton = buttons[nextIndex];
    selectTab(nextButton.dataset.tab);
    nextButton.focus();
  });
});


// ===================================
// 総ゲーム数（カウンター画面の一番上）
// ===================================

const GAMES_STORAGE_KEY = "totalGames";

// 空欄は未入力として扱う。0と1～999999999も保存できる。
function readTotalGames() {
  const raw = localStorage.getItem(GAMES_STORAGE_KEY);
  if (raw === null || raw === "") return null;
  if (!/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

const storedGames = readTotalGames();
totalGamesInput.value = storedGames === null ? "" : String(storedGames);

totalGamesInput.addEventListener("input", function() {
  // type=numberはeやマイナスも入力できるので、数字専用のテキスト欄にする。
  const digits = totalGamesInput.value.replace(/[^0-9]/g, "").slice(0, 9);
  totalGamesInput.value = digits;
  localStorage.setItem(GAMES_STORAGE_KEY, digits);
  refreshProbabilityDisplay();
});

// ===================================
// 確率：保存データと式の入力
// ===================================

const PROBABILITY_STORAGE_KEY = "probabilityItems";
const MAX_FORMULA_TOKENS = 60;
const probabilityListView = document.getElementById("probability-list-view");
const probabilityItemsElement = document.getElementById("probability-items");
const probabilityAddButton = document.getElementById("probability-add");
const probabilityEditor = document.getElementById("probability-editor");
const probabilityEditorTitle = document.getElementById("probability-editor-title");
const probabilityBackButton = document.getElementById("probability-back");
const probabilityNameInput = document.getElementById("probability-name");
const probabilityFormulaElement = document.getElementById("probability-formula");
const probabilityGamesButton = document.getElementById("probability-games");
const probabilityCounterButton = document.getElementById("probability-counter");
const probabilityCounterMenu = document.getElementById("probability-counter-menu");
const probabilityUndoButton = document.getElementById("probability-undo");
const probabilityClearButton = document.getElementById("probability-clear");
const probabilityPreviewValue = document.getElementById("probability-preview-value");
const probabilityPreviewNote = document.getElementById("probability-preview-note");
const probabilitySaveButton = document.getElementById("probability-save");

function validFormulaToken(token) {
  if (!token || typeof token !== "object") return false;
  if (token.type === "games") return true;
  if (token.type === "counter") return typeof token.id === "string" && token.id.length <= 100;
  return token.type === "op" && ["+", "-", "*", "/", "(", ")"].includes(token.value);
}

function loadProbabilityItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROBABILITY_STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item === "object" &&
      typeof item.id === "string" && typeof item.name === "string" &&
      Array.isArray(item.tokens) && item.tokens.length <= MAX_FORMULA_TOKENS &&
      item.tokens.every(validFormulaToken))
      .map(item => ({ id: item.id, name: item.name.slice(0, 40), tokens: item.tokens.map(token => ({ ...token })) }));
  } catch (error) {
    console.error("確率項目の読み込みエラー", error);
    return [];
  }
}

let probabilityItems = loadProbabilityItems();
let probabilityDraft = null;
let editingProbabilityId = null;

function saveProbabilityItems() {
  localStorage.setItem(PROBABILITY_STORAGE_KEY, JSON.stringify(probabilityItems));
}

function counterForId(id) {
  return counters.find(counter => counter.id === id);
}

function tokenLabel(token) {
  if (token.type === "games") return "総ゲーム数";
  if (token.type === "counter") {
    const counter = counterForId(token.id);
    return counter ? (counter.name.trim() || "名前なし") : "削除済みの小役";
  }
  return ({ "+": "＋", "-": "－", "*": "×", "/": "÷", "(": "（", ")": "）" })[token.value] || "?";
}

function formulaDescription(tokens) {
  return tokens.map(tokenLabel).join(" ");
}

// 安全な再帰下降パーサー。evalやFunctionを使わず、四則演算と括弧のみを評価。
// syntaxOnly=trueは保存可否の判定に使い、小役の値が0でも式を保存できる。
function calculateFormula(tokens, syntaxOnly = false) {
  if (!tokens.length || tokens.length > MAX_FORMULA_TOKENS) {
    return { valid: false, note: "計算式を入力してください" };
  }
  let pos = 0;
  let missing = false;
  let missingCounter = false;
  let dividedByZero = false;

  function factor() {
    const token = tokens[pos++];
    if (!token) throw new Error("入力が途中です");
    if (token.type === "op" && token.value === "(") {
      const value = expression();
      const closing = tokens[pos++];
      if (!closing || closing.type !== "op" || closing.value !== ")") {
        throw new Error("括弧が閉じられていません");
      }
      return value;
    }
    if (token.type === "games") {
      const games = syntaxOnly ? 1 : readTotalGames();
      if (games === null) missing = true;
      return games ?? 0;
    }
    if (token.type === "counter") {
      const counter = counterForId(token.id);
      if (!counter && !syntaxOnly) missingCounter = true;
      return syntaxOnly ? 1 : (counter?.count ?? 0);
    }
    throw new Error("小役・総ゲーム数・括弧を入力してください");
  }

  function term() {
    let value = factor();
    while (pos < tokens.length && tokens[pos].type === "op" &&
      (tokens[pos].value === "*" || tokens[pos].value === "/")) {
      const op = tokens[pos++].value;
      const right = factor();
      if (op === "/" && right === 0) dividedByZero = true;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function expression() {
    let value = term();
    while (pos < tokens.length && tokens[pos].type === "op" &&
      (tokens[pos].value === "+" || tokens[pos].value === "-")) {
      const op = tokens[pos++].value;
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  try {
    const value = expression();
    if (pos !== tokens.length) throw new Error("計算式の並びを確認してください");
    if (syntaxOnly) return { valid: true, value };
    if (missingCounter) return { valid: true, value: null, note: "対象の小役が存在しません" };
    if (missing) return { valid: true, value: null, note: "総ゲーム数が未入力です" };
    if (dividedByZero || !Number.isFinite(value)) return { valid: true, value: null, note: "0で割る計算はできません" };
    if (value <= 0) return { valid: true, value: null, note: "計算結果が0以下のため表示できません" };
    return { valid: true, value };
  } catch (error) {
    return { valid: false, note: error.message };
  }
}

// 計算式の値を「1/○○」に換算して表示する。
function probabilityResult(tokens) {
  const result = calculateFormula(tokens);
  if (!result.valid || result.value === null) {
    return { main: "—", note: result.note || "計算できません" };
  }
  const denominator = 1 / result.value;
  if (!Number.isFinite(denominator)) return { main: "—", note: "計算できません" };
  const digits = denominator < 0.01 ? 4 : 2;
  return {
    main: `1/${denominator.toFixed(digits)}`,
    note: `${(result.value * 100).toFixed(2)}%`
  };
}

function renderProbabilityList() {
  probabilityItemsElement.replaceChildren();

  if (probabilityItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "probability-empty";
    empty.textContent = "まだ確率項目がありません。「＋ 確率項目を追加」から作成できます。";
    probabilityItemsElement.appendChild(empty);
  }

  probabilityItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "probability-item";
    const name = document.createElement("div");
    name.className = "probability-item-name";
    name.textContent = item.name || "名前なし";
    const result = document.createElement("strong");
    result.className = "probability-item-result";
    const detail = document.createElement("div");
    detail.className = "probability-item-detail";
    const calculated = probabilityResult(item.tokens);
    result.textContent = calculated.main;
    detail.textContent = calculated.note;
    const expr = document.createElement("div");
    expr.className = "probability-item-expression";
    expr.textContent = formulaDescription(item.tokens);
    const actions = document.createElement("div");
    actions.className = "probability-item-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "編集";
    edit.setAttribute("aria-label", `${item.name || "名前なし"}を編集`);
    edit.addEventListener("click", () => openProbabilityEditor(item.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "probability-delete";
    remove.textContent = "削除";
    remove.setAttribute("aria-label", `${item.name || "名前なし"}を削除`);
    remove.addEventListener("click", function() {
      if (!window.confirm(`「${item.name || "名前なし"}」を削除しますか？`)) return;
      probabilityItems = probabilityItems.filter(entry => entry.id !== item.id);
      saveProbabilityItems();
      renderProbabilityList();
    });
    actions.append(edit, remove);
    card.append(name, result, expr, detail, actions);
    probabilityItemsElement.appendChild(card);
  });
}

function renderFormulaDraft() {
  if (!probabilityDraft) return;
  probabilityFormulaElement.replaceChildren();
  if (probabilityDraft.tokens.length === 0) {
    const prompt = document.createElement("span");
    prompt.className = "probability-formula-placeholder";
    prompt.textContent = "下のボタンから左順に式を作成";
    probabilityFormulaElement.appendChild(prompt);
  } else {
    probabilityDraft.tokens.forEach(token => {
      const chip = document.createElement("span");
      chip.className = "probability-formula-token";
      // 編集中の四則演算記号（＋・－・×・÷）の枠を正方形にする。
      // 括弧・小役・総ゲーム数の枠は従来どおり。
      if (token.type === "op" && ["+", "-", "*", "/"].includes(token.value)) {
        chip.classList.add("formula-operator-square");
      }
      chip.textContent = tokenLabel(token);
      if (token.type === "counter") {
        const counter = counterForId(token.id);
        if (counter) {
          // 編集中の計算式でも、各小役のカウントボタンと同じ配色にする。
          chip.style.backgroundColor = counter.color;
          chip.style.color = getTextColors(counter.color).main;
          // 枠線は演算記号と同じ共通CSSを使う（背景色で上書きしない）。
        } else {
          chip.classList.add("missing");
        }
      }
      probabilityFormulaElement.appendChild(chip);
    });
  }

  const calculated = probabilityResult(probabilityDraft.tokens);
  probabilityPreviewValue.textContent = calculated.main;
  probabilityPreviewNote.textContent = calculated.note;
  const syntax = calculateFormula(probabilityDraft.tokens, true);
  probabilitySaveButton.disabled = !probabilityNameInput.value.trim() || !syntax.valid ||
    probabilityDraft.tokens.some(token => token.type === "counter" && !counterForId(token.id));
  probabilityUndoButton.disabled = probabilityDraft.tokens.length === 0;
  probabilityClearButton.disabled = probabilityDraft.tokens.length === 0;
}

function appendFormulaToken(token) {
  if (!probabilityDraft || probabilityDraft.tokens.length >= MAX_FORMULA_TOKENS) return;
  probabilityDraft.tokens.push(token);
  probabilityCounterMenu.hidden = true;
  probabilityCounterButton.setAttribute("aria-expanded", "false");
  renderFormulaDraft();
}

function openProbabilityEditor(id = null) {
  const item = probabilityItems.find(entry => entry.id === id);
  editingProbabilityId = item ? item.id : null;
  probabilityDraft = item
    ? { name: item.name, tokens: item.tokens.map(token => ({ ...token })) }
    : { name: "", tokens: [] };
  probabilityNameInput.value = probabilityDraft.name;
  probabilityEditorTitle.textContent = item ? "確率項目を編集" : "確率項目を作成";
  probabilityListView.hidden = true;
  probabilityEditor.hidden = false;
  probabilityCounterMenu.hidden = true;
  probabilityCounterButton.setAttribute("aria-expanded", "false");
  renderFormulaDraft();
  appContent.scrollTop = 0;
}

function closeProbabilityEditor() {
  probabilityEditor.hidden = true;
  probabilityListView.hidden = false;
  probabilityCounterMenu.hidden = true;
  probabilityCounterButton.setAttribute("aria-expanded", "false");
  editingProbabilityId = null;
  probabilityDraft = null;
  renderProbabilityList();
  appContent.scrollTop = 0;
}

function refreshProbabilityDisplay() {
  if (probabilityDraft && !probabilityEditor.hidden) renderFormulaDraft();
  else if (probabilityScreen && !probabilityScreen.hidden) renderProbabilityList();
}

probabilityAddButton.addEventListener("click", () => openProbabilityEditor());
probabilityBackButton.addEventListener("click", closeProbabilityEditor);
probabilityNameInput.addEventListener("input", renderFormulaDraft);

document.querySelectorAll("[data-formula-op]").forEach(button => {
  button.addEventListener("click", function() {
    appendFormulaToken({ type: "op", value: button.dataset.formulaOp });
  });
});

probabilityGamesButton.addEventListener("click", function() {
  appendFormulaToken({ type: "games" });
});

probabilityCounterButton.addEventListener("click", function() {
  const shouldOpen = probabilityCounterMenu.hidden;
  probabilityCounterMenu.hidden = !shouldOpen;
  probabilityCounterButton.setAttribute("aria-expanded", String(shouldOpen));
  probabilityCounterMenu.replaceChildren();
  if (!shouldOpen) return;
  // 保存された計算式はモードをまたいで共有。選択メニューのみグループ表示する。
  const groups = [{ id: COMMON_MODE_ID, name: "全モード共通" }, ...modes];
  groups.forEach(group => {
    const members = groupCounters(group.id);
    if (!members.length) return;
    const section = document.createElement("div");
    section.className = "probability-counter-section";
    const heading = document.createElement("h3");
    heading.className = "probability-counter-heading";
    heading.textContent = group.name.trim() || "名前なし";
    const grid = document.createElement("div");
    grid.className = "probability-counter-grid";
    grid.dataset.columns = String(getActiveColumnCount());
    members.forEach((counter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = counter.name.trim() || `カウンター ${index + 1}`;
      button.style.backgroundColor = counter.color;
      button.style.color = getTextColors(counter.color).main;
      button.addEventListener("click", () => appendFormulaToken({ type: "counter", id: counter.id }));
      grid.appendChild(button);
    });
    section.append(heading, grid);
    probabilityCounterMenu.appendChild(section);
  });
});

probabilityUndoButton.addEventListener("click", function() {
  if (!probabilityDraft) return;
  probabilityDraft.tokens.pop();
  renderFormulaDraft();
});
probabilityClearButton.addEventListener("click", function() {
  if (!probabilityDraft || probabilityDraft.tokens.length === 0) return;

  // 誤操作を防ぐため、式をすべて消す前に確認する。
  const confirmed = window.confirm("編集中の計算式をすべてクリアします。\nよろしいですか？");
  if (!confirmed) return;

  probabilityDraft.tokens = [];
  renderFormulaDraft();
});

probabilitySaveButton.addEventListener("click", function() {
  if (!probabilityDraft) return;
  const name = probabilityNameInput.value.trim();
  if (!name || !calculateFormula(probabilityDraft.tokens, true).valid ||
    probabilityDraft.tokens.some(token => token.type === "counter" && !counterForId(token.id))) return;
  const record = {
    id: editingProbabilityId || `prob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name: name.slice(0, 40),
    tokens: probabilityDraft.tokens.map(token => ({ ...token }))
  };
  const index = probabilityItems.findIndex(item => item.id === editingProbabilityId);
  if (index >= 0) probabilityItems[index] = record;
  else probabilityItems.push(record);
  saveProbabilityItems();
  closeProbabilityEditor();
});

// ===================================
// 初期表示
// ===================================

saveCounters();
saveModes();
refreshProbabilityDisplay();

renderCounters();
renderCountHistory();

// HTTPSまたはローカル開発サーバーでService Workerを登録してオフライン動作を可能にする。
if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch(error => console.warn("オフライン機能の登録に失敗しました", error));
  });
}

// ===================================
// 手動横表示（端末の自動回転には依存しない）
// ===================================
const rotateLayoutButton = document.getElementById("rotate-layout");
const LAYOUT_STORAGE_KEY = "manualLandscapeLayoutV1";
let isLandscapeLayout = localStorage.getItem(LAYOUT_STORAGE_KEY) === "landscape";
function applyManualLayout() {
  document.documentElement.classList.toggle("landscape-mode", isLandscapeLayout);
  rotateLayoutButton.setAttribute("aria-pressed", String(isLandscapeLayout));
  rotateLayoutButton.setAttribute("aria-label", isLandscapeLayout ? "縦表示に切り替え" : "横表示に切り替え");
  rotateLayoutButton.title = isLandscapeLayout ? "縦表示に切り替え" : "横表示に切り替え";
  applyColumnCount();
}
rotateLayoutButton.addEventListener("click", () => {
  isLandscapeLayout = !isLandscapeLayout;
  localStorage.setItem(LAYOUT_STORAGE_KEY, isLandscapeLayout ? "landscape" : "portrait");
  applyManualLayout();
  appContent.scrollTop = 0;
});
applyManualLayout();
