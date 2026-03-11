let isAdmin = false;
let heartbeatTimer = null;
let currentConversationId = null;
let aiBusy = false;
let selectedPeer = null;
let socialTimer = null;
let selectedGroupId = null;
let mediaRecorder = null;
let recordedAudioBlob = null;
let typingTimer = null;
let audioCtx = null;
let analyserNode = null;
let meterRaf = null;
let meterTimer = null;
let meterStart = null;
let meterStream = null;

function output(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrlToken(url) {
  return (url || "").replace(/[),.;]+$/, "");
}

function parseCsvLikeTable(raw) {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l.includes(","));

  if (lines.length < 2) return null;
  const rows = lines.map((l) => l.split(",").map((c) => c.trim()));
  const colCount = rows[0].length;
  if (colCount < 2) return null;
  if (!rows.every((r) => r.length === colCount)) return null;

  const header = rows[0];
  const body = rows.slice(1);
  return { header, body };
}

function renderAiTable(raw) {
  const parsed = parseCsvLikeTable(raw);
  if (!parsed) return "";

  const head = `<tr>${parsed.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = parsed.body
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");

  return `<div class="ai-table-wrap"><table class="ai-table">${head}${body}</table></div>`;
}

function renderAiContent(content) {
  const raw = content || "";
  const urlMatches = raw.match(/https?:\/\/\S+/g) || [];
  const urls = [...new Set(urlMatches.map(normalizeUrlToken).filter(Boolean))];

  let html = escapeHtml(raw).replaceAll("\n", "<br>");
  urls.forEach((u) => {
    const safe = escapeHtml(u);
    html = html.replaceAll(safe, `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`);
  });

  const imageUrls = urls.filter((u) => u.includes("image.pollinations.ai/") || u.includes("/api/ai/generated-image"));
  if (imageUrls.length) {
    html += imageUrls
      .map((u) => {
        const safe = escapeHtml(u);
        return `<div class="ai-image-wrap"><img class="ai-inline-image" src="${safe}" alt="Imagem gerada pela Nemo IA" loading="lazy" /></div>`;
      })
      .join("");
  }

  const tableHtml = renderAiTable(raw);
  if (tableHtml) html += tableHtml;

  return html;
}

function setAiStatus(msg) {
  const el = document.getElementById("ai-status");
  if (el) el.textContent = msg || "";
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

function setMessage(msg, ok = false) {
  const el = document.getElementById("auth-message");
  el.textContent = msg;
  el.style.color = ok ? "#31c48d" : "#ffd166";
}

const THEME_KEY = "rbsh-theme";

function applyTheme(theme) {
  const safe = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = safe;
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = safe === "light" ? "Tema: Claro" : "Tema: Escuro";
  try { localStorage.setItem(THEME_KEY, safe); } catch {}
}

function initTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem(THEME_KEY) || "dark"; } catch {}
  applyTheme(theme);
}

function switchAuthTab(showLogin) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginBtn = document.getElementById("btn-login-tab");
  const registerBtn = document.getElementById("btn-register-tab");
  const card = document.querySelector(".auth-card");
  if (loginForm) loginForm.classList.toggle("hidden", !showLogin);
  if (registerForm) registerForm.classList.toggle("hidden", showLogin);
  if (loginBtn) loginBtn.classList.toggle("active", showLogin);
  if (registerBtn) registerBtn.classList.toggle("active", !showLogin);
  if (card) card.dataset.mode = showLogin ? "login" : "register";
  const title = document.getElementById("auth-title");
  if (title) title.textContent = showLogin ? "Entrar" : "Criar conta";
  setMessage("");
}

function initMap() {
  if (map) return;
  map = L.map("map", { zoomControl: true }).setView([18, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
}

function setTopic(name) {
  document.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.topic === name);
  });
  document.querySelectorAll(".topic-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `topic-${name}`);
  });;
  if (name === "profile") loadProfile();
  if (name === "social") { loadUsers(); loadGroups(); loadMessages(); }
  if (name === "admin" && isAdmin) refreshAdmin();
}

async function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await api("/api/auth/ping", { method: "POST", headers: {} }).catch(() => null);
  heartbeatTimer = setInterval(async () => {
    await api("/api/auth/ping", { method: "POST", headers: {} }).catch(() => null);
  }, 25000);
}

async function requestBrowserLocation() {
  const statusEl = document.getElementById("location-status");
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocalizacao nao suportada neste navegador.";
    return;
  }

  statusEl.textContent = "Solicitando localizacao...";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      if (map) {
        const point = [lat, lon];
        map.setView(point, 6);
        if (geoMarker) geoMarker.remove();
        geoMarker = L.marker(point).addTo(map).bindPopup("Sua localizacao").openPopup();
      }
      try {
        const rev = await api(`/api/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { method: "GET", headers: {} });
        statusEl.textContent = `Localizacao ativa: ${rev.city || "-"}, ${rev.state || "-"}, ${rev.country || "-"}`;
      } catch {
        statusEl.textContent = "Localizacao concedida, sem reverse geocoding disponivel.";
      }
    },
    (err) => {
      statusEl.textContent = `Localizacao nao concedida (${err.message}).`;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function applyAdminMode() {
  document.getElementById("admin-only").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-disabled").classList.toggle("hidden", isAdmin);
}

async function refreshAdmin() {
  if (!isAdmin) return;
  output("admin-users-output", "Carregando usuarios...");
  output("changes-output", "Carregando alteracoes...");
  try {
    const users = await api("/api/admin/users", { method: "GET", headers: {} });
    const concise = (users.items || []).map((u) => ({
      usuario: u.username,
      criado_em: u.created_at,
      online: u.online ? "sim" : "nao",
    }));
    output("admin-users-output", concise);
  } catch (err) {
    output("admin-users-output", "Erro: " + err.message);
  }

  try {
    const limit = document.getElementById("changes-limit")?.value?.trim() || "80";
    const data = await api("/api/admin/changes?limit=" + encodeURIComponent(limit), { method: "GET", headers: {} });
    const concise = (data.items || []).map((r) => ({
      usuario: r.username,
      tipo: r.change_type,
      detalhes: r.details,
      quando: r.created_at,
    }));
    output("changes-output", concise);
  } catch (err) {
    output("changes-output", "Erro: " + err.message);
  }
}
function renderConversations(items) {
  const list = document.getElementById("ai-conversations");
  if (!list) return;

  list.innerHTML = items
    .map((c) => {
      const active = Number(c.id) === Number(currentConversationId) ? " active" : "";
      const title = escapeHtml(c.title || "Novo Chat");
      const preview = escapeHtml((c.last_message || "").slice(0, 55));
      return `<button class="ai-history-item${active}" data-conv-id="${c.id}" type="button"><strong>${title}</strong><br/><span>${preview}</span></button>`;
    })
    .join("");

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

function renderAiHistory(items) {
  const stream = document.getElementById("ai-chat-stream");
  if (!stream) return;

  if (!items.length) {
    stream.innerHTML = '<div class="ai-empty">Chat vazio. Faça sua primeira pergunta.</div>';
    return;
  }

  stream.innerHTML = items
    .map((m) => {
      const roleClass = m.role === "user" ? "user" : "assistant";
      const sourceLine = m.source ? `<div class="ai-source">Fonte: ${escapeHtml(m.source)}</div>` : "";
      const delBtn = m.id ? `<button class="ai-del-btn" data-ai-id="${m.id}" type="button">Excluir</button>` : "";
      return `
        <div class="ai-msg ${roleClass}">
          <div class="ai-role">${m.role === "user" ? "Voce" : "Nemo IA"}</div>
          <div class="ai-content">${renderAiContent(m.content)}</div>
          ${sourceLine}
          ${delBtn}
        </div>
      `;
    })
    .join("");

  stream.querySelectorAll(".ai-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteAiMessage(btn.dataset.aiId);
    });
  });


  stream.querySelectorAll(".ai-inline-image").forEach((img) => {
    img.addEventListener("error", () => {
      const holder = document.createElement("div");
      holder.className = "ai-img-error";
      holder.textContent = "Falha ao carregar preview da imagem. Abra o link acima.";
      img.replaceWith(holder);
    });
  });
  stream.scrollTop = stream.scrollHeight;
}

