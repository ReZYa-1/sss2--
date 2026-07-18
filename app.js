// Заглушка на случай открытия вне Telegram (обычный браузер)
const noop = () => {};
const tg = (window.Telegram && window.Telegram.WebApp) || {
  ready: noop,
  expand: noop,
  themeParams: {},
  MainButton: { hide: noop },
  HapticFeedback: { selectionChanged: noop, impactOccurred: noop, notificationOccurred: noop },
  showAlert: (msg) => alert(msg),
};

const SETTINGS_KEY = "hy3_settings_v1";
const HISTORY_KEY = "hy3_chat_history_v1";
const MODEL = "tencent/hy3:free";
const MODE_LIMITS = { fast: 4, medium: 10, max: 20 };
const MAX_HISTORY = 40;

const BG_PRESETS = {
  night: ["#0b0f1a", "#202a44"],
  ocean: ["#0f2027", "#2c5364"],
  purple: ["#1a0533", "#6a3093"],
  sunset: ["#3a1c71", "#d76d77"],
  forest: ["#0b2e1f", "#2e7d5b"],
};

const state = {
  mode: "medium",
  temperature: 0.7,
  apiKey: "",
  bg: { type: "tg" },
};

let chatHistory = [];
let isSending = false;

// ---------- хранение ----------

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (saved.mode in MODE_LIMITS) state.mode = saved.mode;
    if (typeof saved.temperature === "number") state.temperature = saved.temperature;
    if (typeof saved.apiKey === "string") state.apiKey = saved.apiKey;
    if (saved.bg && typeof saved.bg === "object") state.bg = saved.bg;
  } catch (_) {
    /* игнорируем битое хранилище */
  }

  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (Array.isArray(saved)) chatHistory = saved;
  } catch (_) {
    chatHistory = [];
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
}

function saveHistory() {
  chatHistory = chatHistory.slice(-MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
}

// ---------- утилиты ----------

function cleanMarkdown(text) {
  if (!text) return text;
  return text
    .replace(/\*\*\s*([\s\S]+?)\s*\*\*/g, "$1")
    .replace(/__\s*([\s\S]+?)\s*__/g, "$1")
    .replace(/(?<!\w)\*(?!\*)/g, "")
    .replace(/(?<!\w)_(?!_)/g, "")
    .trim();
}

function showStatus(text) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => el.classList.remove("visible"), 2500);
}

// ---------- чат ----------

