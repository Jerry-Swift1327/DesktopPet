// 渲染层公共工具和全局变量，供所有渲染模式共享。
// 从 renderer.js 提取，通过 <script> 标签在 index.html 中最先加载。
// 提供 app 元素引用、渲染模式判定、行走诊断日志。

const app = document.getElementById("app");
const mode = window.location.hash === "#menu"
  ? "menu"
  : window.location.hash === "#hover"
    ? "hover"
    : window.location.hash === "#bubble"
      ? "bubble"
      : window.location.hash === "#customization"
        ? "customization"
        : "pet";
const WALK_DIAGNOSTICS_ENABLED = false;

function logWalkDiagnostic(message) {
  if (WALK_DIAGNOSTICS_ENABLED) {
    console.debug(`[walk-diagnostic] ${message}`);
  }
}

function logWalkStepDiagnostic(startedAt, result, direction) {
  if (!WALK_DIAGNOSTICS_ENABLED) {
    return;
  }
  logWalkDiagnostic(`step state=${result?.state || ""} direction=${result?.direction ?? direction} paused=${Boolean(result?.paused)} completed=${Boolean(result?.completed)} elapsedMs=${Math.round(performance.now() - startedAt)}`);
}
