const storageKeys = {
  users: "rb_users",
  session: "rb_session",
};

let map;
let marker;

function readUsers() {
  const raw = localStorage.getItem(storageKeys.users);
  if (!raw) {
    const seed = [{ user: "admin", pass: "admin123" }];
    localStorage.setItem(storageKeys.users, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw);
}

function writeUsers(users) {
  localStorage.setItem(storageKeys.users, JSON.stringify(users));
}

function setMessage(msg, ok = false) {
  const el = document.getElementById("auth-message");
  el.textContent = msg;
  el.style.color = ok ? "#31c48d" : "#ffd166";
}

function switchAuthTab(showLogin) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("btn-login-tab");
  const registerTab = document.getElementById("btn-register-tab");

  loginForm.classList.toggle("hidden", !showLogin);
  registerForm.classList.toggle("hidden", showLogin);
  loginTab.classList.toggle("active", showLogin);
  registerTab.classList.toggle("active", !showLogin);
  setMessage("");
}

function showDashboard(user) {
  document.getElementById("auth-card").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}`;
  if (!map) initMap();
}

function showAuth() {
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-card").classList.remove("hidden");
}

function normalizeUrl(input) {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function parseHost(host) {
  const cleaned = host.trim().toLowerCase();
  if (!cleaned) return "";
  return cleaned.replace(/^https?:\/\//, "").replace(/\/.*/, "");
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([15, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
}

function updateMap(lat, lon, label) {
  if (!map) return;
  const point = [Number(lat), Number(lon)];
  map.setView(point, 6);
  if (marker) marker.remove();
  marker = L.marker(point).addTo(map).bindPopup(label).openPopup();
}

async function getGeoInfo() {
  const out = document.getElementById("geo-output");
  out.textContent = "Consultando geolocalização...";
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error(`Falha HTTP ${res.status}`);
    const data = await res.json();

    const formatted = {
      ip: data.ip,
      cidade: data.city,
      regiao: data.region,
      pais: data.country_name,
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      org: data.org,
    };

    out.textContent = JSON.stringify(formatted, null, 2);

    if (data.latitude && data.longitude) {
      updateMap(data.latitude, data.longitude, `${data.city || "Local"} (${data.ip || "IP"})`);
    }
  } catch (err) {
    out.textContent = `Erro ao consultar geolocalização: ${err.message}`;
  }
}

async function runPing() {
  const out = document.getElementById("ping-output");
  const input = document.getElementById("ping-url");
  const target = normalizeUrl(input.value);

  if (!target) {
    out.textContent = "Informe uma URL válida.";
    return;
  }

  out.textContent = `Testando latência para ${target}...`;

  const results = [];
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    try {
      await fetch(target, { method: "GET", mode: "no-cors", cache: "no-store" });
      const elapsed = performance.now() - start;
      results.push(elapsed);
    } catch {
      results.push(null);
    }
  }

  const valid = results.filter((v) => typeof v === "number");
  if (!valid.length) {
    out.textContent = "Não foi possível medir a latência. Verifique CORS/rede/URL.";
    return;
  }

  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const lines = results.map((v, i) => `Tentativa ${i + 1}: ${v ? `${v.toFixed(2)} ms` : "falhou"}`);
  lines.push(`Média aproximada: ${avg.toFixed(2)} ms`);
  out.textContent = lines.join("\n");
}

async function runVulnerabilityCheck() {
  const out = document.getElementById("vuln-output");
  const input = document.getElementById("target-host");
  const host = parseHost(input.value);

  if (!host) {
    out.textContent = "Informe um domínio (ex.: example.com).";
    return;
  }

  out.textContent = `Iniciando análise de ${host}...`;

  try {
    const url = `https://http-observatory.security.mozilla.org/api/v1/analyze?host=${encodeURIComponent(host)}&rescan=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha HTTP ${res.status}`);
    const data = await res.json();

    const summary = {
      host: data.host,
      grade: data.grade,
      score: data.score,
      status: data.status,
      scanned_at: data.end_time,
      tests_failed: data.tests_failed,
      tests_passed: data.tests_passed,
      recommendation: "Revise os headers de segurança e TLS para elevar a nota.",
    };

    out.textContent = JSON.stringify(summary, null, 2);
  } catch (err) {
    out.textContent = `Erro na análise: ${err.message}\nDica: alguns serviços podem limitar requisições diretas do navegador.`;
  }
}

function boot() {
  document.getElementById("btn-login-tab").addEventListener("click", () => switchAuthTab(true));
  document.getElementById("btn-register-tab").addEventListener("click", () => switchAuthTab(false));

  document.getElementById("register-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("reg-user").value.trim();
    const pass = document.getElementById("reg-pass").value;
    const users = readUsers();

    if (users.some((u) => u.user.toLowerCase() === user.toLowerCase())) {
      setMessage("Usuário já existe.");
      return;
    }

    users.push({ user, pass });
    writeUsers(users);
    setMessage("Conta criada. Faça login.", true);
    switchAuthTab(true);
  });

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("login-user").value.trim();
    const pass = document.getElementById("login-pass").value;
    const users = readUsers();
    const found = users.find((u) => u.user === user && u.pass === pass);

    if (!found) {
      setMessage("Credenciais inválidas.");
      return;
    }

    localStorage.setItem(storageKeys.session, user);
    setMessage("Login realizado.", true);
    showDashboard(user);
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem(storageKeys.session);
    showAuth();
  });

  document.getElementById("geo-btn").addEventListener("click", getGeoInfo);
  document.getElementById("ping-btn").addEventListener("click", runPing);
  document.getElementById("vuln-btn").addEventListener("click", runVulnerabilityCheck);

  const session = localStorage.getItem(storageKeys.session);
  if (session) {
    showDashboard(session);
  }
}

document.addEventListener("DOMContentLoaded", boot);
