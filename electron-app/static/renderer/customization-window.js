// 形象定制面板渲染：变体切换、二维码显示、复制信息

async function renderCustomizationWindow() {
  app.className = "customization-stage";
  app.innerHTML = `
    <section class="customization-panel" aria-label="形象定制">
      <div class="customization-panel__body">
        <h2 class="customization-panel__heading">定制宠物形象</h2>
        <p class="customization-panel__desc">想把自家宠物做成桌宠陪伴自己，可通过以下方式联系我哦！</p>
        <div class="customization-panel__contact">
          <div class="customization-panel__contact-row">
            <span class="customization-panel__label">微信</span>
            <span class="customization-panel__value">keqiba666</span>
            <button class="customization-panel__copy-btn" data-copy-text="keqiba666" title="复制">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div class="customization-panel__contact-row">
            <span class="customization-panel__label">邮箱</span>
            <span class="customization-panel__value">458065825@qq.com</span>
            <button class="customization-panel__copy-btn" data-copy-text="458065825@qq.com" title="复制">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        <div class="customization-panel__qr" data-qr-container>
          <p class="customization-panel__qr-loading">加载中...</p>
        </div>
      </div>
    </section>
  `;

  // 绑定复制按钮事件
  for (const btn of app.querySelectorAll(".customization-panel__copy-btn")) {
    btn.addEventListener("click", async (e) => {
      const text = e.currentTarget.dataset.copyText;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        // fallback: 使用传统方式
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
  }

  const qrContainer = app.querySelector("[data-qr-container]");
  if (qrContainer) {
    window.desktopPet.getContactQrCode().then((result) => {
      if (!result || !result.success) {
        qrContainer.innerHTML = `<p class="customization-panel__qr-error">${result?.error || "二维码加载失败"}</p>`;
        return;
      }
      qrContainer.innerHTML = `<img class="customization-panel__qr-img" src="data:${result.mimeType};base64,${result.data}" alt="联系二维码" />`;
    }).catch(() => {
      qrContainer.innerHTML = `<p class="customization-panel__qr-error">二维码加载失败</p>`;
    });
  }
}
