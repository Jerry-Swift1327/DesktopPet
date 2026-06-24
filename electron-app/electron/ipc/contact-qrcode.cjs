// 联系二维码查找辅助模块：构造候选路径、查找文件、返回 base64 数据。
// 通过 context 注入 fs/path/os/app/process/__dirname，避免散落 require 和全局依赖。
function createContactQrCodeResolver(context) {
  const { fs, path, os, app, process, __dirname } = context;

  function resolveContactQrCode() {
    const candidates = [];
    if (app.isPackaged) {
      candidates.push(
        path.join(process.resourcesPath, "app", ".runtime-assets", "contact_qr_code.jpg"),
        path.join(process.resourcesPath, "app.asar", ".runtime-assets", "contact_qr_code.jpg"),
        path.join(process.resourcesPath, "contact_qr_code.jpg")
      );
    } else {
      candidates.push(
        path.join(__dirname, "..", ".runtime-assets", "contact_qr_code.jpg"),
        path.join(__dirname, "..", "..", "contact_qr_code.jpg")
      );
    }
    candidates.push(path.join(os.homedir(), "Downloads", "contact_qr_code.jpg"));
    for (const qrPath of candidates) {
      try {
        if (fs.existsSync(qrPath)) {
          const data = fs.readFileSync(qrPath);
          return { success: true, data: data.toString("base64"), mimeType: "image/jpeg" };
        }
      } catch (_) {
        continue;
      }
    }
    return { success: false, error: "QR code file not found" };
  }

  return { resolveContactQrCode };
}

module.exports = { createContactQrCodeResolver };
