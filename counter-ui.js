// カウンターボタン・列数・文字サイズ・長押し編集。
// ===================================
// カウント値の文字サイズ
// ===================================

const COUNT_FONT_SIZE_KEY = "countFontSize";
const ALLOWED_FONT_SIZES = [8, 20, 32, 44, 56];
function readCountFontSize() {
  const value = Number(machineStorage.getItem(COUNT_FONT_SIZE_KEY));
  // 旧スライダーの保存値は、最も近い選択肢へ移行する。
  return machineStorage.getItem(COUNT_FONT_SIZE_KEY) === null ? 32 :
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
  machineStorage.setItem(COUNT_FONT_SIZE_KEY, String(countFontSize));
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
  const saved = machineStorage.getItem(key) ?? machineStorage.getItem(LEGACY_COLUMN_STORAGE_KEY);
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
  machineStorage.setItem(PORTRAIT_COLUMN_STORAGE_KEY, String(count));
  applyColumnCount();
});

landscapeColumnSelect.addEventListener("change", function() {
  const count = Number(landscapeColumnSelect.value);
  if (!Number.isInteger(count) || count < 1 || count > 6) return;
  landscapeColumnCount = count;
  machineStorage.setItem(LANDSCAPE_COLUMN_STORAGE_KEY, String(count));
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
    machineStorage.setItem(SHAPE_STORAGE_KEY, shape);
  });
});

applyCounterShape(machineStorage.getItem(SHAPE_STORAGE_KEY));


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
  const number = button.parentElement?.querySelector(":scope > .number");
  if (!number) return;
  number.textContent = counterData.count;
  // 4列時と同じボタン幅を基準にし、列数に関係なく選択中の文字サイズを維持する。
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
    title.title = title.textContent; // 名前は省略せず、長い場合は折り返して表示する。

    // 数字を大きく表示するカウントボタン
    const counter = document.createElement("button");
    counter.type = "button";
    counter.className = "counter";
    counter.style.backgroundColor = counterData.color;
    counter.style.color = getTextColors(counterData.color).main;
    counter.title = "長押しで数値を編集・リセット";

    // 数値はカウントボタンの外側に置き、数値部分をタップしても加減算しない。
    const number = document.createElement("div");
    number.className = "number";
    number.setAttribute("aria-hidden", "true");

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

    item.append(number, counter, title);
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
  // 設定画面での編集時には非表示のカウンターを作り直さない。
  // カウンタータブへ戻った時に最新データで再描画する。
  if (mainScreen.hidden) return;
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

