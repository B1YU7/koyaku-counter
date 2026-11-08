
// =====================================
// HTML要素
// =====================================

const lightThemeButton =
  document.getElementById("light-theme");

const darkThemeButton =
  document.getElementById("dark-theme");


// =====================================
// テーマ読み込み
// =====================================

function loadTheme() {
  const savedTheme =
    localStorage.getItem("counterTheme");

  return savedTheme === "dark"
    ? "dark"
    : "light";
}


// =====================================
// テーマ適用
// =====================================

function applyTheme(theme) {
  const selectedTheme =
    theme === "dark" ? "dark" : "light";

  // ページ全体に適用
  document.documentElement.dataset.theme =
    selectedTheme;

  // 保存
  localStorage.setItem(
    "counterTheme",
    selectedTheme
  );

  // ボタンの状態を更新
  lightThemeButton.classList.toggle(
    "active",
    selectedTheme === "light"
  );

  darkThemeButton.classList.toggle(
    "active",
    selectedTheme === "dark"
  );

  lightThemeButton.setAttribute(
    "aria-pressed",
    String(selectedTheme === "light")
  );

  darkThemeButton.setAttribute(
    "aria-pressed",
    String(selectedTheme === "dark")
  );
}


// =====================================
// ボタン操作
// =====================================

// ライトモード
lightThemeButton.addEventListener("click", function() {
  applyTheme("light");
});

// ダークモード
darkThemeButton.addEventListener("click", function() {
  applyTheme("dark");
});


// =====================================
// 初期設定
// =====================================

// 前回選択したテーマを復元
applyTheme(loadTheme());
