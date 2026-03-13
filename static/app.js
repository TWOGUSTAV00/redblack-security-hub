let isAdmin = false;
let currentConversationId = null;
let aiBusy = false;
let selectedPeer = null;
let selectedGroupId = null;
let socialTimer = null;
let mediaRecorder = null;
let recordedAudioBlob = null;
let audioCtx = null;
let analyserNode = null;
let meterRaf = null;
let meterTimer = null;
let meterStart = null;
let meterStream = null;
let isRecording = false;
let recordingPaused = false;
let pendingSend = false;
let discardRecording = false;
const chatRenderState = {};
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5l11 7-11 7z"/></svg>';

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
  const titleEl = document.querySelector(".auth-title");
  if (loginForm) loginForm.classList.toggle("hidden", !showLogin);
  if (registerForm) registerForm.classList.toggle("hidden", showLogin);
  if (loginBtn) loginBtn.classList.toggle("active", showLogin);
  if (registerBtn) registerBtn.classList.toggle("active", !showLogin);
  if (titleEl) titleEl.textContent = showLogin ? "Login" : "Cadastro";
  setMessage("");
}

function showApp(user, adminFlag) {
  isAdmin = !!adminFlag;
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("app-section").classList.remove("hidden");
  document.getElementById("welcome-user").textContent = `Logado como: ${user}${isAdmin ? " (ADMIN)" : ""}`;
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });
  setTab("ai");
  loadConversations().then(loadAiHistory);
  startSocialPolling();
  if (isAdmin) loadAdmin();
}

function showAuth() {
  document.getElementById("app-section").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
  // garante que a aba inicial seja sempre Login
  switchAuthTab(true);
  if (socialTimer) { clearInterval(socialTimer); socialTimer = null; }
}

async function checkSession() {
  try {
    const me = await api("/api/auth/me", { method: "GET", headers: {} });
    if (me.authenticated) showApp(me.username, me.is_admin);
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
    showApp(data.username, data.is_admin);
  } catch (err) {
    setMessage(err.message);
  }
}

async function onLogout() {
  try { await api("/api/auth/logout", { method: "POST", headers: {} }); } catch {}
  showAuth();
}

function setTab(name) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${name}`);
  });
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
    stream.innerHTML = '<div class="message">Chat vazio. Faca sua primeira pergunta.</div>';
    return;
  }
  stream.innerHTML = items.map((m) => {
    const roleClass = m.role === "user" ? "user" : "assistant";
    return `
      <div class=\"ai-msg ${roleClass}\">
        <div class=\"ai-role\">${m.role === "user" ? "Voce" : "Nemo IA"}</div>
        <div class=\"ai-content\">${renderAiContent(m.content)}</div>
      </div>
    `;
  }).join("");
  stream.scrollTop = stream.scrollHeight;
}

function appendAiMessage(role, content, tempId = null) {
  const stream = document.getElementById("ai-chat-stream");
  if (!stream) return;
  const wrapper = document.createElement("div");
  wrapper.className = `ai-msg ${role}`;
  if (tempId) wrapper.dataset.tempId = tempId;
  wrapper.innerHTML = `
    <div class="ai-role">${role === "user" ? "Voce" : "Nemo IA"}</div>
    <div class="ai-content">${renderAiContent(content)}</div>
  `;
  stream.appendChild(wrapper);
  stream.scrollTop = stream.scrollHeight;
}

function setAiTyping(show) {
  const status = document.getElementById("ai-status");
  if (!status) return;
  status.innerHTML = show
    ? 'Nemo IA digitando<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>'
    : "";
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
    const displayText = questionRaw || (file ? "Imagem enviada" : "Pergunta enviada");
    input.value = "";
    appendAiMessage("user", displayText);
    setAiTyping(true);
    let imageText = "";
    if (file) {
      imageText = await ocrWithTimeout(file, 12000);
      imageInput.value = "";
    }

    await api("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({
        question,
        conversation_id: currentConversationId,
        image_text: imageText,
      }),
    });

    await loadConversations();
    await loadAiHistory();
  } catch (err) {
    const stream = document.getElementById("ai-chat-stream");
    if (stream) {
      stream.innerHTML += `<div class=\"message\">Erro: ${escapeHtml(err.message)}</div>`;
      stream.scrollTop = stream.scrollHeight;
    }
  } finally {
    setAiTyping(false);
    aiBusy = false;
    if (askBtn) askBtn.disabled = false;
  }
}

