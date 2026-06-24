# Tests

本目录包含 Electron 应用的 Node 内置测试。

## 运行

```powershell
cd electron-app
npm.cmd test
```

`package.json` 中当前测试命令：

```powershell
node --test "test/**/*.test.cjs"
```

## 当前测试

| 文件 | 覆盖内容 | 相关源码 |
| --- | --- | --- |
| `pet-variants.test.cjs` | 默认变体、渠道配置、动作 ID、资源目录命名 | `../electron/pet-variants.cjs` |
| `walk-clock.test.cjs` | 行走循环暂停、恢复、剩余时间计算 | `../electron/walk-clock.cjs` |
| `walk-controller-accessor.test.cjs` | walk-controller 访问器与 main.cjs 接线结构断言 | `../electron/behavior/walk-controller.cjs`、`../electron/main.cjs` |
| `dock-controller-accessor.test.cjs` | dock-controller 访问器、windowRoam 双状态源清除与 main.cjs 薄包装接线结构断言 | `../electron/behavior/dock-controller.cjs`、`../electron/main.cjs` |
| `ipc-contract.test.cjs` | IPC 契约一致性结构断言（preload invoke/send/onXxx、register-ipc-handlers.cjs 注册模块、renderer 调用、高风险 channel 名称、main→renderer 事件推送） | `../electron/preload.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../static/renderer/**` |
| `contact-qrcode.test.cjs` | 联系二维码查找辅助模块结构断言（开发/打包路径构造、Downloads fallback、文件存在/不存在、读取异常跳过、返回结构） | `../electron/ipc/contact-qrcode.cjs` |
| `app-lifecycle-contract.test.cjs` | 应用生命周期契约结构断言（单实例锁、whenReady 启动序列、before-quit 退出清理、window-all-closed、activate、display-metrics-changed、switch-variant 重启、启动/退出顺序） | `../electron/main.cjs` |
| `bounds.test.cjs` | 纯几何工具函数 | `../electron/shared/bounds.cjs` |
| `messaging.test.cjs` | webContents.send 安全发送和广播 | `../electron/shared/messaging.cjs` |
| `pet-states.test.cjs` | 宠物状态工厂和状态数组构建 | `../electron/pet/pet-states.cjs` |
| `ragdoll-assets.test.cjs` | ragdoll 动作资源、manifest 和 yawn 尾段循环元数据 | `../../assets/animations` |

## 何时补测试

- 修改 `pet-variants.cjs` 的变体、动作、渠道或默认配置。
- 修改 `walk-clock.cjs` 的计时逻辑。
- 从 `main.cjs` 中抽出纯逻辑模块后。
- 新增不依赖真实 Electron 窗口的核心规则。

## 测试风格

- 使用 Node 内置 `node:test` 和 `node:assert/strict`。
- 优先测试纯函数和配置输出。
- 避免在单元测试中启动真实 Electron 窗口。
- 文件命名保持 `*.test.cjs`。
