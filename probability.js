// 小役カウンター：カスタム計算・設定差・参照項目
// 読み込み順：theme.js → machine.js → script.js → count-history.js → counter-ui.js → settings-ui.js → probability.js → app-init.js
// 既存の保存キーとデータ形式は変更しない。

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
const probabilityEditorDeleteButton = document.getElementById("probability-editor-delete");
const probabilityFormatButtons = document.querySelectorAll("[data-probability-format]");
const probabilityNameInput = document.getElementById("probability-name");
const probabilityFormulaElement = document.getElementById("probability-formula");
const probabilityCounterButton = document.getElementById("probability-counter");
const probabilityCounterMenu = document.getElementById("probability-counter-menu");
const probabilityNumberForm = document.getElementById("probability-number-form");
const probabilityNumberInput = document.getElementById("probability-number-input");
const probabilityNumberError = document.getElementById("probability-number-error");
const probabilityDiffToggle = document.getElementById("probability-diff-toggle");
const probabilityDiffInputs = document.getElementById("probability-diff-inputs");
const probabilityDiffFields = [...document.querySelectorAll("[data-setting-index]")];
// 保存済みの値は編集するまで変更しない。分子が1以外の数値は等価な分母で表示する。
function normalizeSettingDifferenceNumber(value) {
  return value.replace(/[０-９]/g, ch => String(ch.charCodeAt(0) - 0xFF10)).replace(/．/g, ".");
}
function isSettingDifferenceNumber(value) {
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value));
}
function settingDifferenceDenominator(value) {
  if (!value) return "";
  const parts = value.split(/[/／]/).map(part => normalizeSettingDifferenceNumber(part.trim()));
  if (parts.length === 1) return isSettingDifferenceNumber(parts[0]) ? parts[0] : null;
  if (parts.length !== 2) return null;
  const [numerator, denominator] = parts;
  if (!isSettingDifferenceNumber(numerator) || !isSettingDifferenceNumber(denominator)) return null;
  const n = Number(numerator), d = Number(denominator);
  if (n === 1) return denominator;
  const result = d / n;
  const text = String(result);
  return n > 0 && d > 0 && isSettingDifferenceNumber(text) ? text : null;
}
const probabilityUndoButton = document.getElementById("probability-undo");
const probabilityClearButton = document.getElementById("probability-clear");
const probabilityPreviewValue = document.getElementById("probability-preview-value");
const probabilityPreviewNote = document.getElementById("probability-preview-note");
const probabilitySaveButton = document.getElementById("probability-save");

function validFormulaToken(token) {
  if (!token || typeof token !== "object") return false;
  if (token.type === "games") return true;
  if (token.type === "counter") return typeof token.id === "string" && token.id.length <= 100;
  if (token.type === "number") return typeof token.value === "number" &&
    Number.isFinite(token.value) && Math.abs(token.value) <= 1000000000;
  return token.type === "op" && ["+", "-", "*", "/", "(", ")"].includes(token.value);
}

// 設定1〜6の参考値。表示専用であり、計算式の演算には使用しない。
function normalizedSettingDifferences(value) {
  return Array.from({ length: 6 }, (_, index) =>
    Array.isArray(value) && typeof value[index] === "string"
      ? value[index].replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 40) : "");
}

// 旧データは従来の「1/○○」表示を維持する。
function normalizedProbabilityFormat(format) {
  return format === "percent" ? "percent" : "fraction";
}