function renderUsers(items) {
  const list = document.getElementById("chat-users");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = "<div class=\"message\">Sem usuarios.</div>";
    return;
  }
  list.innerHTML = items.map((u) => {
    const active = selectedPeer === u.username && !selectedGroupId ? " active" : "";
    return `<button class=\"${active ? "active" : ""}\" data-peer=\"${escapeHtml(u.username)}\">${escapeHtml(u.username)} ${u.online ? "(online)" : ""}</button>`;
  }).join("");

  list.querySelectorAll("[data-peer]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedGroupId = null;
      selectedPeer = btn.dataset.peer;
      document.getElementById("chat-title").textContent = `Chat com ${selectedPeer}`;
      resetChatRenderState();
      await loadMessages(true);
      await loadTyping();
    });
  });
}

function renderGroups(items) {
  const list = document.getElementById("chat-groups");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = "<div class=\"message\">Sem grupos.</div>";
    return;
  }
  list.innerHTML = items.map((g) => {
    const active = selectedGroupId === Number(g.id) ? " active" : "";
    return `<button class=\"${active ? "active" : ""}\" data-group=\"${g.id}\">${escapeHtml(g.name)}</button>`;
  }).join("");

  list.querySelectorAll("[data-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedPeer = null;
      selectedGroupId = Number(btn.dataset.group);
      document.getElementById("chat-title").textContent = `Grupo #${selectedGroupId}`;
      resetChatRenderState();
      await loadMessages(true);
      document.getElementById("chat-typing").textContent = "";
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
  const box = document.getElementById("chat-messages");
  if (!box) return;
  if (!selectedPeer && !selectedGroupId) {
    box.innerHTML = "<div class=\"message\">Escolha um usuario ou grupo.</div>";
    return;
  }
  if (!items.length) {
    box.innerHTML = "<div class=\"message\">Sem mensagens.</div>";
    return;
  }
  box.innerHTML = items.map((m) => {
    const mine = selectedGroupId ? false : (m.sender !== selectedPeer);
    const who = selectedGroupId ? `<strong>${escapeHtml(m.sender || "")}</strong><br/>` : "";
    const text = m.message_text ? `<div>${escapeHtml(m.message_text)}</div>` : "";
    const image = m.message_type === "image" && m.file_url ? `<img src=\"${escapeHtml(m.file_url)}\" alt=\"imagem\" />` : "";
    const video = m.message_type === "video" && m.file_url ? `<video controls src=\"${escapeHtml(m.file_url)}\"></video>` : "";
    const audio = m.message_type === "audio" && m.file_url ? `
      <div class="audio-bubble" data-audio-src="${escapeHtml(m.file_url)}">
        <button class="audio-play" type="button">▶</button>
        <div class="audio-track">
          <div class="audio-progress">
            <span class="audio-progress-fill"></span>
            <span class="audio-dot"></span>
          </div>
          <div class="audio-time">0:00</div>
        </div>
      </div>
    ` : "";
    return `<div class=\"chat-msg ${mine ? "mine" : "peer"}\">${who}${text}${image}${video}${audio}</div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
  initAudioPlayers();
}

function getChatKey(items) {
  const last = items && items.length ? items[items.length - 1] : null;
  const lastId = last && last.id ? Number(last.id) : 0;
  return `${items.length}:${lastId}`;
}

function resetChatRenderState() {
  Object.keys(chatRenderState).forEach((k) => {
    delete chatRenderState[k];
  });
}

function shouldRenderChat(key, force) {
  if (force) return true;
  if (chatRenderState[key]) return false;
  return true;
}

async function loadMessages(force = false) {
  try {
    if (selectedGroupId) {
      const data = await api(`/api/chat/groups/${selectedGroupId}/messages?limit=200`, { method: "GET", headers: {} });
      const items = data.items || [];
      const key = `group:${selectedGroupId}:${getChatKey(items)}`;
      if (shouldRenderChat(key, force)) {
        chatRenderState[key] = true;
        renderMessages(items);
      }
      return;
    }
    if (!selectedPeer) return;
    const data = await api(`/api/chat/messages?with=${encodeURIComponent(selectedPeer)}&limit=200`, { method: "GET", headers: {} });
    const items = data.items || [];
    const key = `peer:${selectedPeer}:${getChatKey(items)}`;
    if (shouldRenderChat(key, force)) {
      chatRenderState[key] = true;
      renderMessages(items);
    }
  } catch {}
}

async function loadTyping() {
  if (!selectedPeer || selectedGroupId) return;
  try {
    const data = await api(`/api/chat/typing?with=${encodeURIComponent(selectedPeer)}`, { method: "GET", headers: {} });
    document.getElementById("chat-typing").textContent = data.typing ? `${selectedPeer} esta digitando...` : "";
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
    const progressEl = document.getElementById("upload-status");
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (evt) => {
      if (!progressEl) return;
      if (!evt.lengthComputable) { progressEl.textContent = "Enviando..."; return; }
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

async function onChatSend() {
  if (!selectedPeer && !selectedGroupId) return;
  const text = document.getElementById("chat-text").value.trim();
  const media = document.getElementById("chat-media")?.files?.[0];
  const audio = recordedAudioBlob;

  if (!text && !media && !audio) return;

  const fd = new FormData();
  if (text) fd.append("message", text);
  if (media) {
    if ((media.type || "").startsWith("video/")) fd.append("video", media);
    else fd.append("image", media);
  }
  if (audio) fd.append("audio", audio, audio.name || "recorded.webm");

  try {
    if (selectedGroupId) {
      await sendWithProgress(`/api/chat/groups/${selectedGroupId}/send`, fd);
    } else {
      fd.append("to", selectedPeer);
      await sendWithProgress("/api/chat/send", fd);
      await setTypingState(false);
    }
    document.getElementById("chat-text").value = "";
    if (document.getElementById("chat-media")) document.getElementById("chat-media").value = "";
    recordedAudioBlob = null;
    const statusEl = document.getElementById("upload-status");
    if (statusEl) statusEl.textContent = "";
    await loadMessages(true);
  } catch (err) {
    alert(`Erro ao enviar: ${err.message}`);
  }
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

  const draw = () => {
    analyserNode.getByteTimeDomainData(buffer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 48;
    const step = Math.floor(buffer.length / bars);
    const barW = canvas.width / bars;
    for (let i = 0; i < bars; i += 1) {
      let sum = 0;
      for (let j = 0; j < step; j += 1) sum += Math.abs(buffer[i * step + j] - 128);
      const amp = Math.min(1, sum / (step * 128));
      const h = Math.max(4, amp * canvas.height);
      const x = i * barW + 1;
      const y = (canvas.height - h) / 2;
      ctx.fillStyle = "#f3a5b5";
      ctx.fillRect(x, y, barW * 0.6, h);
    }
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
  if (audioCtx) {
    audioCtx.close().catch(() => null);
    audioCtx = null;
  }
  analyserNode = null;
}

function toggleRecordingUI(show) {
  const bar = document.getElementById("record-bar");
  const row = document.querySelector(".chat-input-row");
  if (bar) bar.classList.toggle("hidden", !show);
  if (row) row.style.display = show ? "none" : "grid";
}

async function startRecording() {
  if (isRecording) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Seu navegador nao permite gravar audio aqui.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  meterStream = stream;
  pendingSend = false;

  const chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    if (!chunks.length) {
      recordedAudioBlob = null;
      pendingSend = false;
      discardRecording = false;
      const status = document.getElementById("upload-status");
      if (status) status.textContent = "Falha ao gravar audio.";
      toggleRecordingUI(false);
      return;
    }
    const blob = new Blob(chunks, { type: "audio/webm" });
    blob.name = "audio-recorded.webm";
    if (!discardRecording) recordedAudioBlob = blob;
    stream.getTracks().forEach((t) => t.stop());
    stopMeter();
    const status = document.getElementById("upload-status");
    if (status) status.textContent = discardRecording ? "" : "Audio pronto para enviar.";
    isRecording = false;
    recordingPaused = false;
    toggleRecordingUI(false);
    if (pendingSend) {
      pendingSend = false;
      onChatSend();
    }
    discardRecording = false;
  };

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 512;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyserNode);
  startMeter();

  mediaRecorder.start(200);
  isRecording = true;
  const pauseBtn = document.getElementById("rec-pause");
  if (pauseBtn) pauseBtn.innerHTML = PAUSE_ICON;
  toggleRecordingUI(true);
}

function stopRecording() {
  if (!isRecording && (!mediaRecorder || mediaRecorder.state === "inactive")) return;
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (meterStream) {
    meterStream.getTracks().forEach((t) => t.stop());
    meterStream = null;
  }
  stopMeter();
  isRecording = false;
  toggleRecordingUI(false);
}

function pauseRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.pause();
  recordingPaused = true;
  const btn = document.getElementById("rec-pause");
  if (btn) btn.innerHTML = PLAY_ICON;
}

function resumeRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "paused") return;
  mediaRecorder.resume();
  recordingPaused = false;
  const btn = document.getElementById("rec-pause");
  if (btn) btn.innerHTML = PAUSE_ICON;
}

function cancelRecording() {
  pendingSend = false;
  discardRecording = true;
  recordedAudioBlob = null;
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (meterStream) {
    meterStream.getTracks().forEach((t) => t.stop());
    meterStream = null;
  }
  stopMeter();
  toggleRecordingUI(false);
  const status = document.getElementById("upload-status");
  if (status) status.textContent = "";
}

function sendRecording() {
  if (!isRecording) return;
  pendingSend = true;
  stopRecording();
}

function initAudioPlayers() {
  document.querySelectorAll(".audio-bubble").forEach((wrap) => {
    if (wrap.dataset.bound) return;
    wrap.dataset.bound = "1";
    const src = wrap.dataset.audioSrc;
    const btn = wrap.querySelector(".audio-play");
    const timeEl = wrap.querySelector(".audio-time");
    const fill = wrap.querySelector(".audio-progress-fill");
    const dot = wrap.querySelector(".audio-dot");
    const audio = new Audio(src);

    const update = () => {
      const dur = audio.duration || 0;
      const cur = audio.currentTime || 0;
      if (timeEl) timeEl.textContent = dur ? `${Math.floor(cur / 60)}:${String(Math.floor(cur % 60)).padStart(2, "0")}` : "0:00";
      const pct = dur ? (cur / dur) * 100 : 0;
      if (fill) fill.style.width = `${pct}%`;
      if (dot) dot.style.left = `${pct}%`;
    };

    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("ended", () => {
      if (btn) btn.textContent = "▶";
      update();
    });

    if (btn) {
      btn.addEventListener("click", () => {
        if (audio.paused) {
          audio.play().catch(() => null);
          btn.textContent = "⏸";
        } else {
          audio.pause();
          btn.textContent = "▶";
        }
      });
    }
  });
}

async function loadAdminUsers() {
  const data = await api("/api/admin/users", { method: "GET", headers: {} });
  const concise = (data.items || []).map((u) => ({
    usuario: u.username,
    criado_em: u.created_at,
    online: u.online ? "sim" : "nao",
  }));
  document.getElementById("admin-users").textContent = JSON.stringify(concise, null, 2);
}

async function loadAdminBans() {
  const data = await api("/api/admin/bans", { method: "GET", headers: {} });
  document.getElementById("admin-bans").textContent = JSON.stringify(data.items || [], null, 2);
}

async function adminBan() {
  const target_type = document.getElementById("ban-type").value;
  const target_value = document.getElementById("ban-value").value.trim();
  const reason = document.getElementById("ban-reason").value.trim();
  if (!target_value) return;
  await api("/api/admin/ban", {
    method: "POST",
    body: JSON.stringify({ target_type, target_value, reason }),
  });
  await loadAdminBans();
}

async function adminUnban() {
  const target_type = document.getElementById("ban-type").value;
  const target_value = document.getElementById("ban-value").value.trim();
  if (!target_value) return;
  await api("/api/admin/unban", {
    method: "POST",
    body: JSON.stringify({ target_type, target_value }),
  });
  await loadAdminBans();
}

async function loadAdmin() {
  await loadAdminUsers();
  await loadAdminBans();
}

function startSocialPolling() {
  if (socialTimer) clearInterval(socialTimer);
  socialTimer = setInterval(async () => {
    await loadUsers();
    await loadGroups();
    await loadMessages();
    await loadTyping();
    if (isAdmin) await loadAdminUsers();
  }, 5000);
}

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function bindEvents() {
  bind("btn-login-tab", "click", () => switchAuthTab(true));
  bind("btn-register-tab", "click", () => switchAuthTab(false));
  bind("goto-register", "click", () => switchAuthTab(false));
  bind("goto-login", "click", () => switchAuthTab(true));
  bind("register-form", "submit", onRegister);
  bind("login-form", "submit", onLogin);
  bind("logout-btn", "click", onLogout);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
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

  bind("chat-refresh-users", "click", async () => {
    await loadUsers();
    await loadGroups();
  });
  bind("group-refresh-btn", "click", loadGroups);
  bind("group-create-btn", "click", onCreateGroup);
  bind("chat-send", "click", onChatSend);
  bind("chat-media", "change", () => {
    const f = document.getElementById("chat-media")?.files?.[0];
    if (f) document.getElementById("upload-status").textContent = "Arquivo pronto: " + f.name;
  });
  bind("rec-start", "click", startRecording);
  bind("rec-pause", "click", () => {
    if (recordingPaused) resumeRecording();
    else pauseRecording();
  });
  bind("rec-cancel", "click", cancelRecording);
  bind("rec-send", "click", sendRecording);
  bind("chat-text", "input", async () => {
    if (selectedPeer && !selectedGroupId) {
      await setTypingState(true);
      setTimeout(() => setTypingState(false), 2000);
    }
  });

  

  bind("admin-refresh", "click", loadAdmin);
  bind("ban-btn", "click", adminBan);
  bind("unban-btn", "click", adminUnban);
}
function boot() {
  bindEvents();
  // força estado inicial consistente (apenas login visível)
  switchAuthTab(true);
  checkSession();
}

document.addEventListener("DOMContentLoaded", boot);
