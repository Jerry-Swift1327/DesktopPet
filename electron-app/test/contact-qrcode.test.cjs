const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { createContactQrCodeResolver } = require("../electron/ipc/contact-qrcode.cjs");

// 构造 mock context：注入 fs/path/os/app/process/__dirname，避免依赖真实文件系统与 Electron。
// existsSyncCalls / readFileSyncCalls 记录调用参数，便于断言候选路径构造。
// path 使用真实 path 模块（含 join 的规范化行为），因此期望路径同样用 path.join 计算。
function createMockContext(overrides = {}) {
  const existsSyncCalls = [];
  const readFileSyncCalls = [];
  const mockFs = {
    existsSync: (p) => {
      existsSyncCalls.push(p);
      return overrides.existsSync?.(p) ?? false;
    },
    readFileSync: (p) => {
      readFileSyncCalls.push(p);
      return overrides.readFileSync?.(p) ?? Buffer.from("");
    }
  };
  const mockOs = { homedir: () => overrides.homedir ?? "/mock/home" };
  const mockApp = { isPackaged: overrides.isPackaged ?? false };
  const mockProcess = { resourcesPath: overrides.resourcesPath ?? "/mock/resources" };
  const context = {
    fs: mockFs,
    path,
    os: mockOs,
    app: mockApp,
    process: mockProcess,
    __dirname: overrides.__dirname ?? "/mock/electron"
  };
  return { context, existsSyncCalls, readFileSyncCalls };
}

// 测试 1：开发模式构造候选路径
test("开发模式构造候选路径并查找文件", () => {
  const { context, existsSyncCalls } = createMockContext({
    isPackaged: false,
    __dirname: "/mock/electron",
    homedir: "/mock/home"
  });
  const { resolveContactQrCode } = createContactQrCodeResolver(context);

  const result = resolveContactQrCode();

  assert.deepEqual(result, { success: false, error: "QR code file not found" });

  // path.join 会规范化 ".."，因此用同样的 path.join 计算期望路径
  const expectedPaths = [
    path.join("/mock/electron", "..", ".runtime-assets", "contact_qr_code.jpg"),
    path.join("/mock/electron", "..", "..", "contact_qr_code.jpg"),
    path.join("/mock/home", "Downloads", "contact_qr_code.jpg")
  ];
  for (const expected of expectedPaths) {
    assert.ok(
      existsSyncCalls.includes(expected),
      `expected existsSync to be called with ${expected}; actual calls: ${JSON.stringify(existsSyncCalls)}`
    );
  }
});

// 测试 2：打包模式构造候选路径
test("打包模式构造候选路径并查找文件", () => {
  const { context, existsSyncCalls } = createMockContext({
    isPackaged: true,
    resourcesPath: "/mock/resources",
    homedir: "/mock/home"
  });
  const { resolveContactQrCode } = createContactQrCodeResolver(context);

  const result = resolveContactQrCode();

  assert.deepEqual(result, { success: false, error: "QR code file not found" });

  const expectedPaths = [
    path.join("/mock/resources", "app", ".runtime-assets", "contact_qr_code.jpg"),
    path.join("/mock/resources", "app.asar", ".runtime-assets", "contact_qr_code.jpg"),
    path.join("/mock/resources", "contact_qr_code.jpg"),
    path.join("/mock/home", "Downloads", "contact_qr_code.jpg")
  ];
  for (const expected of expectedPaths) {
    assert.ok(
      existsSyncCalls.includes(expected),
      `expected existsSync to be called with ${expected}; actual calls: ${JSON.stringify(existsSyncCalls)}`
    );
  }
});

// 测试 3：文件存在时返回 base64
test("文件存在时返回 base64 数据", () => {
  const { context } = createMockContext({
    isPackaged: false,
    __dirname: "/mock/electron",
    homedir: "/mock/home",
    existsSync: () => true,
    readFileSync: () => Buffer.from("fake-image-data")
  });
  const { resolveContactQrCode } = createContactQrCodeResolver(context);

  const result = resolveContactQrCode();

  assert.deepEqual(result, {
    success: true,
    data: Buffer.from("fake-image-data").toString("base64"),
    mimeType: "image/jpeg"
  });
  assert.equal(result.data, "ZmFrZS1pbWFnZS1kYXRh");
});

// 测试 4：文件不存在时返回错误
test("文件不存在时返回错误", () => {
  const { context } = createMockContext({
    isPackaged: false,
    existsSync: () => false
  });
  const { resolveContactQrCode } = createContactQrCodeResolver(context);

  const result = resolveContactQrCode();

  assert.deepEqual(result, { success: false, error: "QR code file not found" });
});

// 测试 5：读取异常时跳过当前路径并尝试下一个
test("读取异常时跳过当前路径并尝试下一个", () => {
  const p1 = path.join("/mock/electron", "..", ".runtime-assets", "contact_qr_code.jpg");
  const p2 = path.join("/mock/electron", "..", "..", "contact_qr_code.jpg");
  const p3 = path.join("/mock/home", "Downloads", "contact_qr_code.jpg");

  const { context } = createMockContext({
    isPackaged: false,
    __dirname: "/mock/electron",
    homedir: "/mock/home",
    existsSync: (p) => {
      if (p === p1) return true;
      if (p === p2) throw new Error("exists boom");
      if (p === p3) return true;
      return false;
    },
    readFileSync: (p) => {
      if (p === p1) throw new Error("read boom");
      if (p === p3) return Buffer.from("recovered");
      return Buffer.from("");
    }
  });
  const { resolveContactQrCode } = createContactQrCodeResolver(context);

  const result = resolveContactQrCode();

  assert.deepEqual(result, {
    success: true,
    data: Buffer.from("recovered").toString("base64"),
    mimeType: "image/jpeg"
  });
  assert.equal(result.data, "cmVjb3ZlcmVk");
});

// 测试 6：返回结构正确
test("返回结构正确：成功含 data/mimeType，失败含 error", () => {
  // 成功场景
  const successCtx = createMockContext({
    isPackaged: false,
    existsSync: () => true,
    readFileSync: () => Buffer.from("ok")
  });
  const successResult = createContactQrCodeResolver(successCtx.context).resolveContactQrCode();
  assert.equal(typeof successResult.success, "boolean");
  assert.equal(successResult.success, true);
  assert.equal(typeof successResult.data, "string");
  assert.equal(successResult.mimeType, "image/jpeg");

  // 失败场景
  const failureCtx = createMockContext({
    isPackaged: false,
    existsSync: () => false
  });
  const failureResult = createContactQrCodeResolver(failureCtx.context).resolveContactQrCode();
  assert.equal(typeof failureResult.success, "boolean");
  assert.equal(failureResult.success, false);
  assert.equal(typeof failureResult.error, "string");
});
