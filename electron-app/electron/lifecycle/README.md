# Lifecycle

## 作用

集中注册 Electron 应用生命周期事件，把 app.whenReady、before-quit、window-all-closed、second-instance、activate、display-metrics-changed 等事件绑定到 main.cjs 注入的 handler 上。模块本身不包含业务逻辑。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `register-app-lifecycle.cjs` | 导出 `registerAppLifecycle(context)`，集中注册生命周期事件壳，handler 由 main.cjs 注入 |

## 使用方式

在 `main.cjs` 中引入并调用：

```js
const { registerAppLifecycle } = require("./lifecycle/register-app-lifecycle.cjs");

registerAppLifecycle({
  app, screen, process,
  gotSingleInstanceLock,
  handlers: {
    onSecondInstance: () => { /* ... */ },
    onReady: () => { /* 启动任务 */ },
    onBeforeQuit: () => { /* 退出清理 */ },
    onWindowAllClosed: () => { /* 平台判断 */ },
    onActivate: () => { /* 窗口恢复 */ },
    onDisplayMetricsChanged: (_e, _d, metrics) => { /* 显示器变化 */ }
  }
});
```

## 修改注意

- 不要在本目录模块中写入业务逻辑；handler 应为纯函数或由 main.cjs 注入。
- `requestSingleInstanceLock` 仍由 main.cjs 顶层执行，结果通过 context 注入。
- `activate` 和 `display-metrics-changed` 在 whenReady 回调内注册，不要移到顶层。
- 修改生命周期事件注册时，同步检查 `electron-app/test/register-app-lifecycle.test.cjs` 和 `electron-app/test/app-lifecycle-contract.test.cjs`。
