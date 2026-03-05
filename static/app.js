let map;
let geoMarker;
let quakeLayer;
let isAdmin = false;
let heartbeatTimer = null;

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

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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

function switchAuthTab(showLogin) {
  document.getElementById("login-form").classList.toggle("hidden", !showLogin);
  document.getElementById("register-form").classList.toggle("hidden", showLogin);
  document.getElementById("btn-login-tab").classList.toggle("active", showLogin);
  document.getElementById("btn-register-tab").classList.toggle("active", !showLogin);
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
  });

  if (name === "geo" && map) {
    setTimeout(() => map.invalidateSize(), 60);
  }
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
        const rev = await api(`/api/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {
          method: "GET",
          headers: {},
        });
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

async function refreshAudit() {
  if (!isAdmin) return;
  const limit = document.getElementById("audit-limit").value.trim() || "80";
  output("audit-output", "Carregando auditoria...");
  output("online-output", "Carregando online...");
  try {
    const data = await api(`/api/admin/audit?limit=${encodeURIComponent(limit)}`, { method: "GET", headers: {} });

    const concise = (data.items || []).map((r) => ({
      evento: r.event_type,
      usuario: r.username,
      ip: r.ip,
      local: [r.city, r.region, r.country].filter(Boolean).join(" / "),
      horario: r.created_at,
    }));

    output("audit-output", concise);
    output("online-output", (data.online_users || []).map((u) => ({ usuario: u.username, ultimo_ping: u.last_seen })));
  } catch (err) {
    output("audit-output", `Erro: ${err.message}`);
    output("online-output", `Erro: ${err.message}`);
  }
}

function renderAiHistory(items) {
  const historyList = document.getElementById("ai-history-list");
  const stream = document.getElementById("ai-chat-stream");
  if (!historyList || !stream) return;

  const userQuestions = items.filter((m) => m.role === "user").slice(-30).reverse();
  historyList.innerHTML = userQuestions
    .map((m) => `<div class="ai-history-item">Pergunta em ${escapeHtml((m.created_at || "").replace("T", " "))}</div>`)
    .join("");

  if (!items.length) {
    stream.innerHTML = '<div class="ai-empty">Sem perguntas ainda. O historico so aparece depois da sua pesquisa.</div>';
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
          <div class="ai-content">${escapeHtml(m.content)}</div>
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

  stream.scrollTop = stream.scrollHeight;
}

async function loadAiHistory() {
  try {
    const data = await api("/api/ai/history?limit=160", { method: "GET", headers: {} });
    renderAiHistory(data.items || []);
  } catch (err) {
    const stream = document.getElementById("ai-chat-stream");
    if (stream) stream.innerHTML = `<div class="ai-empty">Erro ao carregar historico: ${escapeHtml(err.message)}</div>`;
  }
}

async function deleteAiMessage(id) {
  if (!id) return;
  try {
    await api(`/api/ai/history/${encodeURIComponent(id)}`, { method: "DELETE", headers: {} });
    await loadAiHistory();
  } catch (err) {
    const stream = document.getElementById("ai-chat-stream");
    if (stream) stream.innerHTML += `<div class="ai-empty">Erro ao excluir: ${escapeHtml(err.message)}</div>`;
  }
}

async function clearAiHistory() {
  try {
    await api("/api/ai/history", { method: "DELETE", headers: {} });
    await loadAiHistory();
  } catch (err) {
    const stream = document.getElementById("ai-chat-stream");
    if (stream) stream.innerHTML += `<div class="ai-empty">Erro ao limpar historico: ${escapeHtml(err.message)}</div>`;
  }
}

async function onAiAsk() {
  const input = document.getElementById("ai-question");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  const stream = document.getElementById("ai-chat-stream");
  if (stream) {
    stream.innerHTML += `
      <div class="ai-msg user"><div class="ai-role">Voce</div><div class="ai-content">${escapeHtml(question)}</div></div>
      <div class="ai-msg assistant"><div class="ai-role">Nemo IA</div><div class="ai-content">Pensando...</div></div>
    `;
    stream.scrollTop = stream.scrollHeight;
  }

  try {
    await api("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    await loadAiHistory();
  } catch (err) {
    if (stream) {
      stream.innerHTML += `<div class="ai-empty">Erro: ${escapeHtml(err.message)}</div>`;
      stream.scrollTop = stream.scrollHeight;
    }
  }
}

function showDashboard(user, adminFlag) {
  isAdmin = !!adminFlag;
  document.getElementById("auth-card").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}${isAdmin ? " (ADMIN)" : ""}`;

  applyAdminMode();
  initMap();
  requestBrowserLocation();
  setTopic("admin");

  if (isAdmin) refreshAudit();
  loadAiHistory();
  startHeartbeat();
}

function showAuth() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-card").classList.remove("hidden");
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

function bindEvents() {
  document.getElementById("btn-login-tab").addEventListener("click", () => switchAuthTab(true));
  document.getElementById("btn-register-tab").addEventListener("click", () => switchAuthTab(false));
  document.getElementById("register-form").addEventListener("submit", onRegister);
  document.getElementById("login-form").addEventListener("submit", onLogin);
  document.getElementById("logout-btn").addEventListener("click", onLogout);

  document.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTopic(btn.dataset.topic));
  });

  document.getElementById("audit-btn").addEventListener("click", refreshAudit);

  document.getElementById("geo-btn").addEventListener("click", onGeo);
  document.getElementById("conn-test-btn").addEventListener("click", onConnectionTest);
  document.getElementById("map-feed-btn").addEventListener("click", onMapFeed);

  document.getElementById("intel-btn").addEventListener("click", onIntelIp);
  document.getElementById("intel-domain-btn").addEventListener("click", onIntelDomain);
  document.getElementById("feodo-btn").addEventListener("click", onFeodo);

  document.getElementById("vuln-btn").addEventListener("click", onVuln);
  document.getElementById("cve-btn").addEventListener("click", onCves);
  document.getElementById("cert-btn").addEventListener("click", onCerts);
  document.getElementById("pwd-btn").addEventListener("click", onPwnedPassword);

  document.getElementById("ai-ask-btn").addEventListener("click", onAiAsk);
  document.getElementById("ai-refresh-btn").addEventListener("click", loadAiHistory);
  document.getElementById("ai-clear-btn").addEventListener("click", clearAiHistory);
  document.getElementById("ai-question").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onAiAsk();
  });
}

function boot() {
  bindEvents();
  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);





