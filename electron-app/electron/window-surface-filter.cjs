const WINDOW_DOCK_EXCLUDED_CLASSES = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "Windows.UI.Core.CoreWindow",
  "XamlExplorerHostIslandWindow",
  "Shell_InputSwitchTopLevelWindow",
  "ApplicationFrameWindow"
]);

const WINDOW_DOCK_EXCLUDED_TITLES = new Set([
  "program manager",
  "desktopwindowxamlsource"
]);

const EXPLORER_TRAY_OVERFLOW_CLASSES = new Set([
  "NotifyIconOverflowWindow",
  "TopLevelWindowForOverflowXamlIsland"
]);

const EXPLORER_TRAY_OVERFLOW_TITLES = new Set([
  "notification overflow",
  "system tray overflow window",
  "system tray overflow window."
]);

function normalizeProcessName(processName) {
  return String(processName || "").trim().toLowerCase().replace(/\.exe$/, "");
}

function isExplorerTrayOverflowWindow(processName, className, title) {
  return normalizeProcessName(processName) === "explorer"
    && (EXPLORER_TRAY_OVERFLOW_CLASSES.has(className)
      || EXPLORER_TRAY_OVERFLOW_TITLES.has(title));
}

function isLikelyDesktopOrSystemWindow(item, rect, area) {
  const className = String(item.className || "").trim();
  const processName = normalizeProcessName(item.processName);
  const title = String(item.title || "").trim().toLowerCase();
  const coversDisplay = rect.left <= area.x + 2
    && rect.top <= area.y + 2
    && rect.right >= area.x + area.width - 2
    && rect.bottom >= area.y + area.height - 2;
  if (WINDOW_DOCK_EXCLUDED_CLASSES.has(className)) {
    return true;
  }
  if (WINDOW_DOCK_EXCLUDED_TITLES.has(title)) {
    return true;
  }
  if (isExplorerTrayOverflowWindow(processName, className, title)) {
    return true;
  }
  if (processName === "dwm") {
    return true;
  }
  return coversDisplay && rect.top <= area.y + 2;
}

module.exports = {
  isLikelyDesktopOrSystemWindow
};