async function loadAiHistory() {
  const stream = document.getElementById("ai-chat-stream");
  if (!currentConversationId) {
    stream.innerHTML = '<div class="ai-empty">Clique em Novo Chat para começar.</div>';
    return;
  }

  try {
    const data = await api(`/api/ai/history?conversation_id=${encodeURIComponent(currentConversationId)}&limit=200`, {
      method: "GET",
      headers: {},
    });
    renderAiHistory(data.items || []);
  } catch (err) {
    if (stream) stream.innerHTML = `<div class="ai-empty">Erro ao carregar historico: ${escapeHtml(err.message)}</div>`;
  }
}

async function deleteAiMessage(id) {
  if (!id) return;
  await api(`/api/ai/history/${encodeURIComponent(id)}`, { method: "DELETE", headers: {} });
  await loadAiHistory();
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

    const stream = document.getElementById("ai-chat-stream");
    if (stream) {
      stream.innerHTML += `
        <div class="ai-msg user"><div class="ai-role">Voce</div><div class="ai-content">${escapeHtml(question)}${file ? "\n[Imagem anexada]" : ""}</div></div>
        <div class="ai-msg assistant"><div class="ai-role">Nemo IA</div><div class="ai-content">Pensando...</div></div>
      `;
      stream.scrollTop = stream.scrollHeight;
    }

    let imageText = "";
    if (file) {
      setAiStatus("Processando imagem...");
      imageText = await ocrWithTimeout(file, 12000);
      imageInput.value = "";
    }

    setAiStatus("Consultando Nemo IA...");
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
    setAiStatus("");
  } catch (err) {
    setAiStatus("");
    const stream = document.getElementById("ai-chat-stream");
    if (stream) {
      stream.innerHTML += `<div class="ai-empty">Erro: ${escapeHtml(err.message)}</div>`;
      stream.scrollTop = stream.scrollHeight;
    }
  } finally {
    aiBusy = false;
    if (askBtn) askBtn.disabled = false;
  }
}
function showDashboard(user, adminFlag) {
  isAdmin = !!adminFlag;
  document.getElementById("auth-card").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}${isAdmin ? " (ADMIN)" : ""}`;

  applyAdminMode();
  setTopic("admin");

  if (isAdmin) refreshAdmin();
  loadConversations().then(loadAiHistory);
  loadProfile();
  loadUsers();
  loadGroups();
  startHeartbeat();
  startSocialPolling();
}

function showAuth() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-card").classList.remove("hidden");
  if (socialTimer) { clearInterval(socialTimer); socialTimer = null; }
}

async function checkSession() {
  try {
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    if (me.authenticated) showDashboard(me.username, me.is_admin);
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
    showDashboard(data.username, data.is_admin);
  } catch (err) {
    setMessage(err.message);
  }
}

async function onLogout() {
  try {
    await api("/api/auth/logout", { method: "POST", headers: {} });
  } catch {
    // no-op
  }
  showAuth();
}

async function onGeo() {
  const ip = document.getElementById("geo-ip").value.trim();
  output("geo-output", "Consultando...");
  try {
    const q = ip ? `?ip=${encodeURIComponent(ip)}` : "";
    const data = await api(`/api/geo/ip${q}`, { method: "GET", headers: {} });
    output("geo-output", {
      ip: data.ip,
      cidade: data.city,
      regiao: data.region,
      pais: data.country,
      timezone: data.timezone,
      provedor: data.org,
    });

    if (data.latitude && data.longitude && map) {
      const p = [Number(data.latitude), Number(data.longitude)];
      map.setView(p, 6);
      if (geoMarker) geoMarker.remove();
      geoMarker = L.marker(p).addTo(map).bindPopup(`${data.city || "Local"} | ${data.ip || "IP"}`).openPopup();
    }
  } catch (err) {
    output("geo-output", `Erro: ${err.message}`);
  }
}

async function onConnectionTest() {
  output("conn-output", "Executando speed test (latencia, download e upload)...");
  try {
    const pingSamples = [];
    for (let i = 0; i < 4; i += 1) {
      const t0 = performance.now();
      await fetch(`/health?ts=${Date.now()}-${i}`, { cache: "no-store", credentials: "same-origin" });
      pingSamples.push(performance.now() - t0);
    }
    const pingMs = pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length;

    const downSizeMb = 6;
    const d0 = performance.now();
    const downRes = await fetch(`/api/network/download-test?size_mb=${downSizeMb}&ts=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const downBlob = await downRes.blob();
    const dSec = (performance.now() - d0) / 1000;
    const downloadMbps = ((downBlob.size * 8) / dSec) / (1024 * 1024);

    const upSizeMb = 3;
    const upBytes = upSizeMb * 1024 * 1024;
    const buffer = new Uint8Array(upBytes);
    for (let i = 0; i < buffer.length; i += 1) buffer[i] = i % 255;

    const u0 = performance.now();
    await fetch(`/api/network/upload-test?ts=${Date.now()}`, {
      method: "POST",
      body: buffer,
      credentials: "same-origin",
      headers: { "Content-Type": "application/octet-stream" },
    });
    const uSec = (performance.now() - u0) / 1000;
    const uploadMbps = ((upBytes * 8) / uSec) / (1024 * 1024);

    output("conn-output", {
      latencia_media_ms: Number(pingMs.toFixed(2)),
      download_mbps: Number(downloadMbps.toFixed(2)),
      upload_mbps: Number(uploadMbps.toFixed(2)),
    });
  } catch (err) {
    output("conn-output", `Erro no speed test: ${err.message}`);
  }
}

