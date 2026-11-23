// 設定画面・小役とモードの編集・並び替え共通UI。
// 設定画面の各アコーディオンに編集状態を保持する。
const counterEditorStates = new Map();
let commonSettingsOpen = false;
let editingModeId = null;
let machineSettingsOpen = false;
let editingMachineId = null;
let reorderSelectedMachineId = null;
let reorderSelectedModeId = null; // モード一覧の並び替え対象。カウンター画面の選択モードとは別。

function editorState(groupId) {
  if (!counterEditorStates.has(groupId)) counterEditorStates.set(groupId, { selectedId: null });
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


// 色変更ボタンの位置に応じて、画面からはみ出しにくい側へ展開する。
function positionColorPicker(panel, item) {
  if (!panel || panel.hidden || !item.isConnected) return;
  const rowRect = item.getBoundingClientRect();
  const scrollRect = appContent.getBoundingClientRect();
  const viewport = window.visualViewport;
  const screenTop = viewport ? viewport.offsetTop : 0;
  const screenBottom = screenTop + (viewport ? viewport.height : window.innerHeight);
  const clipTop = Math.max(scrollRect.top, screenTop) + 8;
  const clipBottom = Math.min(scrollRect.bottom, screenBottom) - 8;
  const above = Math.max(0, rowRect.top - clipTop - 8);
  const below = Math.max(0, clipBottom - rowRect.bottom - 8);
  // 余裕があるときは下に、足りないときは広い方向に表示する。
  const wantsHeight = Math.min(350, panel.scrollHeight || 350);
  const up = below < wantsHeight && above > below;
  panel.classList.toggle("open-up", up);
  panel.style.maxHeight = `${Math.max(90, Math.min(470, up ? above : below))}px`;
}
appContent.addEventListener("scroll", () => {
  const panel = activeColorPickerSection?.querySelector(".color-picker-panel");
  if (panel) positionColorPicker(panel, panel.closest(".setting-item"));
}, { passive: true });

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
  const state = editorState(groupId);
  if (!members.some(counter => counter.id === state.selectedId)) state.selectedId = null;

  // 選択した小役を、右上の共通上下ボタンで移動する。
  // ボタンを作り直さずに行だけ移動し、連続タップを妨げない。
  const heading = panel.querySelector(".counter-settings-heading");
  const moveControls = createMoveControls(false, false,
    () => moveSelectedCounter(-1), () => moveSelectedCounter(1), "選択した小役");
  heading.appendChild(moveControls);
  function updateSelection() {
    const index = members.findIndex(counter => counter.id === state.selectedId);
    const [up, down] = moveControls.querySelectorAll("button");
    up.disabled = index <= 0;
    down.disabled = index < 0 || index >= members.length - 1;
    settingsList.querySelectorAll(".setting-item").forEach((item, i) => {
      const selected = item.dataset.counterId === state.selectedId;
      item.classList.toggle("selected", selected);
      const radio = item.querySelector(".reorder-select");
      if (radio) {
        radio.checked = selected;
        radio.setAttribute("aria-label", `${i + 1}番の小役を並び替え対象に選択`);
      }
      const number = item.querySelector(".setting-number");
      if (number) number.textContent = `${i + 1}.`;
      const input = item.querySelector(".setting-name-row .setting-input");
      if (input) input.setAttribute("aria-label", `${i + 1}番の小役名`);
    });
  }
  function moveSelectedCounter(delta) {
    const index = members.findIndex(counter => counter.id === state.selectedId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= members.length) return;
    const a = counters.indexOf(members[index]);
    const b = counters.indexOf(members[next]);
    [counters[a], counters[b]] = [counters[b], counters[a]];
    [members[index], members[next]] = [members[next], members[index]];
    const rows = settingsList.children;
    const selectedRow = rows[index];
    const adjacentRow = rows[next];
    if (delta < 0) settingsList.insertBefore(selectedRow, adjacentRow);
    else settingsList.insertBefore(adjacentRow, selectedRow);
    saveCounters();
  
    renderCounters();
    updateSelection();
  }
  function deleteCounter(id) {
    if (!window.confirm("この小役を削除しますか？")) return;
    counters = counters.filter(counter => counter.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    dropDeletedCounterHistory(id);
    saveCounters();
  
    renderCounters();
    renderSettings();
  }

  members.forEach((counterData, index) => {

    const item = document.createElement("div");
    item.className = "setting-item";
    item.dataset.counterId = counterData.id;

    // 各行ではなく、右上の共通上下ボタンで選択した小役を移動する。
    const selector = document.createElement("input");
    selector.type = "radio";
    selector.className = "reorder-select";
    selector.name = `counter-reorder-${groupId}`;
    selector.value = counterData.id;
    selector.checked = state.selectedId === counterData.id;
    selector.setAttribute("aria-label", `${index + 1}番の小役を並び替え対象に選択`);
    selector.addEventListener("change", () => {
      state.selectedId = counterData.id;
      updateSelection();
    });

    // 小役名・色・通番の構成は維持する。
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
      if (!panel.hidden) requestAnimationFrame(() => positionColorPicker(panel, item));
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
    hexInput.placeholder = DEFAULT_COUNTER_COLOR;

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
    

      renderCounters();

      updateSelected();
    }


    // 7色相＋グレースケールの8列・7段階。
    // 色系統は縦一列で揃え、上から明るい色→暗い色にする。
    const hues = [0, 28, 53, 120, 183, 225, 282];
    const lights = [76, 67, 58, 49, 40, 31, 22];
    const grayLights = [100, 83, 66, 50, 34, 17, 0];
    lights.forEach((light, rowIndex) => {
      const colors = hues.map(hue => hslToHex(hue, 85, light));
      colors.push(hslToHex(0, 0, grayLights[rowIndex]));
      colors.forEach((color, columnIndex) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "matrix-swatch";
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.title = color;
        swatch.setAttribute("aria-label", columnIndex === 7
          ? `無彩色 ${grayLights[rowIndex]}% ${color}` : color);
        swatch.addEventListener("click", () => applyColor(color));
        matrix.appendChild(swatch);
      });
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

    const nameEdit = document.createElement("div");
    nameEdit.className = "setting-name-edit";
    const clearName = document.createElement("button");
    clearName.type = "button";
    clearName.className = "setting-name-clear";
    clearName.textContent = "×";
    clearName.setAttribute("aria-label", "小役名をすべて消去");
    function updateClearName() { clearName.hidden = !input.value; }
    input.addEventListener("input", updateClearName);
    clearName.addEventListener("pointerdown", event => event.preventDefault());
    clearName.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus({ preventScroll: true });
      updateClearName();
    });
    updateClearName();
    nameEdit.append(input, clearName);
    nameRow.append(selector, orderNumber, nameEdit, colorSection);

    item.append(nameRow);
    installRowActions(item, () => deleteCounter(counterData.id), `小役「${counterData.name || "名前なし"}」`);
    settingsList.appendChild(item);

  });


  updateSelection();

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
  settingsOverview.hidden = !!editingModeId || machineSettingsOpen;
  settingsMachineDetail.hidden = !machineSettingsOpen || !!editingModeId;
  if (machineSettingsOpen && !editingModeId) renderMachineSettings();
  settingsModeDetail.hidden = !editingModeId;
  settingsModeDetailContent.replaceChildren();
  if (editingModeId) {
    settingsModeDetailTitle.value = editingMode.name;
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

// 機種・モード・計算項目で共通の「選択して上下移動」表示更新。
// 並び替え対象は、実際に使用中の機種／モードとは独立した選択状態。
function syncReorderSelection(items, selectedId, controls, list, rowSelector, datasetKey) {
  const index = items.findIndex(item => item.id === selectedId);
  const [up, down] = controls.querySelectorAll("button");
  up.disabled = index <= 0;
  down.disabled = index < 0 || index >= items.length - 1;
  list.querySelectorAll(rowSelector).forEach(row => {
    const selected = row.dataset[datasetKey] === selectedId;
    row.classList.toggle("selected", selected);
    const radio = row.querySelector(".reorder-select");
    if (radio) radio.checked = selected;
  });
}

// 機種・モード・計算項目で共通の並び替え用ラジオ。
// カウント対象の選択状態とは混同せず、並び順の選択だけを切り替える。
function createReorderSelector(name, id, selected, ariaLabel, onChange) {
  const selector = document.createElement("input");
  selector.type = "radio";
  selector.className = "reorder-select";
  selector.name = name;
  selector.value = id;
  selector.checked = selected;
  selector.setAttribute("aria-label", ariaLabel);
  selector.addEventListener("change", onChange);
  return selector;
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
  // 未編集中の名前を長押ししても編集キーボードを開かない。
  // 短いタップのみ、pointerup上で明示的に入力欄をフォーカスする。
  const nameInput = row.querySelector(".setting-name-row .setting-input");
  if (nameInput) {
    nameInput.addEventListener("touchstart", event => {
      if (document.activeElement !== nameInput && event.cancelable) event.preventDefault();
    }, { passive: false });
  }
  let tapNameInput = null;
  row.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch") return;
    if (event.target.closest(".gesture-context-menu,.always-move-controls,.reorder-select,.color-open-button,.color-picker-panel,.setting-name-clear")) return;
    tapNameInput = event.target.closest(".setting-name-row .setting-input");
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
      tapNameInput = null;
    }
  });
  function finish() {
    pressed = false;
    clearTimeout(pressTimer);
  }
  row.addEventListener("pointerup", event => {
    const shouldFocus = event.pointerType === "touch" && tapNameInput && !triggered && pressed;
    const targetInput = tapNameInput;
    tapNameInput = null;
    finish();
    if (shouldFocus && targetInput) targetInput.focus({ preventScroll: true });
  });
  row.addEventListener("pointercancel", () => { tapNameInput = null; finish(); });
  row.addEventListener("pointerleave", event => {
    if (event.pointerType === "touch") { tapNameInput = null; finish(); }
  });
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
  scrollHistoryToTop();
  modes.splice(index, 1);
  if (reorderSelectedModeId === modeId) reorderSelectedModeId = null;
  counterEditorStates.delete(modeId);
  if (editingModeId === modeId) editingModeId = null;
  if (selectedModeId === modeId) selectedModeId = modes[0]?.id || null;
  saveCounters();
  saveModes();
  renderSettings();
  renderCounters();

}

