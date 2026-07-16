const tg = window.Telegram.WebApp;

const STORAGE_KEY = "hy3_settings_v1";

const state = {
  mode: "medium",
  temperature: 0.7,
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.mode) state.mode = saved.mode;
    if (saved.temperature) state.temperature = saved.temperature;
  } catch (_) {
    /* ignore broken storage */
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const temp = params.get("temp");
  if (mode) state.mode = mode;
  if (temp) state.temperature = Number(temp);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sendToBot(payload) {
  tg.sendData(JSON.stringify(payload));
  tg.close();
}

function setActiveMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function setActiveTemp(value) {
  state.temperature = value;
  document.querySelectorAll(".temp-chip").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.temp) === value);
  });
  document.getElementById("tempLabel").textContent = String(value);
}

function applyTheme() {
  document.documentElement.style.setProperty("--bg", tg.themeParams.bg_color || "#0f1117");
  document.documentElement.style.setProperty("--text", tg.themeParams.text_color || "#f5f7fb");
  document.documentElement.style.setProperty("--hint", tg.themeParams.hint_color || "#8b93a7");
  document.documentElement.style.setProperty("--accent", tg.themeParams.button_color || "#2aabee");
  document.documentElement.style.setProperty(
    "--accent-text",
    tg.themeParams.button_text_color || "#ffffff"
  );
  document.documentElement.style.setProperty(
    "--secondary",
    tg.themeParams.secondary_bg_color || "#1a1f2b"
  );
}

function init() {
  tg.ready();
  tg.expand();
  applyTheme();

  loadState();
  setActiveMode(state.mode);
  setActiveTemp(state.temperature);

  document.getElementById("modeGrid").addEventListener("click", (event) => {
    const card = event.target.closest(".mode-card");
    if (!card) return;
    setActiveMode(card.dataset.mode);
    tg.HapticFeedback.selectionChanged();
  });

  document.getElementById("tempGrid").addEventListener("click", (event) => {
    const chip = event.target.closest(".temp-chip");
    if (!chip) return;
    setActiveTemp(Number(chip.dataset.temp));
    tg.HapticFeedback.selectionChanged();
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    tg.HapticFeedback.impactOccurred("medium");
    sendToBot({ action: "clear" });
  });

  document.getElementById("testBtn").addEventListener("click", () => {
    tg.HapticFeedback.impactOccurred("light");
    sendToBot({ action: "test" });
  });

  tg.MainButton.setText("Сохранить настройки");
  tg.MainButton.show();
  tg.MainButton.onClick(() => {
    saveState();
    tg.HapticFeedback.notificationOccurred("success");
    sendToBot({
      action: "apply",
      mode: state.mode,
      temperature: state.temperature,
    });
  });
}

init();