async function onMapFeed() {
  try {
    const data = await api("/api/map/earthquakes", { method: "GET", headers: {} });
    if (!map) initMap();
    if (quakeLayer) quakeLayer.remove();
    const layer = L.layerGroup();

    data.items.forEach((q) => {
      const color = q.mag >= 5 ? "#ff595e" : q.mag >= 3 ? "#ffd166" : "#31c48d";
      const marker = L.circleMarker([q.lat, q.lon], {
        radius: Math.max(4, (q.mag || 1) * 2),
        color,
        weight: 1,
        fillOpacity: 0.75,
      }).bindPopup(`<strong>${q.place || "Sem local"}</strong><br/>Magnitude: ${q.mag ?? "N/A"}`);
      layer.addLayer(marker);
    });

    layer.addTo(map);
    quakeLayer = layer;
    setTimeout(() => map.invalidateSize(), 60);
  } catch (err) {
    output("conn-output", `Falha ao carregar mapa global: ${err.message}`);
  }
}

async function onVuln() {
  output("vuln-output", "Analisando dominio...");
  try {
    const host = document.getElementById("target-host").value.trim();
    const data = await api(`/api/vuln?host=${encodeURIComponent(host)}`, { method: "GET", headers: {} });
    output("vuln-output", {
      host: data.host,
      ip: data.ip,
      risk: data.risk,
      portas_abertas: data.ports,
      vulnerabilidades: data.vulns,
      cpes: data.cpes,
      tags: data.tags,
    });
  } catch (err) {
    output("vuln-output", `Erro: ${err.message}`);
  }
}