function moveSelectedMode(delta) {
  const index = modes.findIndex(mode => mode.id === reorderSelectedModeId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= modes.length) return;
  [modes[index], modes[next]] = [modes[next], modes[index]];
  const selectedRow = modeSettingsList.children[index];
  const adjacentRow = modeSettingsList.children[next];
  if (delta < 0) modeSettingsList.insertBefore(selectedRow, adjacentRow);
  else modeSettingsList.insertBefore(adjacentRow, selectedRow);
  saveModes();
  renderCounters();
  updateModeReorderSelection();
}

// モード一覧でも各行には選択ボタンだけ、上下操作は右上にまとめる。
const modeReorderControls = createMoveControls(false, false,
  () => moveSelectedMode(-1), () => moveSelectedMode(1), "選択したモード");
document.querySelector(".mode-settings-heading").appendChild(modeReorderControls);
function updateModeReorderSelection() {
  syncReorderSelection(modes, reorderSelectedModeId, modeReorderControls,
    modeSettingsList, ".mode-settings-item", "modeId");
}

function renderModeSettings() {
  if (!modes.some(mode => mode.id === reorderSelectedModeId)) reorderSelectedModeId = null;
  modeSettingsList.replaceChildren();
  modes.forEach((mode, index) => {
    const item = document.createElement("div");
    item.className = "mode-settings-item";
    item.dataset.modeId = mode.id;
    const row = document.createElement("div");
    row.className = "mode-settings-row";
    const selector = createReorderSelector(
      "mode-reorder", mode.id, reorderSelectedModeId === mode.id,
      `モード「${mode.name || "名前なし"}」を並び替え対象に選択`, () => {
        reorderSelectedModeId = mode.id;
        updateModeReorderSelection();
      });
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
      // 機種設定内のモード詳細から戻るときも、機種設定の一覧に復帰する。
      machineSettingsOpen = true;
      editingModeId = mode.id;
      renderSettings();
      appContent.scrollTop = 0;
      settingsModeBack.focus({ preventScroll: true });
    });
    row.append(selector, toggle);
    item.appendChild(row);
    modeSettingsList.appendChild(item);
  });
  updateModeReorderSelection();
}

// 機種設定へは設定一覧から遷移し、戻る操作で一覧へ戻す。
settingsMachineOpen.addEventListener("click", () => {
  editingModeId = null;
  editingMachineId = null;
  machineSettingsOpen = true;
  renderSettings();
  appContent.scrollTop = 0;
  settingsMachineBack.focus({ preventScroll: true });
});
settingsMachineBack.addEventListener("click", () => {
  if (editingMachineId) {
    editingMachineId = null;
    renderMachineSettings();
    appContent.scrollTop = 0;
    return;
  }
  machineSettingsOpen = false;
  renderSettings();
  appContent.scrollTop = 0;
  settingsMachineOpen.focus({ preventScroll: true });
});

settingsModeDetailTitle.addEventListener("input", () => {
  const mode = modes.find(entry => entry.id === editingModeId);
  if (!mode) return;
  mode.name = settingsModeDetailTitle.value.slice(0, 30);
  saveModes();
  renderCounterModeTabs();

});
settingsModeDelete.addEventListener("click", () => {
  if (editingModeId) deleteMode(editingModeId);
});

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

