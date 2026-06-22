// 渲染层入口，按 hash 分发到对应渲染模块。
// 公共变量（app、mode、WALK_DIAGNOSTICS_ENABLED）和工具函数（logWalkDiagnostic、logWalkStepDiagnostic）在 renderer/shared.js 中定义。
// 各渲染模式函数在 renderer/ 目录下对应模块文件中定义。
// index.html 按顺序加载 shared.js → 各渲染模块 → 本文件。

if (mode === "menu") {
  renderQuickMenuWindow();
} else if (mode === "hover") {
  renderHoverWindow();
} else if (mode === "bubble") {
  renderStartupBubbleWindow();
} else if (mode === "customization") {
  renderCustomizationWindow();
} else {
  renderPetWindow();
}