async function onIntelIp() {
  output("intel-output", "Consultando threat intel IP...");
  try {
    const ip = document.getElementById("intel-ip").value.trim();
    const data = await api(`/api/intel/ip?ip=${encodeURIComponent(ip)}`, { method: "GET", headers: {} });
    output("intel-output", data);
  } catch (err) {
    output("intel-output", `Erro: ${err.message}`);
  }
}

async function onIntelDomain() {
  output("intel-domain-output", "Consultando threat intel dominio...");
  try {
    const domain = document.getElementById("intel-domain").value.trim();
    const data = await api(`/api/intel/domain?domain=${encodeURIComponent(domain)}`, { method: "GET", headers: {} });
    output("intel-domain-output", data);
  } catch (err) {
    output("intel-domain-output", `Erro: ${err.message}`);
  }
}

async function onFeodo() {
  output("feodo-output", "Consultando feed...");
  try {
    const ip = document.getElementById("feodo-ip").value.trim();
    const q = ip ? `?ip=${encodeURIComponent(ip)}` : "";
    const data = await api(`/api/threats/feodo${q}`, { method: "GET", headers: {} });
    output("feodo-output", data);
  } catch (err) {
    output("feodo-output", `Erro: ${err.message}`);
  }
}

async function onCves() {
  output("cve-output", "Buscando CVEs...");
  try {
    const limit = document.getElementById("cve-limit").value.trim() || "8";
    const data = await api(`/api/cves/latest?limit=${encodeURIComponent(limit)}`, { method: "GET", headers: {} });
    output("cve-output", data);
  } catch (err) {
    output("cve-output", `Erro: ${err.message}`);
  }
}