function loadProbabilityItems() {
  try {
    const raw = JSON.parse(machineStorage.getItem(PROBABILITY_STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item === "object" &&
      typeof item.id === "string" && typeof item.name === "string" &&
      Array.isArray(item.tokens) && item.tokens.length <= MAX_FORMULA_TOKENS &&
      item.tokens.every(validFormulaToken))
      .map(item => ({
        id: item.id,
        name: item.name.slice(0, 40),
        tokens: item.tokens.map(token => ({ ...token })),
        displayFormat: normalizedProbabilityFormat(item.displayFormat),
        settingDifferences: normalizedSettingDifferences(item.settingDifferences)
      }));
  } catch (error) {
    console.error("確率項目の読み込みエラー", error);
    return [];
  }
}

let probabilityItems = loadProbabilityItems();
let reorderSelectedProbabilityId = null;
const probabilityReorderContainer = document.getElementById("probability-reorder-controls");
const probabilityReorderControls = createMoveControls(false, false,
  () => moveSelectedProbability(-1), () => moveSelectedProbability(1), "選択した計算項目");
probabilityReorderContainer.appendChild(probabilityReorderControls);
function syncProbabilityReorderHeader() {
  probabilityReorderContainer.hidden = probabilityScreen.hidden || !probabilityEditor.hidden;
}
function updateProbabilityReorderSelection() {
  syncReorderSelection(probabilityItems, reorderSelectedProbabilityId,
    probabilityReorderControls, probabilityItemsElement, ".probability-item", "probabilityId");
}
function moveSelectedProbability(delta) {
  const index = probabilityItems.findIndex(item => item.id === reorderSelectedProbabilityId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= probabilityItems.length) return;
  [probabilityItems[index], probabilityItems[next]] = [probabilityItems[next], probabilityItems[index]];
  const current = probabilityItemsElement.children[index];
  const neighbor = probabilityItemsElement.children[next];
  if (delta < 0) probabilityItemsElement.insertBefore(current, neighbor);
  else probabilityItemsElement.insertBefore(neighbor, current);
  saveProbabilityItems();
  updateProbabilityReorderSelection();
}
let probabilityDraft = null;
let editingProbabilityId = null;
const expandedProbabilityDiffIds = new Set();
// 編集開始時の内容と比較し、実際に保存していない変更がある場合だけ警告する。
let probabilityInitialState = null;

function hasUnsavedProbabilityChanges() {
  if (!probabilityDraft || !probabilityInitialState) return false;
  return probabilityNameInput.value !== probabilityInitialState.name ||
    probabilityDraft.displayFormat !== probabilityInitialState.displayFormat ||
    JSON.stringify(probabilityDraft.tokens) !== probabilityInitialState.tokens ||
    JSON.stringify(probabilityDraft.settingDifferences) !== probabilityInitialState.settingDifferences ||
    probabilityNumberInput.value.trim() !== "";
}

function saveProbabilityItems() {
  machineStorage.setItem(PROBABILITY_STORAGE_KEY, JSON.stringify(probabilityItems));
}

function counterForId(id) {
  return counters.find(counter => counter.id === id);
}

function tokenLabel(token) {
  if (token.type === "number") return String(token.value);
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

// 数式の見た目を保ちながら、参照している小役と総ゲーム数を現在の数値に置き換える。
// 保存する式そのものは変更せず、設定判別タブを開いた時点の値を表示する。
function formulaWithCountValues(tokens) {
  const games = readTotalGames();
  return tokens.map(token => {
    if (token.type === "games") return games === null ? "未入力" : String(games);
    if (token.type === "counter") {
      const counter = counterForId(token.id);
      return counter ? String(counter.count) : "削除済み";
    }
    return tokenLabel(token);
  }).join(" ");
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
    if (token.type === "number") return token.value;
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
    throw new Error("小役・総ゲーム数・数値・括弧を入力してください");
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
    if (missing) return { valid: true, value: null, note: "" };
    if (dividedByZero || !Number.isFinite(value)) return { valid: true, value: null, note: "" };
    if (value <= 0) return { valid: true, value: null, note: "計算結果が0以下のため表示できません" };
    return { valid: true, value };
  } catch (error) {
    return { valid: false, note: error.message };
  }
}

// 計算式はそのままに、保存した表示形式（分数または%）で結果を1つだけ表示する。
function probabilityResult(tokens, displayFormat = "fraction") {
  const result = calculateFormula(tokens);
  if (!result.valid || result.value === null) {
    return { main: "—", note: result.note ?? "計算できません" };
  }
  if (normalizedProbabilityFormat(displayFormat) === "percent") {
    return { main: `${(result.value * 100).toFixed(1)}%`, note: "" };
  }
  const denominator = 1 / result.value;
  if (!Number.isFinite(denominator)) return { main: "—", note: "計算できません" };
  return { main: `1/${denominator.toFixed(1)}`, note: "" };
}

function renderProbabilityList() {
  if (!probabilityItems.some(item => item.id === reorderSelectedProbabilityId)) reorderSelectedProbabilityId = null;
  probabilityItemsElement.replaceChildren();

  if (probabilityItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "probability-empty";
    empty.textContent = "まだ計算項目がありません。「＋ 計算項目を追加」から作成できます。";
    probabilityItemsElement.appendChild(empty);
  }

  probabilityItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "probability-item";
    card.dataset.probabilityId = item.id;
    const selector = createReorderSelector(
      "probability-reorder", item.id, reorderSelectedProbabilityId === item.id,
      `${item.name || "名前なし"}を並び替え対象に選択`, () => {
        reorderSelectedProbabilityId = item.id;
        updateProbabilityReorderSelection();
      });
    const name = document.createElement("div");
    name.className = "probability-item-name";
    name.textContent = item.name || "名前なし";
    name.title = name.textContent;
    const result = document.createElement("strong");
    result.className = "probability-item-result";
    const detail = document.createElement("div");
    detail.className = "probability-item-detail";
    const calculated = probabilityResult(item.tokens, item.displayFormat);
    result.textContent = calculated.main;
    detail.textContent = calculated.note;
    const expr = document.createElement("div");
    expr.className = "probability-item-expression";
    expr.textContent = formulaDescription(item.tokens);
    expr.title = expr.textContent;
    const substituted = document.createElement("div");
    substituted.className = "probability-item-substituted";
    substituted.textContent = formulaWithCountValues(item.tokens);
    substituted.title = substituted.textContent;
    const actions = document.createElement("div");
    actions.className = "probability-item-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "編集";
    edit.setAttribute("aria-label", `${item.name || "名前なし"}を編集`);
    edit.addEventListener("click", () => openProbabilityEditor(item.id));
    actions.appendChild(edit);
    const nameRow = document.createElement("div");
    nameRow.className = "probability-item-name-row";
    // 編集ボタンは各計算項目の右上に置く。並び替え選択と項目名は従来どおり。
    nameRow.append(selector, name, actions);
    card.append(nameRow, result, expr, substituted);
    // 成功時の小さな百分率は廃止。入力エラー等の説明だけを残す。
    if (calculated.note) card.appendChild(detail);

    const values = normalizedSettingDifferences(item.settingDifferences);
    const filled = values.filter(Boolean).length;
    if (filled > 0) {
      const diffToggle = document.createElement("button");
      diffToggle.type = "button";
      diffToggle.className = "probability-item-diff-toggle";
      diffToggle.textContent = "設定差";
      diffToggle.setAttribute("aria-expanded", String(expandedProbabilityDiffIds.has(item.id)));
      const diffBody = document.createElement("div");
      diffBody.className = "probability-item-diff-body";
      diffBody.hidden = !expandedProbabilityDiffIds.has(item.id);
      const diffList = document.createElement("dl");
      diffList.className = "probability-item-diff-list";
      values.forEach((value, index) => {
        const term = document.createElement("dt");
        term.textContent = `設定${index + 1}`;
        const description = document.createElement("dd");
        description.textContent = value || "—";
        diffList.append(term, description);
      });
      diffBody.appendChild(diffList);
      diffToggle.addEventListener("click", () => {
        const open = diffBody.hidden;
        diffBody.hidden = !open;
        diffToggle.setAttribute("aria-expanded", String(open));
        if (open) expandedProbabilityDiffIds.add(item.id);
        else expandedProbabilityDiffIds.delete(item.id);
      });
      card.append(diffToggle, diffBody);
    } else {
      expandedProbabilityDiffIds.delete(item.id);
    }
    probabilityItemsElement.appendChild(card);
  });
  updateProbabilityReorderSelection();
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

  const calculated = probabilityResult(probabilityDraft.tokens, probabilityDraft.displayFormat);
  probabilityPreviewValue.textContent = calculated.main;
  probabilityPreviewNote.textContent = calculated.note;
  probabilityPreviewNote.hidden = !calculated.note;
  probabilityFormatButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.probabilityFormat === probabilityDraft.displayFormat));
  });
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
  probabilityNumberForm.reset();
  probabilityNumberError.hidden = true;
  probabilityNumberError.textContent = "";
  const item = probabilityItems.find(entry => entry.id === id);
  editingProbabilityId = item ? item.id : null;
  probabilityDraft = item
    ? { name: item.name, tokens: item.tokens.map(token => ({ ...token })),
        displayFormat: normalizedProbabilityFormat(item.displayFormat),
        settingDifferences: normalizedSettingDifferences(item.settingDifferences) }
    : { name: "", tokens: [], displayFormat: "fraction", settingDifferences: normalizedSettingDifferences() };
  probabilityNameInput.value = probabilityDraft.name;
  probabilityInitialState = {
    name: probabilityDraft.name,
    tokens: JSON.stringify(probabilityDraft.tokens),
    displayFormat: probabilityDraft.displayFormat,
    settingDifferences: JSON.stringify(probabilityDraft.settingDifferences)
  };
  probabilityDiffFields.forEach(field => {
    const index = Number(field.dataset.settingIndex);
    const original = probabilityDraft.settingDifferences[index];
    const denominator = settingDifferenceDenominator(original);
    field.value = denominator ?? "";
    field.dataset.lastInput = field.value;
  });
  probabilityDiffInputs.hidden = true;
  probabilityDiffToggle.setAttribute("aria-expanded", "false");
  probabilityEditorTitle.textContent = item ? "計算項目を編集" : "計算項目を作成";
  probabilityEditorDeleteButton.hidden = !item;
  probabilityListView.hidden = true;
  probabilityEditor.hidden = false;
  syncProbabilityReorderHeader();
  probabilityCounterMenu.hidden = true;
  probabilityCounterButton.setAttribute("aria-expanded", "false");
  renderFormulaDraft();
  appContent.scrollTop = 0;
}

