// pet-stats-store.cjs：pet stats 读写边界模块。只处理 stats 文件的编码/解码、读写与 legacy fallback；
// 不依赖 electron、不感知 petWindow/IPC/bubble、不做 normalize 与每日衰减、不直接修改 main.cjs 的 petStats。

function createPetStatsStore({ fs, statsFile, legacyStatsFile, log }) {
  const logError = typeof log === "function" ? log : () => {};

  function encodeStatsPayload(data) {
    return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
  }

  function decodeStatsPayload(raw) {
    if (!raw || typeof raw !== "string") { return null; }
    try {
      const json = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function readPetStatsFile() {
    try {
      const savedStatsFile = fs.existsSync(statsFile) ? statsFile : legacyStatsFile;
      if (!savedStatsFile || !fs.existsSync(savedStatsFile)) {
        return { stats: null, hasStatsActiveAt: false, sourceFile: null };
      }
      const raw = fs.readFileSync(savedStatsFile, "utf8").trim();
      const decoded = decodeStatsPayload(raw);
      const savedStats = decoded || JSON.parse(raw);
      const hasStatsActiveAt = Number.isFinite(savedStats.lastStatsActiveAt);
      return { stats: savedStats, hasStatsActiveAt, sourceFile: savedStatsFile };
    } catch (error) {
      logError(`failed to read pet stats: ${error.stack || error.message}`);
      return { stats: null, hasStatsActiveAt: false, sourceFile: null };
    }
  }

  function writePetStatsFile(stats) {
    fs.writeFileSync(statsFile, encodeStatsPayload(stats), "utf8");
  }

  return {
    encodeStatsPayload,
    decodeStatsPayload,
    readPetStatsFile,
    writePetStatsFile
  };
}

module.exports = { createPetStatsStore };
