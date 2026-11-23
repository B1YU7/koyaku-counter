// 小役カウンター：機種別保存・機種管理・プリセット入出力
// 読み込み順：theme.js → machine.js → script.js → count-history.js → counter-ui.js → settings-ui.js → probability.js → app-init.js
// 既存の保存キーとデータ形式は変更しない。

// ===================================
// 機種別データ管理：v40のデータを初回のみ「機種1」へコピーする。
// 元のキーは削除せず、移行失敗時に元のデータを残す。
// テーマ・手動の縦横表示はアプリ全体で共通、メモは機種ごとに保存する。
// ===================================
const MACHINE_REGISTRY_KEY = "counterMachinesV1";
const ACTIVE_MACHINE_KEY = "counterActiveMachineV1";
const MACHINE_DATA_PREFIX = "counterMachineV1:";
const MACHINE_OWNED_KEYS = [
  "counters", "counterCount", "counterModesV1", "selectedCounterModeV1",
  "counterHistoryV1", "countFontSize", "counterColumns",
  "counterColumnsPortrait", "counterColumnsLandscape", "counterShape",
  "totalGames", "probabilityItems", "counterMemo", "countersRecoveryV1"
];
function newMachineId() {
  return `machine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
function sanitizeMachineList(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter(item => item && typeof item.id === "string" &&
      /^machine-[a-z0-9-]+$/i.test(item.id) && !ids.has(item.id) && ids.add(item.id))
    .map(item => ({ id: item.id, name: typeof item.name === "string" ? item.name.slice(0, 40) : "機種" }));
}
function loadMachineRegistry() {
  let saved = null;
  try { saved = localStorage.getItem(MACHINE_REGISTRY_KEY); }
  catch (error) { throw new Error("機種データの保存領域を読み取れません", { cause: error }); }
  if (saved !== null) {
    // 壊れた管理データを自動上書きすると他機種のデータが見えなくなるので止める。
    let parsed;
    try { parsed = JSON.parse(saved); }
    catch (_) { throw new Error("機種一覧の保存データが壊れています。データは削除していません。"); }
    const items = sanitizeMachineList(parsed);
    if (!items.length) throw new Error("機種一覧を復元できません。データは削除していません。");
    return items;
  }
  const initial = [{ id: "machine-default", name: "機種1" }];
  // v40の保存キーを機種専用領域に退避してから機種一覧を確定する。
  // コピーが途中で失敗しても次回の起動で初回移行をやり直せる。
  MACHINE_OWNED_KEYS.forEach(key => {
    const oldValue = localStorage.getItem(key);
    if (oldValue !== null) localStorage.setItem(`${MACHINE_DATA_PREFIX}${initial[0].id}:${key}`, oldValue);
  });
  localStorage.setItem(MACHINE_REGISTRY_KEY, JSON.stringify(initial));
  return initial;
}
const machines = loadMachineRegistry();
let activeMachineId = localStorage.getItem(ACTIVE_MACHINE_KEY);
if (!machines.some(item => item.id === activeMachineId)) {
  activeMachineId = machines[0].id;
  localStorage.setItem(ACTIVE_MACHINE_KEY, activeMachineId);
}
const machineStorage = {
  getItem(key) { return localStorage.getItem(`${MACHINE_DATA_PREFIX}${activeMachineId}:${key}`); },
  setItem(key, value) { return localStorage.setItem(`${MACHINE_DATA_PREFIX}${activeMachineId}:${key}`, value); },
  removeItem(key) { return localStorage.removeItem(`${MACHINE_DATA_PREFIX}${activeMachineId}:${key}`); }
};
function saveMachineRegistry() {
  localStorage.setItem(MACHINE_REGISTRY_KEY, JSON.stringify(machines));
}
function getActiveMachine() {
  return machines.find(item => item.id === activeMachineId);
}
function hasUncommittedMachineEdits() {
  return typeof probabilityEditor !== "undefined" && probabilityEditor &&
    !probabilityEditor.hidden && typeof hasUnsavedProbabilityChanges === "function" &&
    hasUnsavedProbabilityChanges();
}
function confirmMachineNavigation() {
  return !hasUncommittedMachineEdits() ||
    window.confirm("保存していない計算式があります。変更を破棄して機種を切り替えますか？");
}
function setActiveMachine(id) {
  if (id === activeMachineId || !machines.some(item => item.id === id)) return false;
  if (!confirmMachineNavigation()) return false;
  // 旧データに手を加えず、移動先のIDだけ保存する。再起動で表示と参照を一括更新する。
  localStorage.setItem(ACTIVE_MACHINE_KEY, id);
  // タブは画面を切り替えた位置に復元する。端末全体に保存はしない。
  sessionStorage.setItem("counterMachineTabRestoreV1",
    document.querySelector(".tab-button.active")?.dataset.tab || "counter");
  if (machineSettingsOpen) sessionStorage.setItem("counterMachineSettingsRestoreV1", "machine");
  window.location.reload();
  return true;
}
function renderMachineSelect() {
  const select = document.getElementById("machine-switch");
  select.replaceChildren();
  machines.forEach(machine => {
    const option = document.createElement("option");
    option.value = machine.id;
    option.textContent = machine.name.trim() || "名前なし";
    select.appendChild(option);
  });
  select.value = activeMachineId;
  select.title = getActiveMachine()?.name || "機種";
}
// 機種の並び替え対象と編集対象は、現在カウントしている機種と独立して管理する。
// (editingMachineId / reorderSelectedMachineId は設定画面の状態として後方で宣言。)
function updateMachineReorderSelection() {
  const controls = document.querySelector(".machine-settings-heading > .always-move-controls");
  if (!controls) return;
  syncReorderSelection(machines, reorderSelectedMachineId, controls,
    document.getElementById("machine-settings-list"), ".machine-settings-item", "machineId");
}
function moveSelectedMachine(delta) {
  const index = machines.findIndex(machine => machine.id === reorderSelectedMachineId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= machines.length) return;
  [machines[index], machines[next]] = [machines[next], machines[index]];
  try { saveMachineRegistry(); }
  catch (error) {
    [machines[index], machines[next]] = [machines[next], machines[index]];
    console.error(error);
    window.alert("機種の並び順を保存できませんでした。");
    return;
  }
  // 選択した機種を維持し、現在の機種・各機種のカウント値は変更しない。
  renderMachineSettings();
  renderMachineSelect();
}
function renderMachineSettings() {
  const list = document.getElementById("machine-settings-list");
  const overview = document.getElementById("machine-settings-overview");
  const editDetail = document.getElementById("machine-edit-detail");
  if (!machines.some(machine => machine.id === reorderSelectedMachineId)) reorderSelectedMachineId = null;
  const editingMachine = machines.find(machine => machine.id === editingMachineId);
  if (!editingMachine) editingMachineId = null;
  overview.hidden = !!editingMachineId;
  editDetail.hidden = !editingMachineId;
  if (editingMachine) {
    document.getElementById("machine-name-input").value = editingMachine.name;
    document.getElementById("machine-delete").disabled = machines.length === 1;
  }
  list.replaceChildren();
  machines.forEach((machine, index) => {
    const item = document.createElement("div");
    item.className = "machine-settings-item";
    item.dataset.machineId = machine.id;
    const row = document.createElement("div");
    row.className = "machine-settings-row";
    const selector = createReorderSelector(
      "machine-reorder", machine.id, reorderSelectedMachineId === machine.id,
      `機種「${machine.name.trim() || "名前なし"}」を並び替え対象に選択`, () => {
        reorderSelectedMachineId = machine.id;
        updateMachineReorderSelection();
      });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mode-row-toggle machine-row-toggle";
    toggle.setAttribute("aria-label", `${machine.name.trim() || "名前なし"}の機種設定へ移動`);
    const label = document.createElement("span");
    label.className = "mode-row-name";
    label.textContent = machine.name.trim() || "名前なし";
    const arrow = document.createElement("span");
    arrow.className = "mode-row-arrow";
    arrow.setAttribute("aria-hidden", "true");
    toggle.append(label, arrow);
    toggle.addEventListener("click", () => {
      editingMachineId = machine.id;
      renderMachineSettings();
      appContent.scrollTop = 0;
      settingsMachineBack.focus({ preventScroll: true });
    });
    row.append(selector, toggle);
    item.appendChild(row);
    list.appendChild(item);
  });
  updateMachineReorderSelection();
}
function deleteEditingMachine() {
  const machine = machines.find(item => item.id === editingMachineId);
  if (!machine || machines.length <= 1 || !confirmMachineNavigation()) return;
  if (!window.confirm(`「${machine.name || "名前なし"}」を削除しますか？\nこの機種のカウント値・履歴・メモ・設定も削除され、元に戻せません。`)) return;
  const index = machines.indexOf(machine);
  const wasActive = machine.id === activeMachineId;
  const nextActive = wasActive ? machines[index === 0 ? 1 : index - 1].id : activeMachineId;
  const previousRegistry = localStorage.getItem(MACHINE_REGISTRY_KEY);
  const previousActive = localStorage.getItem(ACTIVE_MACHINE_KEY);
  machines.splice(index, 1);
  try {
    saveMachineRegistry();
    if (wasActive) localStorage.setItem(ACTIVE_MACHINE_KEY, nextActive);
  } catch (error) {
    machines.splice(index, 0, machine);
    try {
      if (previousRegistry === null) localStorage.removeItem(MACHINE_REGISTRY_KEY);
      else localStorage.setItem(MACHINE_REGISTRY_KEY, previousRegistry);
      if (previousActive === null) localStorage.removeItem(ACTIVE_MACHINE_KEY);
      else localStorage.setItem(ACTIVE_MACHINE_KEY, previousActive);
    } catch (restoreError) { console.error("機種管理情報の復元に失敗しました", restoreError); }
    console.error(error);
    window.alert("機種を削除できませんでした。データを確認してください。");
    return;
  }
  // レジストリと選択先を確定してから、この機種の保存領域だけを掃除する。
  MACHINE_OWNED_KEYS.forEach(key => {
    try { localStorage.removeItem(`${MACHINE_DATA_PREFIX}${machine.id}:${key}`); }
    catch (error) { console.error("削除した機種のデータを消去できませんでした", error); }
  });
  editingMachineId = null;
  if (reorderSelectedMachineId === machine.id) reorderSelectedMachineId = null;
  if (wasActive) {
    sessionStorage.setItem("counterMachineTabRestoreV1", "settings");
    sessionStorage.setItem("counterMachineSettingsRestoreV1", "machine");
    window.location.reload();
  } else {
    renderMachineSettings();
    renderMachineSelect();
  }
}
function initMachineControls() {
  const select = document.getElementById("machine-switch");
  const nameInput = document.getElementById("machine-name-input");
  const addButton = document.getElementById("machine-add");
  const deleteButton = document.getElementById("machine-delete");
  const exportButton = document.getElementById("machine-export");
  renderMachineSelect();
  const reorderControls = createMoveControls(false, false,
    () => moveSelectedMachine(-1), () => moveSelectedMachine(1), "選択した機種");
  document.querySelector(".machine-settings-heading").appendChild(reorderControls);
  renderMachineSettings();
  select.addEventListener("change", () => {
    try { if (!setActiveMachine(select.value)) select.value = activeMachineId; }
    catch (error) { console.error(error); window.alert("機種を切り替えられませんでした。保存領域を確認してください。"); select.value = activeMachineId; }
  });
  nameInput.addEventListener("input", () => {
    const machine = machines.find(item => item.id === editingMachineId);
    if (!machine) return;
    const previous = machine.name;
    machine.name = nameInput.value.slice(0, 40);
    try {
      saveMachineRegistry();
      renderMachineSelect();
      // リストに戻ったときだけ名称の最新値で描画する。
    } catch (error) {
      machine.name = previous;
      nameInput.value = previous;
      console.error(error);
      window.alert("機種名を保存できませんでした。");
    }
  });
  addButton.addEventListener("click", () => {
    if (!confirmMachineNavigation()) return;
    let number = 1;
    while (machines.some(item => item.name === `機種${number}`)) number++;
    let id;
    do { id = newMachineId(); } while (machines.some(item => item.id === id));
    const machine = { id, name: `機種${number}` };
    const previousRegistry = localStorage.getItem(MACHINE_REGISTRY_KEY);
    const previousActive = localStorage.getItem(ACTIVE_MACHINE_KEY);
    machines.push(machine);
    try {
      saveMachineRegistry();
      localStorage.setItem(ACTIVE_MACHINE_KEY, machine.id);
      sessionStorage.setItem("counterMachineTabRestoreV1", "settings");
      sessionStorage.setItem("counterMachineSettingsRestoreV1", "machine");
      window.location.reload();
    } catch (error) {
      machines.pop();
      try {
        if (previousRegistry === null) localStorage.removeItem(MACHINE_REGISTRY_KEY);
        else localStorage.setItem(MACHINE_REGISTRY_KEY, previousRegistry);
        if (previousActive === null) localStorage.removeItem(ACTIVE_MACHINE_KEY);
        else localStorage.setItem(ACTIVE_MACHINE_KEY, previousActive);
      } catch (restoreError) { console.error("機種の追加を復元できませんでした", restoreError); }
      console.error(error);
      window.alert("機種を追加できませんでした。保存領域を確認してください。");
    }
  });
  exportButton.addEventListener("click", exportCurrentMachinePreset);
  initMachineImportControls();
  deleteButton.addEventListener("click", deleteEditingMachine);
}

// ===================================
// 機種プリセットのエクスポート（構成のみ、利用データは含めない）
// 取り込み時に新しいIDを採番できるよう、ファイル内の参照IDは通し番号にする。
// ===================================
function buildCurrentMachinePreset() {
  const machine = getActiveMachine();
  if (!machine) throw new Error("選択中の機種が見つかりません。");

  const modeIds = new Map();
  const exportedModes = modes.map((mode, index) => {
    if (modeIds.has(mode.id)) throw new Error("モードの識別子が重複しています。");
    const id = `mode-${index + 1}`;
    modeIds.set(mode.id, id);
    return { id, name: mode.name };
  });

  const counterIds = new Map();
  const exportedCounters = counters.map((counter, index) => {
    if (counterIds.has(counter.id)) throw new Error("小役の識別子が重複しています。");
    const id = `counter-${index + 1}`;
    counterIds.set(counter.id, id);
    const modeId = counter.modeId === COMMON_MODE_ID
      ? COMMON_MODE_ID : modeIds.get(counter.modeId);
    if (!modeId) throw new Error("小役が参照するモードを特定できません。");
    return {
      id,
      modeId,
      name: counter.name,
      color: counter.color
    };
  });

  // 削除済み小役を参照する式も残す。参照先がない状態は取り込み後も保持する。
  const missingIds = new Map();
  const exportedCalculations = probabilityItems.map(item => ({
    name: item.name,
    displayFormat: normalizedProbabilityFormat(item.displayFormat),
    settingDifferences: normalizedSettingDifferences(item.settingDifferences),
    tokens: item.tokens.map(token => {
      if (token.type === "counter") {
        let id = counterIds.get(token.id);
        if (!id) {
          if (!missingIds.has(token.id)) missingIds.set(token.id, `missing-counter-${missingIds.size + 1}`);
          id = missingIds.get(token.id);
        }
        return { type: "counter", id };
      }
      if (token.type === "number") return { type: "number", value: token.value };
      if (token.type === "op") return { type: "op", value: token.value };
      if (token.type === "games") return { type: "games" };
      throw new Error("不明な計算式の要素が含まれています。");
    })
  }));

  return {
    format: "koyaku-counter-machine-preset",
    version: 2,
    machine: {
      name: machine.name,
      modes: exportedModes,
      counters: exportedCounters,
      calculations: exportedCalculations,
      displaySettings: {
        portraitColumns: portraitColumnCount,
        landscapeColumns: landscapeColumnCount,
        buttonShape: counterList.dataset.shape === "circle" ? "circle" : "square",
        countFontSize
      }
    }
  };
}

function exportCurrentMachinePreset() {
  // 書き出すのは保存済みの計算式のみ。入力途中の式は明示的に確認する。
  if (hasUncommittedMachineEdits() &&
      !window.confirm("編集中の計算式に未保存の変更があります。\n保存済みの内容だけをエクスポートしますか？")) return;
  try {
    const data = buildCurrentMachinePreset();
    const json = JSON.stringify(data, null, 2) + "\n";
    const blob = new Blob([json], { type: "application/json" });
    const rawName = (data.machine.name.trim() || "機種").normalize("NFC");
    const filename = (rawName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")
      .replace(/[.\s]+$/g, "").slice(0, 50) || "機種") + ".koyaku.json";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
      link.remove();
      // Safariなどでダウンロードが始まる前にBlob URLを無効化しない。
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) {
    console.error("プリセットのエクスポートに失敗しました", error);
    window.alert("プリセットを書き出せませんでした。機種データまたは保存領域を確認してください。");
  }
}


// ===================================
// v45: 機種プリセットのインポート
// v44で書き出した構成データだけを許可し、読み込み前に検証・プレビューする。
// 保存は必ず新しい機種IDへ行い、既存機種のデータを上書きしない。
// ===================================
const MACHINE_PRESET_FORMAT = "koyaku-counter-machine-preset";
const MAX_PRESET_FILE_BYTES = 1024 * 1024;
const MAX_PRESET_COUNTERS = 200; // 過去の保存済み構成が15件/グループ超でも切り捨てない
const MAX_PRESET_CALCULATIONS = 300;
let pendingMachinePreset = null;
let machineImportBusy = false;

function presetRequirement(valid, message) {
  if (!valid) throw new Error(message);
}

function presetFields(value, expected, label) {
  presetRequirement(value !== null && typeof value === "object" && !Array.isArray(value), `${label}の形式が正しくありません。`);
  presetRequirement(Object.keys(value).length === expected.length &&
    Object.keys(value).every(key => expected.includes(key)), `${label}に未対応の項目があります。`);
}

function presetString(value, maxLength, label) {
  presetRequirement(typeof value === "string" && value.length <= maxLength,
    `${label}が長すぎるか、文字列ではありません。`);
  return value;
}

function validateMachinePreset(source) {
  presetFields(source, ["format", "version", "machine"], "ファイル");
  presetRequirement(source.format === MACHINE_PRESET_FORMAT && [1, 2].includes(source.version),
    "対応していないプリセット形式・バージョンです。");
  const machine = source.machine;
  presetFields(machine, ["name", "modes", "counters", "calculations", "displaySettings"], "機種");
  const name = presetString(machine.name, 40, "機種名");
  presetRequirement(Array.isArray(machine.modes) && machine.modes.length <= MAX_MODES,
    "モード数が上限を超えているか、形式が正しくありません。");
  presetRequirement(Array.isArray(machine.counters) && machine.counters.length >= 1 &&
    machine.counters.length <= MAX_PRESET_COUNTERS,
    "小役数が不正です（1件以上、200件以下）。");
  presetRequirement(Array.isArray(machine.calculations) && machine.calculations.length <= MAX_PRESET_CALCULATIONS,
    "カスタム計算の件数が多すぎるか、形式が正しくありません。");

  const modeIds = new Set();
  const validModes = machine.modes.map((mode, index) => {
    presetFields(mode, ["id", "name"], `モード${index + 1}`);
    presetRequirement(typeof mode.id === "string" && /^mode-[1-9]\d*$/.test(mode.id) &&
      !modeIds.has(mode.id), "モードの識別子が不正・重複しています。");
    modeIds.add(mode.id);
    return { id: mode.id, name: presetString(mode.name, 30, "モード名") };
  });

  const counterIds = new Set();
  const validCounters = machine.counters.map((counter, index) => {
    presetFields(counter, ["id", "modeId", "name", "color"], `小役${index + 1}`);
    presetRequirement(typeof counter.id === "string" && /^counter-[1-9]\d*$/.test(counter.id) &&
      !counterIds.has(counter.id), "小役の識別子が不正・重複しています。");
    counterIds.add(counter.id);
    presetRequirement(counter.modeId === COMMON_MODE_ID || modeIds.has(counter.modeId),
      "小役が存在しないモードを参照しています。");
    presetRequirement(typeof counter.color === "string" && /^#[0-9a-fA-F]{6}$/.test(counter.color),
      "小役の色が正しいHEX形式ではありません。");
    return {
      id: counter.id, modeId: counter.modeId,
      name: presetString(counter.name, 30, "小役名"), color: counter.color.toUpperCase()
    };
  });

  const validCalculations = machine.calculations.map((item, index) => {
    presetFields(item, source.version === 2
      ? ["name", "displayFormat", "tokens", "settingDifferences"]
      : ["name", "displayFormat", "tokens"], `計算項目${index + 1}`);
    if (source.version === 2) {
      presetRequirement(Array.isArray(item.settingDifferences) && item.settingDifferences.length === 6 &&
        item.settingDifferences.every(value => typeof value === "string" && value.length <= 40 &&
          !/[\x00-\x1f\x7f]/.test(value)), "設定差の形式が正しくありません。");
    }
    presetRequirement(item.displayFormat === "percent" || item.displayFormat === "fraction",
      "計算項目の表示形式が不正です。");
    presetRequirement(Array.isArray(item.tokens) && item.tokens.length >= 1 &&
      item.tokens.length <= MAX_FORMULA_TOKENS, "計算式の長さが不正です。");
    const tokens = item.tokens.map(token => {
      presetRequirement(token && typeof token === "object" && !Array.isArray(token),
        "計算式に不正な要素があります。");
      if (token.type === "counter") {
        presetFields(token, ["type", "id"], "計算式の小役");
        presetRequirement(typeof token.id === "string" &&
          (counterIds.has(token.id) || /^missing-counter-[1-9]\d*$/.test(token.id)) &&
          token.id.length <= 100, "計算式の小役参照が不正です。");
        return { type: "counter", id: token.id };
      }
      if (token.type === "number") {
        presetFields(token, ["type", "value"], "計算式の数値");
        presetRequirement(Number.isFinite(token.value) && Math.abs(token.value) <= 1000000000,
          "計算式に扱えない数値が含まれています。");
        return { type: "number", value: token.value };
      }
      if (token.type === "games") {
        presetFields(token, ["type"], "計算式の総ゲーム数");
        return { type: "games" };
      }
      if (token.type === "op") {
        presetFields(token, ["type", "value"], "計算式の演算子");
        presetRequirement(["+", "-", "*", "/", "(", ")"].includes(token.value),
          "計算式に不正な演算子が含まれています。");
        return { type: "op", value: token.value };
      }
      throw new Error("計算式に未対応の要素があります。");
    });
    presetRequirement(calculateFormula(tokens, true).valid, `「${item.name || index + 1}」の計算式が成立しません。`);
    return {
      name: presetString(item.name, 40, "計算項目名"),
      displayFormat: item.displayFormat, tokens,
      settingDifferences: source.version === 2
        ? normalizedSettingDifferences(item.settingDifferences) : normalizedSettingDifferences()
    };
  });

  const settings = machine.displaySettings;
  presetFields(settings, ["portraitColumns", "landscapeColumns", "buttonShape", "countFontSize"], "表示設定");
  presetRequirement(Number.isInteger(settings.portraitColumns) && settings.portraitColumns >= 1 && settings.portraitColumns <= 4,
    "縦表示の列数が不正です。");
  presetRequirement(Number.isInteger(settings.landscapeColumns) && settings.landscapeColumns >= 1 && settings.landscapeColumns <= 6,
    "横表示の列数が不正です。");
  presetRequirement(["square", "circle"].includes(settings.buttonShape), "カウントボタンの形が不正です。");
  presetRequirement([8, 20, 32, 44, 56].includes(settings.countFontSize), "カウント値の文字サイズが不正です。");

  // 入力ファイルのオブジェクトをそのまま保持せず、許可したフィールドだけの新しいデータを返す。
  return {
    name,
    modes: validModes,
    counters: validCounters,
    calculations: validCalculations,
    displaySettings: {
      portraitColumns: settings.portraitColumns,
      landscapeColumns: settings.landscapeColumns,
      buttonShape: settings.buttonShape,
      countFontSize: settings.countFontSize
    }
  };
}

function buildImportedMachineStorage(preset) {
  const usedModeIds = new Set();
  const mappedModes = new Map();
  const importedModes = preset.modes.map(mode => {
    let id;
    do { id = newModeId(); } while (usedModeIds.has(id));
    usedModeIds.add(id);
    mappedModes.set(mode.id, id);
    return { id, name: mode.name };
  });

  const usedCounterIds = new Set();
  const mappedCounters = new Map();
  const importedCounters = preset.counters.map(counter => {
    let id;
    do { id = newCounterId(); } while (usedCounterIds.has(id));
    usedCounterIds.add(id);
    mappedCounters.set(counter.id, id);
    return {
      id, name: counter.name, count: 0, color: counter.color,
      modeId: counter.modeId === COMMON_MODE_ID ? COMMON_MODE_ID : mappedModes.get(counter.modeId)
    };
  });

  const calculations = preset.calculations.map((item, index) => ({
    id: `prob-import-${Date.now().toString(36)}-${index}`,
    name: item.name,
    displayFormat: item.displayFormat,
    settingDifferences: normalizedSettingDifferences(item.settingDifferences),
    tokens: item.tokens.map(token => token.type === "counter"
      ? { type: "counter", id: mappedCounters.get(token.id) || token.id }
      : { ...token })
  }));

  return {
    counterModesV1: JSON.stringify(importedModes),
    selectedCounterModeV1: importedModes[0]?.id || null,
    counters: JSON.stringify(importedCounters),
    probabilityItems: JSON.stringify(calculations),
    counterColumnsPortrait: String(preset.displaySettings.portraitColumns),
    counterColumnsLandscape: String(preset.displaySettings.landscapeColumns),
    counterShape: preset.displaySettings.buttonShape,
    countFontSize: String(preset.displaySettings.countFontSize)
    // countHistoryV1, totalGames, counterMemo は保存しない（新規機種の空データ）。
  };
}

function appendMachinePreviewRow(list, title, value) {
  const term = document.createElement("dt");
  term.textContent = title;
  const detail = document.createElement("dd");
  detail.textContent = String(value);
  list.append(term, detail);
}

function renderMachineImportPreview(preset) {
  const container = document.getElementById("machine-import-preview");
  container.replaceChildren();
  const list = document.createElement("dl");
  appendMachinePreviewRow(list, "機種名", preset.name.trim() || "名前なし");
  appendMachinePreviewRow(list, "モード", `${preset.modes.length}件`);
  appendMachinePreviewRow(list, "小役", `${preset.counters.length}件`);
  appendMachinePreviewRow(list, "カスタム計算", `${preset.calculations.length}件`);
  const s = preset.displaySettings;
  appendMachinePreviewRow(list, "表示設定", `縦${s.portraitColumns}列・横${s.landscapeColumns}列 / ${s.buttonShape === "circle" ? "丸" : "四角"} / ${s.countFontSize}px`);
  container.appendChild(list);
  const groups = [
    ["モード名", preset.modes.map(mode => mode.name.trim() || "名前なし")],
    ["小役名", preset.counters.map(counter => counter.name.trim() || "名前なし")],
    ["計算項目名", preset.calculations.map(calc => calc.name.trim() || "名前なし")]
  ];
  groups.forEach(([label, values]) => {
    if (!values.length) return;
    const details = document.createElement("p");
    details.className = "machine-import-details";
    details.textContent = `${label}：${values.slice(0, 20).join("、")}${values.length > 20 ? `（ほか${values.length - 20}件）` : ""}`;
    container.appendChild(details);
  });
}

function importMachinePreset(preset) {
  const previousRegistry = localStorage.getItem(MACHINE_REGISTRY_KEY);
  const previousActive = localStorage.getItem(ACTIVE_MACHINE_KEY);
  let id;
  do { id = newMachineId(); } while (machines.some(item => item.id === id));
  const data = buildImportedMachineStorage(preset);
  const savedKeys = [];
  let registryUpdated = false;
  let activeUpdated = false;
  let addedMachine = false;
  try {
    // まずは新しい名前空間へ書き込み、成功した場合のみ一覧へ追加する。
    for (const [key, value] of Object.entries(data)) {
      if (value === null) continue;
      const fullKey = `${MACHINE_DATA_PREFIX}${id}:${key}`;
      presetRequirement(localStorage.getItem(fullKey) === null, "保存先が重複したため中止しました。");
      localStorage.setItem(fullKey, value);
      savedKeys.push(fullKey);
    }
    machines.push({ id, name: preset.name });
    addedMachine = true;
    saveMachineRegistry();
    registryUpdated = true;
    // タブ表示は設定に戻す。セッション保存に失敗してもインポート自体は可能。
    try {
      sessionStorage.setItem("counterMachineTabRestoreV1", "settings");
      sessionStorage.setItem("counterMachineSettingsRestoreV1", "machine");
    } catch (_) { /* 表示のみ */ }
    localStorage.setItem(ACTIVE_MACHINE_KEY, id);
    activeUpdated = true;
  } catch (error) {
    // 容量不足等の途中失敗時は、新機種の書き込みだけをロールバックする。
    if (addedMachine) machines.pop();
    if (registryUpdated) {
      try {
        if (previousRegistry === null) localStorage.removeItem(MACHINE_REGISTRY_KEY);
        else localStorage.setItem(MACHINE_REGISTRY_KEY, previousRegistry);
      } catch (restoreError) { console.error("機種一覧を復元できませんでした", restoreError); }
    }
    if (activeUpdated) {
      try {
        if (previousActive === null) localStorage.removeItem(ACTIVE_MACHINE_KEY);
        else localStorage.setItem(ACTIVE_MACHINE_KEY, previousActive);
      } catch (restoreError) { console.error("選択機種を復元できませんでした", restoreError); }
    }
    savedKeys.forEach(key => {
      try { localStorage.removeItem(key); } catch (restoreError) { console.error("新規データを片付けられませんでした", restoreError); }
    });
    throw error;
  }
  window.location.reload();
}

function initMachineImportControls() {
  const chooseButton = document.getElementById("machine-import");
  const fileInput = document.getElementById("machine-import-file");
  const dialog = document.getElementById("machine-import-dialog");
  const cancel = document.getElementById("machine-import-cancel");
  const confirm = document.getElementById("machine-import-confirm");

  chooseButton.addEventListener("click", () => {
    if (machineImportBusy) return;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // 同じファイルを選び直してもイベントが発生する
    if (!file || machineImportBusy) return;
    machineImportBusy = true;
    try {
      presetRequirement(/\.json$/i.test(file.name), "JSON形式のプリセットファイルを選んでください。");
      presetRequirement(file.size > 0 && file.size <= MAX_PRESET_FILE_BYTES,
        "ファイルサイズが不正です（上限1MB）。");
      let parsed;
      try { parsed = JSON.parse(await file.text()); }
      catch (_) { throw new Error("ファイルをJSONとして読み取れませんでした。"); }
      pendingMachinePreset = validateMachinePreset(parsed);
      renderMachineImportPreview(pendingMachinePreset);
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        const p = pendingMachinePreset;
        if (window.confirm(`「${p.name || "名前なし"}」を新しい機種として追加しますか？\nモード${p.modes.length}件・小役${p.counters.length}件・計算${p.calculations.length}件`)) {
          if (confirmMachineNavigation()) importMachinePreset(p);
        }
        pendingMachinePreset = null;
      }
    } catch (error) {
      console.error("プリセットの読み込みに失敗しました", error);
      pendingMachinePreset = null;
      window.alert(`プリセットを読み込めません。\n${error.message}`);
    } finally { machineImportBusy = false; }
  });
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { pendingMachinePreset = null; });
  confirm.addEventListener("click", () => {
    if (!pendingMachinePreset || machineImportBusy) return;
    if (!confirmMachineNavigation()) return;
    machineImportBusy = true;
    confirm.disabled = true;
    try { importMachinePreset(pendingMachinePreset); }
    catch (error) {
      console.error("機種プリセットの保存に失敗しました", error);
      window.alert("機種を追加できませんでした。保存容量やデータを確認してください。既存の機種は変更していません。");
    } finally {
      machineImportBusy = false;
      confirm.disabled = false;
    }
  });
}