function closeProbabilityEditor() {
  probabilityNumberForm.reset();
  probabilityNumberError.hidden = true;
  probabilityNumberError.textContent = "";
  probabilityEditor.hidden = true;
  probabilityListView.hidden = false;
  syncProbabilityReorderHeader();
  probabilityCounterMenu.hidden = true;
  probabilityCounterButton.setAttribute("aria-expanded", "false");
  probabilityDiffInputs.hidden = true;
  probabilityDiffToggle.setAttribute("aria-expanded", "false");
  editingProbabilityId = null;
  probabilityDraft = null;
  probabilityInitialState = null;
  probabilityEditorDeleteButton.hidden = true;
  renderProbabilityList();
  appContent.scrollTop = 0;
}

function refreshProbabilityDisplay() {
  if (probabilityDraft && !probabilityEditor.hidden) renderFormulaDraft();
  else if (probabilityScreen && !probabilityScreen.hidden) renderProbabilityList();
}

probabilityAddButton.addEventListener("click", () => openProbabilityEditor());
probabilityBackButton.addEventListener("click", closeProbabilityEditor);
probabilityEditorDeleteButton.addEventListener("click", function() {
  const item = probabilityItems.find(entry => entry.id === editingProbabilityId);
  if (!item || !window.confirm(`「${item.name || "名前なし"}」を削除しますか？`)) return;
  probabilityItems = probabilityItems.filter(entry => entry.id !== item.id);
  expandedProbabilityDiffIds.delete(item.id);
  saveProbabilityItems();
  closeProbabilityEditor();
});
probabilityNameInput.addEventListener("input", renderFormulaDraft);
probabilityDiffToggle.addEventListener("click", () => {
  const open = probabilityDiffInputs.hidden;
  probabilityDiffInputs.hidden = !open;
  probabilityDiffToggle.setAttribute("aria-expanded", String(open));
});
probabilityDiffFields.forEach(field => {
  field.addEventListener("input", () => {
    if (!probabilityDraft) return;
    const index = Number(field.dataset.settingIndex);
    // 入力欄には数字と小数点のみ。保存形式は従来の「1/分母」を維持する。
    const value = normalizeSettingDifferenceNumber(field.value);
    if (value.length > 38 || !/^\d*(?:\.\d*)?$/.test(value)) {
      field.value = field.dataset.lastInput ?? "";
      return;
    }
    if (field.value !== value) field.value = value;
    field.dataset.lastInput = value;
    if (value === ".") return; // 小数入力の途中。保存値はまだ変更しない。
    if (value && !isSettingDifferenceNumber(value)) return;
    probabilityDraft.settingDifferences[index] = value ? `1/${value}` : "";
  });
  field.addEventListener("blur", () => {
    if (!probabilityDraft || field.value !== ".") return;
    const index = Number(field.dataset.settingIndex);
    field.value = settingDifferenceDenominator(probabilityDraft.settingDifferences[index]) ?? "";
    field.dataset.lastInput = field.value;
  });
});
// 数字は計算式の定数として保存する。総ゲーム数・小役の保存値には触れない。
probabilityNumberInput.addEventListener("input", () => {
  probabilityNumberError.hidden = true;
  probabilityNumberError.textContent = "";
});
probabilityNumberForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!probabilityDraft) return;
  const raw = probabilityNumberInput.value.trim().replace(/[０-９]/g, ch =>
    String(ch.charCodeAt(0) - 0xFF10)).replace(/．/g, ".").replace(/－/g, "-");
  const numeric = Number(raw);
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) || !Number.isFinite(numeric)) {
    probabilityNumberError.textContent = "数値を入力してください（例：100、0.5、-2）。";
    probabilityNumberError.hidden = false;
    return;
  }
  if (Math.abs(numeric) > 1000000000) {
    probabilityNumberError.textContent = "入力できる数値は-10億〜10億です。";
    probabilityNumberError.hidden = false;
    return;
  }
  if (probabilityDraft.tokens.length >= MAX_FORMULA_TOKENS) {
    probabilityNumberError.textContent = "計算式にこれ以上追加できません。";
    probabilityNumberError.hidden = false;
    return;
  }
  appendFormulaToken({ type: "number", value: numeric });
  probabilityNumberForm.reset();
  probabilityNumberInput.blur();
});
probabilityFormatButtons.forEach(button => {
  button.addEventListener("click", function() {
    if (!probabilityDraft) return;
    probabilityDraft.displayFormat = normalizedProbabilityFormat(button.dataset.probabilityFormat);
    renderFormulaDraft();
  });
});

