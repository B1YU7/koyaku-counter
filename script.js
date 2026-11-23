// 小役カウンター：機種別カウンターデータ・保存・メモ・タブ・総ゲーム数
// 読み込み順：theme.js → machine.js → script.js → count-history.js → counter-ui.js → settings-ui.js → probability.js → app-init.js
// 既存の保存キーとデータ形式は変更しない。

// ===================================
// 基本設定
// ===================================

const MAX_COUNTERS = 15;
const MAX_MODES = 3;
const MIN_COUNTERS = 1;
// 小役ごとのカウント値は3桁（0〜999）まで。総ゲーム数には適用しない。
const MAX_COUNT_VALUE = 999;

const DEFAULT_COUNTER_COLOR = "#647F91"; // 明暗どちらの画面でも背景と区別しやすい中間色

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
    const saved = machineStorage.getItem(MODE_STORAGE_KEY);
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
let selectedModeId = modes.some(mode => mode.id === machineStorage.getItem(SELECTED_MODE_KEY))
  ? machineStorage.getItem(SELECTED_MODE_KEY) : (modes[0]?.id || null);

function saveModes() {
  machineStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(modes));
  if (selectedModeId) machineStorage.setItem(SELECTED_MODE_KEY, selectedModeId);
  else machineStorage.removeItem(SELECTED_MODE_KEY);
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


