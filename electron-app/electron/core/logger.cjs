// 日志模块，提供文件日志和行走诊断日志

const fs = require("fs");
const path = require("path");

// 创建日志记录器
// logDir: 日志目录路径
// walkDiagnosticsEnabled: 是否启用行走诊断日志
function createLogger(logDir, { walkDiagnosticsEnabled = false } = {}) {
  const logFile = path.join(logDir, "main.log");

  function log(message) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    } catch {
      // Logging must never prevent the pet from starting in packaged installs.
    }
  }

  function logWalkDiagnostic(message) {
    if (walkDiagnosticsEnabled) {
      log(`walk-diagnostic ${message}`);
    }
  }

  return { log, logWalkDiagnostic };
}

module.exports = { createLogger };