async function onCerts() {
  output("cert-output", "Consultando certificados...");
  try {
    const domain = document.getElementById("cert-domain").value.trim();
    const data = await api(`/api/domain/certs?domain=${encodeURIComponent(domain)}`, { method: "GET", headers: {} });
    output("cert-output", data);
  } catch (err) {
    output("cert-output", `Erro: ${err.message}`);
  }
}

async function onPwnedPassword() {
  output("pwd-output", "Checando vazamento...");
  try {
    const data = await api("/api/password/pwned-check", {
      method: "POST",
      body: JSON.stringify({ password: document.getElementById("pwd-check").value }),
    });
    output("pwd-output", data);
  } catch (err) {
    output("pwd-output", `Erro: ${err.message}`);
  }
}

async function onCisaKev() {
  output("cisa-output", "Carregando CISA KEV...");
  try {
    const data = await api("/api/cyber/cisa-kev", { method: "GET", headers: {} });
    output("cisa-output", data);
  } catch (err) {
    output("cisa-output", `Erro: ${err.message}`);
  }
}

async function onUrlhaus() {
  output("urlhaus-output", "Carregando URLhaus...");
  try {
    const data = await api("/api/cyber/urlhaus-recent", { method: "GET", headers: {} });
    output("urlhaus-output", data);
  } catch (err) {
    output("urlhaus-output", `Erro: ${err.message}`);
  }
}

async function onSecurityHeaders() {
  output("sec-output", "Consultando Security Headers...");
  try {
    const domain = document.getElementById("sec-domain").value.trim();
    const data = await api(`/api/cyber/security-headers?domain=${encodeURIComponent(domain)}`, { method: "GET", headers: {} });
    output("sec-output", data);
  } catch (err) {
    output("sec-output", `Erro: ${err.message}`);
  }
}

async function loadProfile() {
  try {
    const data = await api("/api/profile", { method: "GET", headers: {} });
    document.getElementById("profile-current-name").textContent = `Usuario atual: ${data.username}`;
    const avatar = document.getElementById("profile-avatar-preview");
    avatar.src = data.avatar_url || "https://placehold.co/96x96/111/eee?text=User";
  } catch (err) {
    document.getElementById("profile-msg").textContent = `Erro perfil: ${err.message}`;
  }
}

async function onProfileRename() {
  const msg = document.getElementById("profile-msg");
  msg.textContent = "Atualizando nome...";
  try {
    const newUsername = document.getElementById("profile-new-username").value.trim();
    const password = document.getElementById("profile-password-confirm").value;
    const data = await api("/api/profile/rename", {
      method: "POST",
      body: JSON.stringify({ new_username: newUsername, password }),
    });
    document.getElementById("welcome-user").textContent = `Logado como: ${data.username}${isAdmin ? " (ADMIN)" : ""}`;
    msg.textContent = "Nome atualizado com sucesso.";
    await loadProfile();
  } catch (err) {
    msg.textContent = `Erro: ${err.message}`;
  }
}

