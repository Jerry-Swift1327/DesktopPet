# IPC Registration

本目录集中注册 Electron 主进程的 IPC handler，是主进程与渲染层之间的通信边界。

## 作用

收口所有 `ipcMain.handle` / `ipcMain.on` 注册，不包含业务逻辑。handler 函数由 `main.cjs` 通过 context 注入，模块只负责将 channel 与 handler 绑定。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `register-ipc-handlers.cjs` | 导出 `registerIpcHandlers(context)`，注册全部 34 个 IPC channel（8 个 handle + 26 个 on） |

## 使用方式

`main.cjs` 在启动阶段构造 context 并调用：

```js
const { registerIpcHandlers } = require("./ipc/register-ipc-handlers.cjs");
registerIpcHandlers({
  ipcMain,
  handlers: { /* handler 函数 */ }
});
```

## 修改注意

- 新增 IPC channel 时，同步修改 `register-ipc-handlers.cjs`、`../preload.cjs`、`../../static/renderer/` 下对应模块。
- 不要在本目录模块中写入业务逻辑，handler 应由 `main.cjs` 注入。
- 修改后运行 `cd electron-app; npm.cmd test` 确认 `ipc-contract.test.cjs` 通过。
