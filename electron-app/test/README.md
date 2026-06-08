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