async function onProfileAvatar() {
  const msg = document.getElementById("profile-msg");
  const file = document.getElementById("profile-avatar-file")?.files?.[0];
  if (!file) {
    msg.textContent = "Escolha uma imagem.";
    return;
  }
  msg.textContent = "Enviando foto...";
  try {
    const fd = new FormData();
    fd.append("avatar", file);
    const data = await api("/api/profile/avatar", { method: "POST", body: fd, headers: {} });
    document.getElementById("profile-avatar-preview").src = data.avatar_url;
    msg.textContent = "Foto atualizada.";
  } catch (err) {
    msg.textContent = `Erro: ${err.message}`;
  }
}

function renderUsers(items) {
  const list = document.getElementById("social-users-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = "<div class=\"ai-empty\">Sem outros usuarios.</div>";
    return;
  }
  list.innerHTML = items.map((u) => `
    <button class="social-user-item${selectedPeer === u.username && !selectedGroupId ? " active" : ""}" data-peer="${escapeHtml(u.username)}" type="button">
      <span>${escapeHtml(u.username)}</span>
      <small>${u.online ? "online" : "offline"}</small>
    </button>`).join("");

  list.querySelectorAll("[data-peer]").forEach((b) => {
    b.addEventListener("click", async () => {
      selectedGroupId = null;
      selectedPeer = b.dataset.peer;
      document.getElementById("social-chat-title").textContent = `Chat com ${selectedPeer}`;
      await loadUsers();
      await loadGroups();
      await loadMessages();
      await loadTyping();
    });
  });
}

function renderGroups(items) {
  const list = document.getElementById("social-groups-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = "<div class=\"ai-empty\">Sem grupos.</div>";
    return;
  }
  list.innerHTML = items.map((g) => `
    <button class="social-user-item${selectedGroupId === Number(g.id) ? " active" : ""}" data-group-id="${g.id}" type="button">
      <span>${escapeHtml(g.name)}</span>
      <small>grupo</small>
    </button>`).join("");

  list.querySelectorAll("[data-group-id]").forEach((b) => {
    b.addEventListener("click", async () => {
      selectedPeer = null;
      selectedGroupId = Number(b.dataset.groupId);
      document.getElementById("social-chat-title").textContent = `Grupo #${selectedGroupId}`;
      document.getElementById("social-typing").textContent = "";
      await loadUsers();
      await loadGroups();
      await loadMessages();
    });
  });
}

async function loadUsers() {
  try {
    const data = await api("/api/users", { method: "GET", headers: {} });
    renderUsers(data.items || []);
  } catch {}
}

async function loadGroups() {
  try {
    const data = await api("/api/chat/groups", { method: "GET", headers: {} });
    renderGroups(data.items || []);
  } catch {}
}

