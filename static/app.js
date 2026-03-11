let currentConversationId = null;
let aiBusy = false;

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(msg, ok = false) {
  const el = document.getElementById("auth-message");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "#31c48d" : "#ffd166";
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Falha HTTP ${res.status}`);
  return data;
}

function switchAuthTab(showLogin) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginBtn = document.getElementById("btn-login-tab");
  const registerBtn = document.getElementById("btn-register-tab");
  if (loginForm) loginForm.classList.toggle("hidden", !showLogin);
  if (registerForm) registerForm.classList.toggle("hidden", showLogin);
  if (loginBtn) loginBtn.classList.toggle("active", showLogin);
  if (registerBtn) registerBtn.classList.toggle("active", !showLogin);
  setMessage("");
}

function showAI(user) {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("ai-section").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}`;
}

function showAuth() {
  document.getElementById("ai-section").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
}

async function checkSession() {
  try {
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    if (me.authenticated) {
      showAI(me.username);
      await loadConversations();
      await loadAiHistory();
    }
  } catch {
    showAuth();
  }
}

async function onRegister(e) {
  e.preventDefault();
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("reg-user").value.trim(),
        password: document.getElementById("reg-pass").value,
      }),
    });
    setMessage(data.message || "Conta criada", true);
    switchAuthTab(true);
  } catch (err) {
    setMessage(err.message);
  }
}

async function onLogin(e) {
  e.preventDefault();
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("login-user").value.trim(),
        password: document.getElementById("login-pass").value,
      }),
    });
    setMessage("Login realizado", true);
    showAI(data.username);
    await loadConversations();
    await loadAiHistory();
  } catch (err) {
    setMessage(err.message);
  }
}

async function onLogout() {
  try { await api("/api/auth/logout", { method: "POST", headers: {} }); } catch {}
  showAuth();
}

function renderConversations(items) {
  const list = document.getElementById("ai-conversations");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = "<div class=\"message\">Sem chats ainda.</div>";
    return;
  }
  list.innerHTML = items.map((c) => {
    const active = Number(c.id) === Number(currentConversationId) ? " active" : "";
    const title = escapeHtml(c.title || "Novo Chat");
    const preview = escapeHtml((c.last_message || "").slice(0, 55));
    return `<button class=\"${active ? "active" : ""}\" data-conv-id=\"${c.id}\"><strong>${title}</strong><br/><span>${preview}</span></button>`;
  }).join("");

  list.querySelectorAll("[data-conv-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      currentConversationId = Number(btn.dataset.convId);
      await loadConversations();
      await loadAiHistory();
    });
  });
}

async function loadConversations() {
  const data = await api("/api/ai/conversations", { method: "GET", headers: {} });
  const items = data.items || [];
  if (!currentConversationId && items.length) currentConversationId = items[0].id;
  renderConversations(items);
}

async function createNewChat() {
  const data = await api("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "Novo Chat" }),
  });
  currentConversationId = data.conversation_id;
  await loadConversations();
  await loadAiHistory();
}

function renderAiContent(content) {
  const raw = content || "";
  const urlMatches = raw.match(/https?:\/\/\S+/g) || [];
  const urls = [...new Set(urlMatches)];
  let html = escapeHtml(raw).replaceAll("\n", "<br>");
  urls.forEach((u) => {
    const safe = escapeHtml(u);
    html = html.replaceAll(safe, `<a href=\"${safe}\" target=\"_blank\" rel=\"noopener noreferrer\">${safe}</a>`);
  });
  return html;
}

function renderAiHistory(items) {
  const stream = document.getElementById("ai-chat-stream");
  if (!stream) return;
  if (!items.length) {
    stream.innerHTML = '<div class="message">Chat vazio. Faça sua primeira pergunta.</div>';
    return;
  }
  stream.innerHTML = items.map((m) => {
    const roleClass = m.role === "user" ? "user" : "assistant";
    const sourceLine = m.source ? `<div class=\"ai-source\">Fonte: ${escapeHtml(m.source)}</div>` : "";
    return `
      <div class=\"ai-msg ${roleClass}\">
        <div class=\"ai-role\">${m.role === "user" ? "Voce" : "Nemo IA"}</div>
        <div class=\"ai-content\">${renderAiContent(m.content)}</div>
        ${sourceLine}
      </div>
    `;
  }).join("");
  stream.scrollTop = stream.scrollHeight;
}

async function loadAiHistory() {
  const stream = document.getElementById("ai-chat-stream");
  if (!currentConversationId) {
    stream.innerHTML = '<div class="message">Clique em Novo Chat para comecar.</div>';
    return;
  }
  const data = await api(`/api/ai/history?conversation_id=${encodeURIComponent(currentConversationId)}&limit=200`, {
    method: "GET",
    headers: {},
  });
  renderAiHistory(data.items || []);
}

async function clearAiHistory() {
  if (!currentConversationId) return;
  await api("/api/ai/history", {
    method: "DELETE",
    body: JSON.stringify({ conversation_id: currentConversationId }),
  });
  await loadAiHistory();
}

function ocrWithTimeout(file, timeoutMs = 12000) {
  if (!file || !window.Tesseract) return Promise.resolve("");
  const ocrPromise = Tesseract.recognize(file, "por+eng", { logger: () => {} })
    .then((r) => (r?.data?.text || "").trim())
    .catch(() => "");
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(""), timeoutMs));
  return Promise.race([ocrPromise, timeoutPromise]);
}

async function onAiAsk() {
  if (aiBusy) return;
  const input = document.getElementById("ai-question");
  const imageInput = document.getElementById("ai-image");
  const askBtn = document.getElementById("ai-ask-btn");
  const file = imageInput?.files?.[0] || null;
  const questionRaw = input.value.trim();
  if (!questionRaw && !file) return;
  aiBusy = true;
  if (askBtn) askBtn.disabled = true;

  try {
    if (!currentConversationId) await createNewChat();
    const question = questionRaw || "Explique e resolva com base na imagem enviada.";
    input.value = "";
    let imageText = "";
    if (file) {
      imageText = await ocrWithTimeout(file, 12000);
      imageInput.value = "";
    }

    const data = await api("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({
        question,
        conversation_id: currentConversationId,
        image_text: imageText,
      }),
    });

    currentConversationId = data.conversation_id || currentConversationId;
    await loadConversations();
    await loadAiHistory();
  } catch (err) {
    const stream = document.getElementById("ai-chat-stream");
    if (stream) {
      stream.innerHTML += `<div class=\"message\">Erro: ${escapeHtml(err.message)}</div>`;
      stream.scrollTop = stream.scrollHeight;
    }
  } finally {
    aiBusy = false;
    if (askBtn) askBtn.disabled = false;
  }
}

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function bindEvents() {
  bind("btn-login-tab", "click", () => switchAuthTab(true));
  bind("btn-register-tab", "click", () => switchAuthTab(false));
  bind("register-form", "submit", onRegister);
  bind("login-form", "submit", onLogin);
  bind("logout-btn", "click", onLogout);

  bind("ai-ask-btn", "click", onAiAsk);
  bind("ai-new-chat-btn", "click", createNewChat);
  bind("ai-refresh-btn", "click", async () => {
    await loadConversations();
    await loadAiHistory();
  });
  bind("ai-clear-btn", "click", clearAiHistory);
  bind("ai-question", "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onAiAsk();
    }
  });
}

function boot() {
  bindEvents();
  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);