function addBubble(role, text) {
  const placeholder = document.getElementById("chatPlaceholder");
  if (placeholder) placeholder.remove();

  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  document.getElementById("messages").appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

function renderHistory() {
  for (const msg of chatHistory) {
    addBubble(msg.role === "user" ? "user" : "assistant", msg.content);
  }
}

async function askModel(messages, { maxTokens = 800, temperature = state.temperature } = {}) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!resp.ok) {
    throw new Error(`API ${resp.status}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty");
  return content;
}

async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  if (!state.apiKey) {
    showStatus("🔑 Сначала вставь ключ OpenRouter в Настройках");
    switchTab("settings");
    return;
  }

  input.value = "";
  input.style.height = "auto";

  chatHistory.push({ role: "user", content: text });
  saveHistory();
  addBubble("user", text);

  const typing = addBubble("assistant typing", "…");
  isSending = true;
  document.getElementById("sendBtn").disabled = true;

  const limit = MODE_LIMITS[state.mode] || 10;
  const messages = [
    { role: "system", content: "Отвечай обычным текстом без Markdown." },
    ...chatHistory.slice(-limit),
  ];

  try {
    const answer = cleanMarkdown(await askModel(messages));
    chatHistory.push({ role: "assistant", content: answer });
    saveHistory();
    typing.classList.remove("typing");
    typing.textContent = answer;
  } catch (_) {
    // не храним вопрос без ответа
    chatHistory.pop();
    saveHistory();
    typing.classList.remove("typing");
    typing.classList.add("error");
    typing.textContent = "❌ Не удалось получить ответ. Проверь ключ и интернет.";
  } finally {
    isSending = false;
    document.getElementById("sendBtn").disabled = false;
    typing.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

// ---------- вкладки ----------

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  document.getElementById("view-chat").classList.toggle("hidden", name !== "chat");
  document.getElementById("view-settings").classList.toggle("hidden", name !== "settings");
}

// ---------- настройки ----------

function setActiveMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  saveSettings();
}

function setActiveTemp(value) {
  state.temperature = value;
  document.querySelectorAll(".temp-chip").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.temp) === value);
  });
  document.getElementById("tempLabel").textContent = String(value);
  saveSettings();
}

function updateKeyStatus() {
  const el = document.getElementById("keyStatus");
  if (state.apiKey) {
    el.textContent = "✅ Ключ сохранён";
    el.className = "key-status ok";
  } else {
    el.textContent = "⚠️ Ключ не задан — чат не будет работать";
    el.className = "key-status warn";
  }
}

// ---------- фон ----------

function bgGradient(from, to) {
  return `linear-gradient(160deg, ${from}, ${to})`;
}

function applyBackground() {
  const bg = state.bg || { type: "tg" };
  let from = null;
  let to = null;

  if (bg.type === "preset" && BG_PRESETS[bg.id]) {
    [from, to] = BG_PRESETS[bg.id];
  } else if (bg.type === "custom" && bg.from && bg.to) {
    from = bg.from;
    to = bg.to;
  }

  document.body.style.backgroundImage = from ? bgGradient(from, to) : "";

  document.querySelectorAll(".bg-swatch").forEach((btn) => {
    const id = btn.dataset.bg;
    const isActive =
      (bg.type === "tg" && id === "tg") ||
      (bg.type === "preset" && bg.id === id);
    btn.classList.toggle("active", isActive);
  });
}

function initBgSwatches() {
  document.querySelectorAll(".bg-swatch").forEach((btn) => {
    const preset = BG_PRESETS[btn.dataset.bg];
    if (preset) {
      btn.style.backgroundImage = bgGradient(preset[0], preset[1]);
    }
  });

  if (state.bg && state.bg.type === "custom") {
    document.getElementById("bgFrom").value = state.bg.from;
    document.getElementById("bgTo").value = state.bg.to;
  }
}

// ---------- тема ----------

function applyTheme() {
  const p = tg.themeParams;
  const root = document.documentElement.style;
  root.setProperty("--bg", p.bg_color || "#0f1117");
  root.setProperty("--text", p.text_color || "#f5f7fb");
  root.setProperty("--hint", p.hint_color || "#8b93a7");
  root.setProperty("--accent", p.button_color || "#2aabee");
  root.setProperty("--accent-text", p.button_text_color || "#ffffff");
  root.setProperty("--secondary", p.secondary_bg_color || "#1a1f2b");
}

// ---------- запуск ----------

function init() {
  tg.ready();
  tg.expand();
  tg.MainButton.hide();
  applyTheme();

  loadState();
  renderHistory();
  setActiveMode(state.mode);
  setActiveTemp(state.temperature);
  updateKeyStatus();
  initBgSwatches();
  applyBackground();

  document.querySelector(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    switchTab(tab.dataset.tab);
    tg.HapticFeedback.selectionChanged();
  });

  const input = document.getElementById("chatInput");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("sendBtn").addEventListener("click", sendMessage);

  document.getElementById("saveKeyBtn").addEventListener("click", () => {
    state.apiKey = document.getElementById("apiKeyInput").value.trim();
    saveSettings();
    updateKeyStatus();
    document.getElementById("apiKeyInput").value = "";
    showStatus(state.apiKey ? "🔑 Ключ сохранён" : "🔑 Ключ удалён");
    tg.HapticFeedback.notificationOccurred("success");
  });

  document.getElementById("modeGrid").addEventListener("click", (event) => {
    const card = event.target.closest(".mode-card");
    if (!card) return;
    setActiveMode(card.dataset.mode);
    showStatus("✅ Режим сохранён");
    tg.HapticFeedback.selectionChanged();
  });

  document.getElementById("tempGrid").addEventListener("click", (event) => {
    const chip = event.target.closest(".temp-chip");
    if (!chip) return;
    setActiveTemp(Number(chip.dataset.temp));
    showStatus("✅ Температура сохранена");
    tg.HapticFeedback.selectionChanged();
  });

  document.getElementById("bgGrid").addEventListener("click", (event) => {
    const swatch = event.target.closest(".bg-swatch");
    if (!swatch) return;
    const id = swatch.dataset.bg;
    state.bg = id === "tg" ? { type: "tg" } : { type: "preset", id };
    saveSettings();
    applyBackground();
    showStatus("🎨 Фон применён");
    tg.HapticFeedback.selectionChanged();
  });

  document.getElementById("applyCustomBg").addEventListener("click", () => {
    state.bg = {
      type: "custom",
      from: document.getElementById("bgFrom").value,
      to: document.getElementById("bgTo").value,
    };
    saveSettings();
    applyBackground();
    showStatus("🎨 Свой фон применён");
    tg.HapticFeedback.notificationOccurred("success");
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    chatHistory = [];
    saveHistory();
    const messages = document.getElementById("messages");
    messages.innerHTML = '<div class="chat-placeholder" id="chatPlaceholder">Напиши сообщение — Tencent HY3 ответит прямо здесь</div>';
    showStatus("🗑 История очищена");
    tg.HapticFeedback.impactOccurred("medium");
  });

  document.getElementById("testBtn").addEventListener("click", async () => {
    if (!state.apiKey) {
      showStatus("🔑 Сначала вставь ключ OpenRouter");
      return;
    }
    showStatus("🧪 Проверяю подключение...");
    try {
      await askModel(
        [{ role: "user", content: "Представься в одном предложении" }],
        { maxTokens: 100, temperature: 0.5 }
      );
      showStatus("✅ Тест пройден — подключение работает");
      tg.HapticFeedback.notificationOccurred("success");
    } catch (_) {
      showStatus("❌ Тест не пройден — проверь ключ");
      tg.HapticFeedback.notificationOccurred("error");
    }
  });
}

init();
