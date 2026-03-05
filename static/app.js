let map;
let geoMarker;
let quakeLayer;
let userCoords = null;

function output(id, value) {
  document.getElementById(id).textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
  if (!res.ok) {
    throw new Error(data.error || `Falha HTTP ${res.status}`);
  }
  return data;
}

function setMessage(msg, ok = false) {
  const el = document.getElementById("auth-message");
  el.textContent = msg;
  el.style.color = ok ? "#31c48d" : "#ffd166";
}

function switchAuthTab(showLogin) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  document.getElementById("btn-login-tab").classList.toggle("active", showLogin);
  document.getElementById("btn-register-tab").classList.toggle("active", !showLogin);
  loginForm.classList.toggle("hidden", !showLogin);
  registerForm.classList.toggle("hidden", showLogin);
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

async function requestBrowserLocation() {
  const statusEl = document.getElementById("location-status");
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocalização não suportada neste navegador.";
    return;
  }

  statusEl.textContent = "Solicitando sua localização para enriquecer os módulos...";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      userCoords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };

      if (map) {
        const point = [userCoords.lat, userCoords.lon];
        map.setView(point, 6);
        if (geoMarker) geoMarker.remove();
        geoMarker = L.marker(point).addTo(map).bindPopup("Sua localização").openPopup();
      }

      try {
        const rev = await api(`/api/geo/reverse?lat=${encodeURIComponent(userCoords.lat)}&lon=${encodeURIComponent(userCoords.lon)}`, {
          method: "GET",
          headers: {},
        });
        statusEl.textContent = `Localização ativa: ${rev.city || "-"}, ${rev.state || "-"}, ${rev.country || "-"}`;
      } catch {
        statusEl.textContent = "Localização concedida, mas não foi possível resolver endereço.";
      }
    },
    (err) => {
      statusEl.textContent = `Localização não concedida (${err.message}). Algumas funções ficam sem contexto local.`;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function showDashboard(user) {
  document.getElementById("auth-card").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}`;
  initMap();
  requestBrowserLocation();
}

function showAuth() {
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-card").classList.remove("hidden");
}

async function checkSession() {
  try {
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    if (me.authenticated) {
      showDashboard(me.username);
    }
  } catch {
    showAuth();
  }
}

async function onRegister(e) {
  e.preventDefault();
  const username = document.getElementById("reg-user").value.trim();
  const password = document.getElementById("reg-pass").value;
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setMessage(data.message || "Conta criada", true);
    switchAuthTab(true);
  } catch (err) {
    setMessage(err.message);
  }
}

async function onLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setMessage("Login realizado", true);
    showDashboard(data.username);
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
  const url = document.getElementById("ping-url").value.trim();
  output("ping-output", "Executando medição...");
  try {
    const data = await api("/api/ping", {
      method: "POST",
      body: JSON.stringify({ url }),
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
      }).bindPopup(
        `<strong>${q.place || "Sem local"}</strong><br/>Magnitude: ${q.mag ?? "N/A"}<br/><a href="${q.url}" target="_blank" rel="noreferrer">Detalhes</a>`
      );
      layer.addLayer(marker);
    });

    layer.addTo(map);
    quakeLayer = layer;
  } catch (err) {
    alert(`Falha ao carregar eventos globais: ${err.message}`);
  }
}

async function onVuln() {
  const host = document.getElementById("target-host").value.trim();
  output("vuln-output", "Analisando domínio...");
  try {
    const data = await api(`/api/vuln?host=${encodeURIComponent(host)}`, { method: "GET", headers: {} });
    output("vuln-output", data);
  } catch (err) {
    output("vuln-output", `Erro: ${err.message}`);
  }
}

async function onIntel() {
  const ip = document.getElementById("intel-ip").value.trim();
  output("intel-output", "Consultando threat intel...");
  try {
    const data = await api(`/api/intel/ip?ip=${encodeURIComponent(ip)}`, { method: "GET", headers: {} });
    output("intel-output", data);
  } catch (err) {
    output("intel-output", `Erro: ${err.message}`);
  }
}

async function onFeodo() {
  const ip = document.getElementById("feodo-ip").value.trim();
  output("feodo-output", "Consultando feed...");
  try {
    const q = ip ? `?ip=${encodeURIComponent(ip)}` : "";
    const data = await api(`/api/threats/feodo${q}`, { method: "GET", headers: {} });
    output("feodo-output", data);
  } catch (err) {
    output("feodo-output", `Erro: ${err.message}`);
  }
}

async function onCves() {
  const limit = document.getElementById("cve-limit").value.trim() || "8";
  output("cve-output", "Buscando CVEs recentes...");
  try {
    const data = await api(`/api/cves/latest?limit=${encodeURIComponent(limit)}`, { method: "GET", headers: {} });
    output("cve-output", data);
  } catch (err) {
    output("cve-output", `Erro: ${err.message}`);
  }
}

async function onCerts() {
  const domain = document.getElementById("cert-domain").value.trim();
  output("cert-output", "Consultando certificados...");
  try {
    const data = await api(`/api/domain/certs?domain=${encodeURIComponent(domain)}`, { method: "GET", headers: {} });
    output("cert-output", data);
  } catch (err) {
    output("cert-output", `Erro: ${err.message}`);
  }
}

async function onPwnedPassword() {
  const password = document.getElementById("pwd-check").value;
  output("pwd-output", "Checando vazamento com k-Anonymity...");
  try {
    const data = await api("/api/password/pwned-check", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    output("pwd-output", data);
  } catch (err) {
    output("pwd-output", `Erro: ${err.message}`);
  }
}

function boot() {
  document.getElementById("btn-login-tab").addEventListener("click", () => switchAuthTab(true));
  document.getElementById("btn-register-tab").addEventListener("click", () => switchAuthTab(false));
  document.getElementById("register-form").addEventListener("submit", onRegister);
  document.getElementById("login-form").addEventListener("submit", onLogin);
  document.getElementById("logout-btn").addEventListener("click", onLogout);

  document.getElementById("geo-btn").addEventListener("click", onGeo);
  document.getElementById("ping-btn").addEventListener("click", onPing);
  document.getElementById("map-feed-btn").addEventListener("click", onMapFeed);
  document.getElementById("vuln-btn").addEventListener("click", onVuln);
  document.getElementById("intel-btn").addEventListener("click", onIntel);
  document.getElementById("feodo-btn").addEventListener("click", onFeodo);
  document.getElementById("cve-btn").addEventListener("click", onCves);
  document.getElementById("cert-btn").addEventListener("click", onCerts);
  document.getElementById("pwd-btn").addEventListener("click", onPwnedPassword);

  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);
