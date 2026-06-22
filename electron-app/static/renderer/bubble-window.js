// 启动气泡窗口渲染：气泡内容、显示动画

async function renderStartupBubbleWindow() {
  let config = await window.desktopPet.getPetConfig();
  app.className = "bubble-stage";
  const bubble = document.createElement("div");
  bubble.className = "pet-bubble is-visible";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  app.appendChild(bubble);

  function pickGreeting(state) {
    const greetings = Array.isArray(state?.greetings) ? state.greetings.filter(Boolean) : [];
    if (greetings.length === 0) {
      return "我在这里，随时待命。";
    }

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  function updateBubble() {
    const defaultState = config.states.find((state) => state.id === config.defaultState) || config.states[0];
    bubble.textContent = config.message || pickGreeting(defaultState);
    window.requestAnimationFrame(() => {
      const width = Math.ceil(bubble.scrollWidth + 2);
      const height = Math.ceil(bubble.getBoundingClientRect().height + 12);
      window.desktopPet.resizeBubble({ width, height });
    });
  }

  window.desktopPet.onBubbleData((nextConfig) => {
    config = nextConfig || config;
    updateBubble();
  });

  updateBubble();
}
