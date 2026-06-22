// 快捷菜单窗口渲染：菜单项、按钮交互、状态显示
async function renderQuickMenuWindow() {
  let config = await window.desktopPet.getPetConfig();
  const showWindowRoam = Boolean(config.features?.windowRoam);
  const showAutoStart = Boolean(config.features?.autoStart);
  const showEyeTracking = Boolean(config.features?.eyeTracking);
  const showCustomization = Boolean(config.features?.customization);
  const showSwitchPet = Boolean(config.features?.switchPet);
  const currentVariant = config.variant || "dog";
  const switchableVariants = Array.isArray(config.switchableVariants) ? config.switchableVariants : [];
  const VARIANT_LABELS = { dog: "狗狗", cat: "猫咪" };
  const windowRoamButton = showWindowRoam ? `
      <button type="button" class="quick-menu__item" data-command="window-roam" data-window-roam>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4.5 7.5h15"></path><path d="M6.5 7.5v9a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-9"></path><path d="M9 14h6"></path><path d="m12 11 3 3-3 3"></path></svg>
        </span>
        <span>窗口跟随</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";
  const autoStartButton = showAutoStart ? `
      <button type="button" class="quick-menu__item" data-command="auto-start" data-auto-start>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="m8 9 4 4 4-4"></path><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5"></path></svg>
        </span>
        <span>自动开机</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";
  const eyeTrackingButton = showEyeTracking ? `
      <button type="button" class="quick-menu__item" data-command="eye-tracking" data-eye-tracking>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>
        </span>
        <span>眼神追踪</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";

  app.className = "menu-stage";
  app.innerHTML = `
    <section class="quick-menu" aria-label="桌宠功能菜单" data-quick-menu>
      <button type="button" class="quick-menu__item" data-command="reset">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 10.8 12 3.8l9 7"></path><path d="M5.8 9.9V20h12.4V9.9"></path><path d="M10 20v-5.2h4V20"></path></svg>
        </span>
        <span>回到起始点</span>
      </button>
${windowRoamButton}
      <button type="button" class="quick-menu__item" data-command="top">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M14.7 4.2 19.8 9.3"></path><path d="M7.2 13.5 4.8 16l3.2 3.2 2.5-2.4"></path><path d="M8.2 12.5 15 5.8l3.2 3.2-6.7 6.8"></path><path d="M12.5 15.8 9 12.3"></path></svg>
        </span>
        <span>重置大小</span>
      </button>
${showSwitchPet ? `      <button type="button" class="quick-menu__item" data-command="switch-pet" data-switch-pet>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="M15 15l6 6"></path><path d="M4 4l5 5"></path></svg>
        </span>
        <span>切换宠物</span>
        <span class="quick-menu__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
        </span>
      </button>
      <div class="quick-menu__pet-list" data-pet-list>
${switchableVariants.map((v) => `        <button type="button" class="quick-menu__action${v === currentVariant ? " is-active" : ""}" data-variant="${v}">${VARIANT_LABELS[v] || v}</button>`).join("\n")}
      </div>` : ""}
${autoStartButton}
${eyeTrackingButton}
      <button type="button" class="quick-menu__item quick-menu__item--danger" data-command="quit">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3.8v8"></path><path d="M7.2 6.8a8 8 0 1 0 9.6 0"></path></svg>
        </span>
        <span>退出程序</span>
      </button>
${showCustomization ? `      <button type="button" class="quick-menu__item" data-command="customization">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"></path><path d="M9 12h6"></path><path d="M12 9v6"></path></svg>
        </span>
        <span>形象定制</span>
      </button>` : ""}
    </section>
  `;

  const menuElement = app.querySelector("[data-quick-menu]");

  app.addEventListener("mouseenter", () => {
    window.desktopPet.menuPanelEnter();
  });

  app.addEventListener("mouseleave", () => {
    window.desktopPet.menuPanelLeave();
  });

  function reportMenuHeight() {
    window.requestAnimationFrame(() => {
      const height = Math.ceil(menuElement.offsetHeight);
      window.desktopPet.resizeMenu(height);
    });
  }

  function updateAutoStartState() {
    const autoStart = config.autoStart || {};
    const button = app.querySelector("[data-auto-start]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(autoStart.enabled));
    button.disabled = !autoStart.canToggle;
    button.title = autoStart.error || "";
  }

  function updateWindowRoamState() {
    const windowRoam = config.windowRoam || {};
    const button = app.querySelector("[data-window-roam]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(windowRoam.enabled));
    button.disabled = !windowRoam.canToggle;
    button.title = windowRoam.error || "";
  }

  function updateEyeTrackingState() {
    const eyeTracking = config.eyeTracking || {};
    const button = app.querySelector("[data-eye-tracking]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(eyeTracking.enabled));
    button.disabled = !eyeTracking.canToggle;
    button.title = eyeTracking.error || "";
  }

  app.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  app.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }

    if (target.dataset.command === "reset") {
      window.desktopPet.resetPosition();
      window.desktopPet.hideMenu();
      return;
    }

    if (target.dataset.command === "reset-scale" || target.dataset.command === "top") {
      window.desktopPet.resetScale();
      window.desktopPet.hideMenu();
      return;
    }

    if (target.dataset.command === "switch-pet") {
      const petList = app.querySelector("[data-pet-list]");
      const chevron = target.querySelector(".quick-menu__chevron");
      if (petList) {
        const isOpen = petList.classList.toggle("is-visible");
        if (chevron) {
          chevron.classList.toggle("is-open", isOpen);
        }
        reportMenuHeight();
      }
      return;
    }

    if (target.dataset.variant) {
      const selectedVariant = target.dataset.variant;
      if (selectedVariant === currentVariant) {
        window.desktopPet.hideMenu();
        return;
      }
      const petList = app.querySelector("[data-pet-list]");
      if (petList) {
        for (const btn of petList.querySelectorAll(".quick-menu__action")) {
          btn.classList.toggle("is-active", btn.dataset.variant === selectedVariant);
        }
      }
      window.setTimeout(() => {
        window.desktopPet.hideMenu();
        window.desktopPet.switchVariant(selectedVariant);
      }, 1000);
      return;
    }

    if (target.dataset.command === "auto-start") {
      const previousAutoStart = config.autoStart || {};
      const nextEnabled = !Boolean(previousAutoStart.enabled);
      config = {
        ...config,
        autoStart: {
          ...previousAutoStart,
          error: "",
          enabled: nextEnabled
        }
      };
      updateAutoStartState();
      window.setTimeout(() => window.desktopPet.hideMenu(), 1000);
      window.desktopPet.setAutoStart(nextEnabled).then((autoStart) => {
        config = {
          ...config,
          autoStart
        };
        updateAutoStartState();
      }).catch(() => {
        config = {
          ...config,
          autoStart: previousAutoStart
        };
        updateAutoStartState();
      });
      return;
    }

    if (target.dataset.command === "window-roam") {
      const previousWindowRoam = config.windowRoam || {};
      const nextEnabled = !Boolean(previousWindowRoam.enabled);
      config = {
        ...config,
        windowRoam: {
          ...previousWindowRoam,
          error: "",
          enabled: nextEnabled
        }
      };
      updateWindowRoamState();
      window.setTimeout(() => {
        window.desktopPet.hideMenu();
        window.desktopPet.setWindowRoam(nextEnabled).then((windowRoam) => {
          config = {
            ...config,
            windowRoam
          };
          updateWindowRoamState();
        }).catch(() => {
          config = {
            ...config,
            windowRoam: previousWindowRoam
          };
          updateWindowRoamState();
        });
      }, 1000);
      return;
    }

    if (target.dataset.command === "eye-tracking") {
      const previousEyeTracking = config.eyeTracking || {};
      const nextEnabled = !Boolean(previousEyeTracking.enabled);
      config = {
        ...config,
        eyeTracking: {
          ...previousEyeTracking,
          error: "",
          enabled: nextEnabled
        }
      };
      updateEyeTrackingState();
      window.setTimeout(() => {
        window.desktopPet.hideMenu();
        window.desktopPet.setEyeTracking(nextEnabled).then((eyeTracking) => {
          config = {
            ...config,
            eyeTracking
          };
          updateEyeTrackingState();
        }).catch(() => {
          config = {
            ...config,
            eyeTracking: previousEyeTracking
          };
          updateEyeTrackingState();
        });
      }, 1000);
      return;
    }

    if (target.dataset.command === "quit") {
      window.desktopPet.quit();
    }

    if (target.dataset.command === "customization") {
      window.desktopPet.hideMenu();
      window.desktopPet.showCustomization();
      return;
    }
  });

  window.desktopPet.onMenuData((nextConfig) => {
    config = nextConfig || config;
    updateAutoStartState();
    updateWindowRoamState();
    updateEyeTrackingState();
    reportMenuHeight();
  });

  updateAutoStartState();
  updateWindowRoamState();
  updateEyeTrackingState();
  reportMenuHeight();
}
