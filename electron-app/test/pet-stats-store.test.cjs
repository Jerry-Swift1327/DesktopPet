const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPetStatsStore } = require("../electron/pet/pet-stats-store.cjs");

// 构造内存 fs mock，files 为路径到内容的映射；调用方保留 files 引用即可检查写入内容
function createMockFs(files = {}) {
  return {
    existsSync: (p) => Boolean(files[p]),
    readFileSync: (p) => {
      if (!files[p]) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    writeFileSync: (p, content) => { files[p] = content; }
  };
}

// 构造 mock log，收集调用消息
function createMockLog() {
  const calls = [];
  const fn = (msg) => { calls.push(msg); };
  fn.calls = calls;
  return fn;
}

const STATS_FILE = "/stats.json";
const LEGACY_FILE = "/legacy.json";

function createStore({ fs, statsFile = STATS_FILE, legacyStatsFile = LEGACY_FILE, log } = {}) {
  return createPetStatsStore({
    fs: fs || createMockFs(),
    statsFile,
    legacyStatsFile,
    log: log || createMockLog()
  });
}

// encodeStatsPayload / decodeStatsPayload：base64 编解码往返
test("encodeStatsPayload 返回合法 base64 字符串", () => {
  const store = createStore();
  const encoded = store.encodeStatsPayload({ a: 1, b: "x" });

  assert.equal(typeof encoded, "string");
  assert.ok(encoded.length > 0);
  // 合法 base64 字符集 + 至多两个 = 填充
  assert.ok(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded));
});

test("decodeStatsPayload 对 encode 结果往返 deepEqual", () => {
  const store = createStore();
  const data = { intimacy: 50, fullness: 60, lastStatsActiveAt: 1000 };

  assert.deepEqual(store.decodeStatsPayload(store.encodeStatsPayload(data)), data);
});

test("decodeStatsPayload 对 null 返回 null", () => {
  const store = createStore();

  assert.equal(store.decodeStatsPayload(null), null);
});

test("decodeStatsPayload 对非字符串（数字）返回 null", () => {
  const store = createStore();

  assert.equal(store.decodeStatsPayload(123), null);
});

test("decodeStatsPayload 对非 base64-json 字符串返回 null 不抛出", () => {
  const store = createStore();

  assert.equal(store.decodeStatsPayload("!!!not-base64-json!!!"), null);
});

test("decodeStatsPayload 对空字符串返回 null", () => {
  const store = createStore();

  assert.equal(store.decodeStatsPayload(""), null);
});

// readPetStatsFile：主文件存在
test("readPetStatsFile 主文件存在时返回解码后的 stats", () => {
  const probe = createStore();
  const encoded = probe.encodeStatsPayload({ intimacy: 50, fullness: 60, lastStatsActiveAt: 1000 });
  const mockFs = createMockFs({ [STATS_FILE]: encoded });
  const store = createStore({ fs: mockFs });

  const result = store.readPetStatsFile();

  assert.deepEqual(result.stats, { intimacy: 50, fullness: 60, lastStatsActiveAt: 1000 });
  assert.equal(result.hasStatsActiveAt, true);
  assert.equal(result.sourceFile, STATS_FILE);
});

// readPetStatsFile：legacy fallback
test("readPetStatsFile 主文件不存在时回退到 legacyStatsFile", () => {
  const probe = createStore();
  const encoded = probe.encodeStatsPayload({ intimacy: 40, lastStatsActiveAt: 500 });
  const mockFs = createMockFs({ [LEGACY_FILE]: encoded });
  const store = createStore({ fs: mockFs });

  const result = store.readPetStatsFile();

  assert.deepEqual(result.stats, { intimacy: 40, lastStatsActiveAt: 500 });
  assert.equal(result.hasStatsActiveAt, true);
  assert.equal(result.sourceFile, LEGACY_FILE);
});

// readPetStatsFile：都不存在
test("readPetStatsFile 主文件与 legacy 都不存在时返回 null 结果", () => {
  const mockFs = createMockFs({});
  const store = createStore({ fs: mockFs, legacyStatsFile: "" });

  const result = store.readPetStatsFile();

  assert.equal(result.stats, null);
  assert.equal(result.hasStatsActiveAt, false);
  assert.equal(result.sourceFile, null);
});