document.querySelectorAll("[data-formula-op]").forEach(button => {
  button.addEventListener("click", function() {
    appendFormulaToken({ type: "op", value: button.dataset.formulaOp });
  });
});

probabilityCounterButton.addEventListener("click", function() {
  const shouldOpen = probabilityCounterMenu.hidden;
  probabilityCounterMenu.hidden = !shouldOpen;
  probabilityCounterButton.setAttribute("aria-expanded", String(shouldOpen));
  probabilityCounterMenu.replaceChildren();
  if (!shouldOpen) return;
  // 総ゲーム数と小役を、数式に挿入する参照項目として同じメニューにまとめる。
  const gamesChoice = document.createElement("button");
  gamesChoice.type = "button";
  gamesChoice.className = "probability-games-choice";
  gamesChoice.textContent = "総ゲーム数";
  gamesChoice.addEventListener("click", () => appendFormulaToken({ type: "games" }));
  probabilityCounterMenu.appendChild(gamesChoice);
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
      const label = document.createElement("span");
      label.className = "counter-select-label";
      label.textContent = counter.name.trim() || `カウンター ${index + 1}`;
      button.appendChild(label);
      button.title = label.textContent;
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
    tokens: probabilityDraft.tokens.map(token => ({ ...token })),
    displayFormat: normalizedProbabilityFormat(probabilityDraft.displayFormat),
    settingDifferences: normalizedSettingDifferences(probabilityDraft.settingDifferences)
  };
  const index = probabilityItems.findIndex(item => item.id === editingProbabilityId);
  if (index >= 0) probabilityItems[index] = record;
  else probabilityItems.push(record);
  saveProbabilityItems();
  closeProbabilityEditor();
});