function renderMessages(items) {
  const box = document.getElementById("social-messages");
  if (!box) return;
  if (!selectedPeer && !selectedGroupId) {
    box.innerHTML = "<div class=\"ai-empty\">Escolha um usuario ou grupo.</div>";
    return;
  }
  if (!items.length) {
    box.innerHTML = "<div class=\"ai-empty\">Sem mensagens ainda.</div>";
    return;
  }

  box.innerHTML = items.map((m) => {
    const mine = selectedGroupId ? (m.sender !== (document.getElementById("welcome-user").textContent.match(/Logado como: ([^\s]+)/)?.[1] || "")) : (m.sender !== selectedPeer);
    const senderLabel = selectedGroupId ? `<strong>${escapeHtml(m.sender || "")}</strong><br/>` : "";
    const text = m.message_text ? `<div>${escapeHtml(m.message_text)}</div>` : "";
    const image = m.message_type === "image" && m.file_url ? `<img class=\"social-image\" src=\"${escapeHtml(m.file_url)}\" alt=\"imagem\" />` : "";
    const audio = m.message_type === "audio" && m.file_url ? `<audio controls src=\"${escapeHtml(m.file_url)}\"></audio>` : "";
    return `<div class="social-msg ${mine ? "mine" : "peer"}">${senderLabel}${text}${image}${audio}<small>${escapeHtml(m.created_at || "")}</small></div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

async function loadMessages() {
  try {
    if (selectedGroupId) {
      const data = await api(`/api/chat/groups/${selectedGroupId}/messages?limit=200`, { method: "GET", headers: {} });
      renderMessages(data.items || []);
      return;
    }
    if (!selectedPeer) return;
    const data = await api(`/api/chat/messages?with=${encodeURIComponent(selectedPeer)}&limit=200`, { method: "GET", headers: {} });
    renderMessages(data.items || []);
  } catch {}
}

async function loadTyping() {
  if (!selectedPeer || selectedGroupId) return;
  try {
    const data = await api(`/api/chat/typing?with=${encodeURIComponent(selectedPeer)}`, { method: "GET", headers: {} });
    document.getElementById("social-typing").textContent = data.typing ? `${selectedPeer} está digitando...` : "";
  } catch {}
}

async function setTypingState(isTyping) {
  if (!selectedPeer || selectedGroupId) return;
  await api("/api/chat/typing", {
    method: "POST",
    body: JSON.stringify({ receiver: selectedPeer, is_typing: isTyping }),
  }).catch(() => null);
}

function sendWithProgress(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const progressEl = document.getElementById("social-upload-progress");
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (evt) => {
      if (!progressEl) return;
      if (!evt.lengthComputable) {
        progressEl.textContent = "Enviando...";
        return;
      }
      const pct = Math.round((evt.loaded / evt.total) * 100);
      progressEl.textContent = `Upload: ${pct}%`;
    };
    xhr.onload = () => {
      if (progressEl) progressEl.textContent = "";
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Falha HTTP ${xhr.status}`));
    };
    xhr.onerror = () => {
      if (progressEl) progressEl.textContent = "";
      reject(new Error("Falha de rede no upload"));
    };
    xhr.send(formData);
  });
}

async function onSocialSend() {
  if (!selectedPeer && !selectedGroupId) return;
  const text = document.getElementById("social-text").value.trim();
  const image = document.getElementById("social-image")?.files?.[0];
  const audioInput = document.getElementById("social-audio")?.files?.[0];
  const audio = audioInput || recordedAudioBlob;
  if (!text && !image && !audio) return;

  const fd = new FormData();
  if (text) fd.append("message", text);
  if (image) fd.append("image", image);
  if (audio) fd.append("audio", audio, audio.name || "recorded.webm");

  try {
    if (selectedGroupId) {
      await sendWithProgress(`/api/chat/groups/${selectedGroupId}/send`, fd);
    } else {
      fd.append("to", selectedPeer);
      await sendWithProgress("/api/chat/send", fd);
      await setTypingState(false);
    }
    document.getElementById("social-text").value = "";
    if (document.getElementById("social-image")) document.getElementById("social-image").value = "";
    if (document.getElementById("social-audio")) document.getElementById("social-audio").value = "";
    recordedAudioBlob = null;
    await loadMessages();
  } catch (err) {
    alert(`Erro ao enviar: ${err.message}`);
  }
}

async function onDeleteConversation() {
  if (!selectedPeer || selectedGroupId) return;
  await api(`/api/chat/messages?with=${encodeURIComponent(selectedPeer)}`, { method: "DELETE", headers: {} });
  await loadMessages();
}

async function onCreateGroup() {
  const name = document.getElementById("group-name").value.trim();
  const membersRaw = document.getElementById("group-members").value.trim();
  const members = membersRaw ? membersRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  await api("/api/chat/groups", {
    method: "POST",
    body: JSON.stringify({ name, members }),
  });
  document.getElementById("group-name").value = "";
  document.getElementById("group-members").value = "";
  await loadGroups();
}

function showAudioMeter(show) {
  const meter = document.getElementById("audio-meter");
  if (!meter) return;
  meter.classList.toggle("hidden", !show);
}

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return mm + ":" + ss;
}