// readPetStatsFile：无 lastStatsActiveAt
test("readPetStatsFile 主文件无 lastStatsActiveAt 时 hasStatsActiveAt 为 false", () => {
  const probe = createStore();
  const encoded = probe.encodeStatsPayload({ intimacy: 50 });
  const mockFs = createMockFs({ [STATS_FILE]: encoded });
  const store = createStore({ fs: mockFs });

  const result = store.readPetStatsFile();

  assert.deepEqual(result.stats, { intimacy: 50 });
  assert.equal(result.hasStatsActiveAt, false);
  assert.equal(result.sourceFile, STATS_FILE);
});

// readPetStatsFile：非 base64 但合法 JSON
test("readPetStatsFile 主文件为纯 JSON（非 base64）时 fallback 到 JSON.parse", () => {
  const mockFs = createMockFs({ [STATS_FILE]: '{"intimacy":50,"lastStatsActiveAt":1000}' });
  const store = createStore({ fs: mockFs });

  const result = store.readPetStatsFile();

  assert.deepEqual(result.stats, { intimacy: 50, lastStatsActiveAt: 1000 });
  assert.equal(result.hasStatsActiveAt, true);
  assert.equal(result.sourceFile, STATS_FILE);
});

// readPetStatsFile：读取异常不抛出
test("readPetStatsFile 读取抛出异常时记录日志并返回 null 结果", () => {
  const mockLog = createMockLog();
  const mockFs = {
    existsSync: (p) => p === STATS_FILE,
    readFileSync: () => { throw new Error("read error"); },
    writeFileSync: () => {}
  };
  const store = createStore({ fs: mockFs, log: mockLog });

  const result = store.readPetStatsFile();

  assert.equal(result.stats, null);
  assert.equal(result.hasStatsActiveAt, false);
  assert.equal(result.sourceFile, null);
  assert.ok(mockLog.calls.length > 0, "应调用 log 记录错误");
  assert.ok(
    mockLog.calls.some((msg) => String(msg).includes("failed to read pet stats")),
    "log 消息应包含 'failed to read pet stats'"
  );
});

// readPetStatsFile：解析异常不抛出
test("readPetStatsFile 内容既非 base64-json 也非合法 JSON 时返回 null 结果", () => {
  const mockLog = createMockLog();
  const mockFs = createMockFs({ [STATS_FILE]: "!!!garbage!!!" });
  const store = createStore({ fs: mockFs, log: mockLog });

  const result = store.readPetStatsFile();

  assert.equal(result.stats, null);
  assert.equal(result.hasStatsActiveAt, false);
  assert.equal(result.sourceFile, null);
  assert.ok(mockLog.calls.length > 0, "应调用 log 记录解析错误");
});

// writePetStatsFile：写入 base64 编码
test("writePetStatsFile 写入内容为 base64 编码且可解码还原", () => {
  const files = {};
  const mockFs = createMockFs(files);
  const store = createStore({ fs: mockFs });
  const stats = { intimacy: 50, lastStatsActiveAt: 1000 };

  store.writePetStatsFile(stats);

  const written = files[STATS_FILE];
  assert.equal(typeof written, "string");
  assert.ok(written.length > 0);
  // 写入内容与 encodeStatsPayload 结果一致
  assert.equal(written, store.encodeStatsPayload({ intimacy: 50, lastStatsActiveAt: 1000 }));
  // 写入内容是 base64，且解码后与原对象 deepEqual
  assert.deepEqual(store.decodeStatsPayload(written), { intimacy: 50, lastStatsActiveAt: 1000 });
});

// writePetStatsFile：不修改入参的 lastStatsActiveAt
test("writePetStatsFile 不修改传入 stats 的 lastStatsActiveAt", () => {
  const files = {};
  const mockFs = createMockFs(files);
  const store = createStore({ fs: mockFs });
  const stats = { intimacy: 50, lastStatsActiveAt: 999 };

  store.writePetStatsFile(stats);

  // store 内部不修改入参对象
  assert.equal(stats.lastStatsActiveAt, 999);
  // 写入文件内容解码后 lastStatsActiveAt 也是 999
  const decoded = store.decodeStatsPayload(files[STATS_FILE]);
  assert.equal(decoded.lastStatsActiveAt, 999);
  assert.deepEqual(decoded, { intimacy: 50, lastStatsActiveAt: 999 });
});