// 起動時は読み込みのみ。保存データが壊れていても初期値で上書きしない。
// 前回の正常なカウンター値の控えは機種ごとに別キーへ保存する。
const COUNTER_RECOVERY_KEY = "countersRecoveryV1";
function decodeSavedCounters(raw, label) {
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error(`${label}をJSONとして読み込めません。`); }
  if (!Array.isArray(data) || data.length === 0 || data.length > 500) {
    throw new Error(`${label}の形式が正しくありません。`);
  }
  const loaded = data.map((item, index) => {
    if (Number.isSafeInteger(item) && item >= 0) {
      return createCounter(`カウンター ${index + 1}`, item);
    }
    if (item && typeof item === "object" &&
        Number.isSafeInteger(item.count) && item.count >= 0) {
      return createCounter(
        typeof item.name === "string" ? item.name.slice(0, 30) : `カウンター ${index + 1}`,
        item.count,
        normalizeHex(item.color || "") || DEFAULT_COUNTER_COLOR,
        typeof item.id === "string" && /^counter-[a-z0-9-]+$/i.test(item.id)
          ? item.id : newCounterId(),
        item.modeId === COMMON_MODE_ID || modes.some(mode => mode.id === item.modeId)
          ? item.modeId : (modes[0]?.id || COMMON_MODE_ID)
      );
    }
    throw new Error(`${label}の${index + 1}件目を復元できません。`);
  });
  // 無効な項目を黙って削除して保存し直すことはしない。
  const ids = new Set(loaded.map(item => item.id));
  if (ids.size !== loaded.length) throw new Error(`${label}に重複した小役IDがあります。`);
  return loaded;
}
function loadCounters() {
  const saved = machineStorage.getItem(STORAGE_KEY);
  const recovery = machineStorage.getItem(COUNTER_RECOVERY_KEY);
  let primaryError = null;
  if (saved !== null) {
    try { return decodeSavedCounters(saved, "カウンターの保存データ"); }
    catch (error) { primaryError = error; console.error(error); }
  }
  if (recovery !== null) {
    try {
      const restored = decodeSavedCounters(recovery, "カウンターの控え");
      console.warn("カウンターの保存データを控えから復元しました。元のキーは起動時には上書きしません。");
      return restored;
    } catch (error) {
      console.error("カウンターの控えを読み込めませんでした", error);
    }
  }
  if (saved !== null || recovery !== null) {
    // 保存データに問題があってもゼロで上書きしない。実行を停止する。
    window.alert("カウンターの保存データを読み込めませんでした。\nカウント値を保護するため、初期値で上書きせず停止します。\nアプリのデータを消さずに確認してください。");
    throw primaryError || new Error("カウンターデータを復元できませんでした。保存領域は変更していません。");
  }

  // 古い単一カウンターのデータを引き継ぐ。
  const oldSaved = machineStorage.getItem(OLD_STORAGE_KEY);
  if (oldSaved !== null) {
    const oldCount = Number(oldSaved);
    if (Number.isSafeInteger(oldCount) && oldCount >= 0) {
      return [createCounter("カウンター 1", oldCount)];
    }
    window.alert("古いカウンターデータを読み込めませんでした。上書きを防ぐため停止します。");
    throw new Error("旧カウンターの保存値が不正です。");
  }
  // カウンターだけが失われた形跡があれば、新規データとして初期化しない。
  const history = machineStorage.getItem("counterHistoryV1");
  if (history !== null && history !== "" && history !== '{"past":[],"future":[]}') {
    window.alert("カウント履歴はありますが、カウンター本体が見つかりません。\nデータ保護のため自動初期化を中止しました。");
    throw new Error("カウンター本体がないのに操作履歴が残っています。");
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
const settingsMachineDetail = document.getElementById("settings-machine-detail");
const settingsMachineOpen = document.getElementById("settings-machine-open");
const settingsMachineBack = document.getElementById("settings-machine-back");
const settingsModeDetail = document.getElementById("settings-mode-detail");
const settingsModeDetailTitle = document.getElementById("settings-mode-detail-title");
const settingsModeDelete = document.getElementById("settings-mode-delete");
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
  const data = JSON.stringify(counters);
  // メイン保存に成功した場合のみ、正常な内容の控えも更新する。
  machineStorage.setItem(STORAGE_KEY, data);
  try { machineStorage.setItem(COUNTER_RECOVERY_KEY, data); }
  catch (error) { console.warn("カウンターの予備保存に失敗しました", error); }
}

// ===================================
// 全カウンターリセット
// ===================================

resetAllButton.addEventListener("click", function() {

  // 実行前に確認する
  const confirmed = window.confirm(
    "現在の機種の全カウンター・総ゲーム数・履歴をリセットします。\nほかの機種のデータは変更されません。\nよろしいですか？"
  );

  if (!confirmed) return;

  // 選択中の機種の総ゲーム数だけを0にする。他機種には触れない。
  // 保存失敗時に画面の値を消さないよう、保存を先に行う。
  try {
    machineStorage.setItem(GAMES_STORAGE_KEY, "0");
  } catch (error) {
    console.error("総ゲーム数のリセットを保存できませんでした", error);
    window.alert("総ゲーム数を保存できなかったため、リセットを中止しました。");
    return;
  }
  totalGamesInput.value = "0";

  // カウントを0にする（名前・色・並び順は残す）
  counters.forEach(counterData => {
    counterData.count = 0;
  });

  countHistory = { past: [], future: [] };
  historyShown = HISTORY_PAGE_SIZE;
  saveCounters();

  saveCountHistory();
  renderCounters();
  renderCountHistory();
  scrollHistoryToTop();

});


// ===================================
// メモ：入力の自動保存と個別リセット
// ===================================

const MEMO_STORAGE_KEY = "counterMemo";
const MACHINE_MEMO_MIGRATION_KEY = "counterMachineMemoMigratedV1";

// v41まではメモが全機種共通だった。初回だけ、現在選択中の機種へコピーする。
// 元の全体メモは削除せず残し、移行済みの印を保存して他機種へ再コピーしない。
if (localStorage.getItem(MACHINE_MEMO_MIGRATION_KEY) !== "1") {
  const legacyMemo = localStorage.getItem(MEMO_STORAGE_KEY);
  if (legacyMemo !== null && machineStorage.getItem(MEMO_STORAGE_KEY) === null) {
    machineStorage.setItem(MEMO_STORAGE_KEY, legacyMemo);
  }
  localStorage.setItem(MACHINE_MEMO_MIGRATION_KEY, "1");
}

// 選択中の機種に保存されたメモを復元する。
memoInput.value = machineStorage.getItem(MEMO_STORAGE_KEY) || "";

// 入力のたびに選択中の機種へ保存するため、保存ボタンは不要。
memoInput.addEventListener("input", function() {
  machineStorage.setItem(MEMO_STORAGE_KEY, memoInput.value);
});

// 現在の機種のメモだけを削除する（他機種には触れない）。
resetMemoButton.addEventListener("click", function() {
  const confirmed = window.confirm(
    "この機種のメモをすべて削除します。\nよろしいですか？"
  );

  if (!confirmed) return;

  memoInput.value = "";
  machineStorage.setItem(MEMO_STORAGE_KEY, "");
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

  // 現在のタブを再タップしたときだけ、詳細画面から一覧に戻る。
  // すでに一覧（トップ）にいる場合はスクロール位置も変更しない。
  const activeTab = document.querySelector(".tab-button.active")?.dataset.tab;
  if (activeTab === tabName) {
    if (tabName === "settings" && editingModeId) {
      settingsModeBack.click();
    } else if (tabName === "settings" && machineSettingsOpen) {
      settingsMachineBack.click();
    } else if (tabName === "probability" && !probabilityEditor.hidden) {
      if (hasUnsavedProbabilityChanges() &&
          !window.confirm("保存していない変更があります。\n変更を破棄して一覧に戻りますか？")) return;
      closeProbabilityEditor();
    }
    return;
  }

  Object.entries(tabScreens).forEach(([name, screen]) => {
    screen.hidden = name !== tabName;
  });

  tabButtons.forEach(button => {
    const selected = button.dataset.tab === tabName;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  // リセットは表示しているタブ専用。
  resetAllButton.hidden = tabName !== "counter";
  resetMemoButton.hidden = tabName !== "memo";
  syncProbabilityReorderHeader();

  // 設定タブを離れたら詳細・行の操作メニューを閉じる。
  if (tabName !== "settings") {
    editingModeId = null;
    editingMachineId = null;
    machineSettingsOpen = false;
    if (activeRowActionClose) activeRowActionClose();
  }

  // 設定・確率タブを開くときに保存済みデータから最新表示にする。
  if (tabName === "settings") renderSettings();
  if (tabName === "counter") {
    renderCounters();
    renderCountHistory();
  }
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
  const raw = machineStorage.getItem(GAMES_STORAGE_KEY);
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
  machineStorage.setItem(GAMES_STORAGE_KEY, digits);

});