function startMeter() {
  const canvas = document.getElementById("audio-wave");
  const timeEl = document.getElementById("audio-time");
  if (!canvas || !analyserNode) return;
  const ctx = canvas.getContext("2d");
  const buffer = new Uint8Array(analyserNode.fftSize);
  meterStart = performance.now();
  showAudioMeter(true);

  const draw = () => {
    analyserNode.getByteTimeDomainData(buffer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#d90429";
    ctx.beginPath();
    const slice = canvas.width / buffer.length;
    let x = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const v = buffer[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    meterRaf = requestAnimationFrame(draw);
  };

  draw();
  if (timeEl) {
    meterTimer = setInterval(() => {
      timeEl.textContent = formatClock((performance.now() - meterStart) / 1000);
    }, 300);
  }
}

function stopMeter() {
  if (meterRaf) cancelAnimationFrame(meterRaf);
  meterRaf = null;
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  const timeEl = document.getElementById("audio-time");
  if (timeEl) timeEl.textContent = "00:00";
  showAudioMeter(false);
  if (audioCtx) {
    audioCtx.close().catch(() => null);
    audioCtx = null;
  }
  analyserNode = null;
}
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  meterStream = stream;

  const chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    blob.name = udio-.webm;
    recordedAudioBlob = blob;
    const progressEl = document.getElementById("social-upload-progress");
    if (progressEl) progressEl.textContent = "Audio gravado e pronto para enviar.";
    stream.getTracks().forEach((t) => t.stop());
    stopMeter();
  };

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 512;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyserNode);
  startMeter();

  mediaRecorder.start();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (meterStream) {
    meterStream.getTracks().forEach((t) => t.stop());
    meterStream = null;
  }
  stopMeter();
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

function startSocialPolling() {
  if (socialTimer) clearInterval(socialTimer);
  socialTimer = setInterval(async () => {
    await loadUsers();
    await loadGroups();
    await loadMessages();
    await loadTyping();
  }, 5000);
}

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function bindEvents() {\r\n  document.querySelectorAll('[data-toggle-pass]').forEach((btn) => {\r\n    btn.addEventListener('click', () => {\r\n      const id = btn.getAttribute('data-toggle-pass');\r\n      const input = document.getElementById(id);\r\n      if (!input) return;\r\n      const isPass = input.type === 'password';\r\n      input.type = isPass ? 'text' : 'password';\r\n      btn.textContent = isPass ? 'Ocultar' : 'Mostrar';\r\n    });\r\n  });\r\n\r\nfunction bindEvents() {
  bind("btn-login-tab", "click", () => switchAuthTab(true));
  bind("btn-register-tab", "click", () => switchAuthTab(false));
  bind("register-form", "submit", onRegister);
  bind("login-form", "submit", onLogin);
  bind("logout-btn", "click", onLogout);

  document.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTopic(btn.dataset.topic));
  });

  bind("admin-users-btn", "click", refreshAdmin);
  bind("changes-btn", "click", refreshAdmin);

  bind("profile-rename-btn", "click", onProfileRename);
  bind("profile-avatar-btn", "click", onProfileAvatar);

  bind("social-refresh-users", "click", async () => {
    await loadUsers();
    await loadGroups();
    await loadMessages();
  });
  bind("group-refresh-btn", "click", loadGroups);
  bind("group-create-btn", "click", onCreateGroup);
  bind("social-send", "click", onSocialSend);
  bind("social-delete-conv", "click", onDeleteConversation);
  bind("social-rec-start", "click", startRecording);
  bind("social-rec-stop", "click", stopRecording);
  bind("social-text", "input", async () => {
    if (selectedPeer && !selectedGroupId) {
      await setTypingState(true);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setTypingState(false), 2500);
    }
  });
  bind("social-text", "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSocialSend();
    }
  });

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
  bind("ai-image", "change", () => {
    const file = document.getElementById("ai-image")?.files?.[0];
    setAiStatus(file ? `Imagem pronta: ${file.name}` : "");
  });

  bind("theme-toggle", "click", () => {
    const current = document.documentElement.dataset.theme || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

function boot() {
  initTheme();
  bindEvents();
  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);
































