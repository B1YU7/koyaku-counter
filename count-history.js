// カウント操作履歴・Undo / Redo。script.js の状態を使用。
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
    const saved = JSON.parse(machineStorage.getItem(HISTORY_STORAGE_KEY) || "null");
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
    machineStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(countHistory));
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
  // 長い小役名は縮小し、折り返して全文を見せる（省略表示はしない）。
  const nameLength = Array.from(entry.counterName).length;
  if (nameLength > 22) nameCell.classList.add("count-history-name-very-long");
  else if (nameLength > 12) nameCell.classList.add("count-history-name-long");

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
  // 他のタブで履歴が変更された場合は表示を保留し、カウンタータブを開いた時に更新。
  if (mainScreen.hidden) return;
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

// カウント操作や履歴の削除後は、最新の行を表示するため一覧だけを先頭へ戻す。
// ページ全体や履歴ヘッダーはスクロールさせない。
function scrollHistoryToTop() {
  countHistoryScrollSpace.style.height = "0px";
  countHistoryScrollArea.scrollTop = 0;
}

// Undo/Redoでは履歴の行を移動・複製せず、青い最新有効行が見出し直下に
// 来るよう履歴一覧だけをスクロールする。ページ全体は動かさない。
function scrollHistoryToLatestApplied() {
  if (document.documentElement.classList.contains("landscape-mode")) return;
  const activeRow = countHistoryList.querySelector("tr.count-history-latest");
  if (!activeRow) {
    scrollHistoryToTop();
    return;
  }
  // 青い行が最後でも見出し直下までスクロールできるよう、一覧の末尾に余白を確保。
  const extra = Math.max(0, countHistoryScrollArea.clientHeight - activeRow.getBoundingClientRect().height);
  countHistoryScrollSpace.style.height = `${Math.ceil(extra)}px`;
  const top = countHistoryScrollArea.getBoundingClientRect().top;
  const rowTop = activeRow.getBoundingClientRect().top;
  countHistoryScrollArea.scrollTop += rowTop - top;
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

  saveCountHistory();
  // 数値だけの変更では、ボタンと長押しイベントを作り直さない。
  if (!refreshVisibleCounterNumber(counterData)) renderCounters();
  renderCountHistory();
  scrollHistoryToTop();
  return true;
}

// 指定された小役の履歴を破棄する（小役そのものを削除した場合）。
function dropDeletedCounterHistory(id) {
  countHistory.past = countHistory.past.filter(entry => entry.counterId !== id);
  countHistory.future = countHistory.future.filter(entry => entry.counterId !== id);
  saveCountHistory();
  renderCountHistory();
  scrollHistoryToTop();
}

function stepCountHistory(isRedo) {
  // 対象の小役が別モードならモードを切り替える。画面全体の位置は維持し、
  // 履歴一覧だけ最新有効行（青い行）へスクロールする。
  const mainScrollTop = appContent.scrollTop;
  const from = isRedo ? countHistory.future : countHistory.past;
  const to = isRedo ? countHistory.past : countHistory.future;
  const entry = from[from.length - 1];
  if (!entry) return;
  const target = counters.find(counter => counter.id === entry.counterId);
  if (!target) {
    from.pop();
    saveCountHistory();
    renderCountHistory();
    scrollHistoryToLatestApplied();
    appContent.scrollTop = mainScrollTop;
    return;
  }
  // 旧履歴に5桁以上の数値が残っていても、Undo/Redoで上限を超えない。
  target.count = Math.min(isRedo ? entry.after : entry.before, MAX_COUNT_VALUE);
  from.pop();
  to.push(entry);
  saveCounters();

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
  appContent.scrollTop = mainScrollTop;
}

countUndoButton.addEventListener("click", () => stepCountHistory(false));
countRedoButton.addEventListener("click", () => stepCountHistory(true));

