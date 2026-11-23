// 小役カウンター：起動処理・手動回転・iOS表示領域
// 読み込み順：theme.js → machine.js → script.js → count-history.js → counter-ui.js → settings-ui.js → probability.js → app-init.js
// 既存の保存キーとデータ形式は変更しない。

// ===================================
// 初期表示
// ===================================

// 重要：起動するだけではカウンター・モードを保存し直さない。
// 旧バージョンで読み込みに失敗したとき、初期値で上書きする事故を防止する。
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
initMachineControls();
// 機種追加・削除・切替・インポート後も機種設定画面を復元する。
if (sessionStorage.getItem("counterMachineSettingsRestoreV1") === "machine") {
  sessionStorage.removeItem("counterMachineSettingsRestoreV1");
  machineSettingsOpen = true;
}
// 機種切替で再起動しても開いていたタブへ戻す。
const restoredMachineTab = sessionStorage.getItem("counterMachineTabRestoreV1");
if (restoredMachineTab) {
  sessionStorage.removeItem("counterMachineTabRestoreV1");
  if (["counter", "memo", "probability", "settings"].includes(restoredMachineTab)) {
    selectTab(restoredMachineTab);
  }
}

// iPhone/iPad: キーボードを表示している間は、通常時のアプリ枠を保持する。
// visualViewport の縮小に下部タブまで追従させると、タブがキーボードの上に
// 持ち上がってしまうため、入力中は追従を止める。
// キーボードを閉じて元の表示領域に戻った時点で再開する。
const isIOSViewport = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (isIOSViewport && window.visualViewport) {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  let viewportFramePending = false;
  let stableAppFrame = null;
  let keyboardSession = false;

  function isEditableKeyboardTarget(element) {
    if (!element || !element.matches) return false;
    if (element.matches("textarea, [contenteditable]:not([contenteditable='false'])")) return true;
    return element.matches("input:not([type='checkbox']):not([type='radio']):not([type='color']):not([type='button']):not([type='submit']):not([type='reset']):not([type='hidden']):not([readonly])");
  }

  function readVisibleAppFrame() {
    const { height, width, offsetTop, offsetLeft } = viewport;
    if (![height, width, offsetTop, offsetLeft].every(Number.isFinite) ||
        height <= 0 || width <= 0) return null;
    return { height, width, top: offsetTop, left: offsetLeft };
  }

  function applyVisibleAppFrame(frame) {
    root.style.setProperty("--app-visual-height", `${frame.height}px`);
    root.style.setProperty("--app-visual-width", `${frame.width}px`);
    root.style.setProperty("--app-visual-top", `${frame.top}px`);
    root.style.setProperty("--app-visual-left", `${frame.left}px`);
    root.classList.add("ios-viewport-managed");
    stableAppFrame = frame;
  }

  function updateVisibleAppFrame() {
    const frame = readVisibleAppFrame();
    if (!frame) return;

    // フォーカス直後（まだキーボードが開ききっていない時点）から枠を固定する。
    if (isEditableKeyboardTarget(document.activeElement)) {
      keyboardSession = true;
      return;
    }

    if (keyboardSession && stableAppFrame) {
      const sameOrientation = Math.abs(frame.width - stableAppFrame.width) < 35;
      // フォーカスが外れてもキーボードの閉じるアニメーション中は固定を続ける。
      if (sameOrientation && frame.height < stableAppFrame.height - 80) return;
      keyboardSession = false;

      // iOSにはキーボードを閉じてもoffsetTopが戻らない場合がある。
      // 画面の高さ・幅が元に戻っていれば、不要な位置ずれを持ち越さない。
      if (sameOrientation && Math.abs(frame.height - stableAppFrame.height) < 80) {
        applyVisibleAppFrame({ ...frame, top: stableAppFrame.top, left: stableAppFrame.left });
        return;
      }
    }

    applyVisibleAppFrame(frame);
  }

  function scheduleVisibleAppFrame() {
    if (viewportFramePending) return;
    viewportFramePending = true;
    requestAnimationFrame(() => {
      viewportFramePending = false;
      updateVisibleAppFrame();
    });
  }

  viewport.addEventListener("resize", scheduleVisibleAppFrame);
  viewport.addEventListener("scroll", scheduleVisibleAppFrame);
  window.addEventListener("resize", scheduleVisibleAppFrame);
  window.addEventListener("pageshow", scheduleVisibleAppFrame);
  document.addEventListener("focusin", scheduleVisibleAppFrame, true);
  document.addEventListener("focusout", scheduleVisibleAppFrame, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleVisibleAppFrame();
  });
  updateVisibleAppFrame();
}
