let map;
let geoMarker;
let quakeLayer;
let isAdmin = false;

function output(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
  try {
    const data = await api(`/api/admin/audit?limit=${encodeURIComponent(limit)}`, { method: "GET", headers: {} });
    output("audit-output", data);
  } catch (err) {
    output("audit-output", `Erro: ${err.message}`);
  }
}

async function refreshBans() {
  if (!isAdmin) return;
  output("bans-output", "Carregando bans...");
  try {
    const data = await api("/api/admin/bans", { method: "GET", headers: {} });
    output("bans-output", data);
  } catch (err) {
    output("bans-output", `Erro: ${err.message}`);
  }
}

async function banAction(target_type, target_value, reason) {
  if (!isAdmin) return;
  await api("/api/admin/ban", {
    method: "POST",
    body: JSON.stringify({ target_type, target_value, reason }),
  });
  await refreshBans();
  await refreshAudit();
}

async function unbanAction() {
  const target_type = document.getElementById("unban-type").value.trim();
  const target_value = document.getElementById("unban-value").value.trim();
  try {
    await api("/api/admin/unban", {
      method: "POST",
      body: JSON.stringify({ target_type, target_value }),
    });
    await refreshBans();
    await refreshAudit();
  } catch (err) {
    output("bans-output", `Erro: ${err.message}`);
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

  if (isAdmin) {
    refreshAudit();
    refreshBans();
  }
}

function showAuth() {
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
    output("geo-output", data);
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

async function onPing() {
  output("ping-output", "Executando medicao...");
  try {
    const data = await api("/api/ping", {
      method: "POST",
      body: JSON.stringify({ url: document.getElementById("ping-url").value.trim() }),
    });
    output("ping-output", data);
  } catch (err) {
    output("ping-output", `Erro: ${err.message}`);
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
      }).bindPopup(`<strong>${q.place || "Sem local"}</strong><br/>Mag: ${q.mag ?? "N/A"}`);
      layer.addLayer(marker);
    });

    layer.addTo(map);
    quakeLayer = layer;
  } catch (err) {
    alert(`Falha ao carregar eventos globais: ${err.message}`);
  }
}

async function onVuln() {
  output("vuln-output", "Analisando dominio...");
  try {
    const host = document.getElementById("target-host").value.trim();
    const data = await api(`/api/vuln?host=${encodeURIComponent(host)}`, { method: "GET", headers: {} });
    output("vuln-output", data);
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

async function onAiAsk() {
  output("ai-output", "IA pensando...");
  try {
    const data = await api("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question: document.getElementById("ai-question").value.trim() }),
    });
    output("ai-output", `${data.answer}\n\nFonte: ${data.source}`);
  } catch (err) {
    output("ai-output", `Erro: ${err.message}`);
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
  document.getElementById("bans-refresh-btn").addEventListener("click", refreshBans);
  document.getElementById("ban-user-btn").addEventListener("click", async () => {
    const u = document.getElementById("ban-user").value.trim();
    const reason = document.getElementById("ban-user-reason").value.trim();
    try {
      await banAction("username", u, reason);
    } catch (err) {
      output("bans-output", `Erro: ${err.message}`);
    }
  });
  document.getElementById("ban-ip-btn").addEventListener("click", async () => {
    const ip = document.getElementById("ban-ip").value.trim();
    const reason = document.getElementById("ban-ip-reason").value.trim();
    try {
      await banAction("ip", ip, reason);
    } catch (err) {
      output("bans-output", `Erro: ${err.message}`);
    }
  });
  document.getElementById("unban-btn").addEventListener("click", unbanAction);

  document.getElementById("geo-btn").addEventListener("click", onGeo);
  document.getElementById("ping-btn").addEventListener("click", onPing);
  document.getElementById("map-feed-btn").addEventListener("click", onMapFeed);

  document.getElementById("intel-btn").addEventListener("click", onIntelIp);
  document.getElementById("intel-domain-btn").addEventListener("click", onIntelDomain);
  document.getElementById("feodo-btn").addEventListener("click", onFeodo);

  document.getElementById("vuln-btn").addEventListener("click", onVuln);
  document.getElementById("cve-btn").addEventListener("click", onCves);
  document.getElementById("cert-btn").addEventListener("click", onCerts);
  document.getElementById("pwd-btn").addEventListener("click", onPwnedPassword);

  document.getElementById("ai-ask-btn").addEventListener("click", onAiAsk);
}

function boot() {
  bindEvents();
  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);
