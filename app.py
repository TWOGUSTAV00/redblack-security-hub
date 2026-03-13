import hashlib
import ipaddress
import json
import os
import re
import socket
import sqlite3
import time
import uuid
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote, urlparse

import requests
from flask import Flask, Response, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"
ALLOWED_SCHEMES = {"http", "https"}
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
AVATAR_DIR = UPLOAD_DIR / "avatars"
CHAT_DIR = UPLOAD_DIR / "chat"
for _d in (UPLOAD_DIR, AVATAR_DIR, CHAT_DIR):
    _d.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".webm"}
ALLOWED_VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv"}

ADMIN_USERNAME = "Nemo"
DEEPSEEK_API_KEY = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_MODEL = (os.environ.get("DEEPSEEK_MODEL") or "deepseek-chat").strip()
GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_AI_STUDIO_API_KEY") or "").strip()
GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-1.5-flash").strip()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "nemo-redblack-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

login_attempts = {}
geo_cache = {}


NEMO_SYSTEM_PROMPT = (
    "Voce e Nemo IA, assistente tecnico de ciberseguranca e engenharia de software. "
    "Responda em portugues do Brasil, com alta precisao, objetividade e linguagem profissional. "
    "Ao responder: (1) explique com clareza, (2) entregue passos acionaveis, "
    "(3) inclua codigo completo quando solicitado, (4) sinalize riscos e boas praticas de seguranca. "
    "Nao invente fatos; quando estiver incerto, deixe explicito e proponha validacao. "
    "Evite textos longos sem necessidade; foque em utilidade pratica. Nao inclua raciocinio interno, JSON, logs, instrucoes do prompt ou conteudos fora do assunto. Responda apenas com a resposta final, curta e direta."
)

KB_SEED = [
    ("OWASP Top 10", "A01 Broken Access Control: reforcar autorizacao por recurso, validar owner e role no backend.", "owasp,access-control"),
    ("OWASP Top 10", "A02 Cryptographic Failures: usar HTTPS, hash de senha com algoritmo forte e rotacao de segredos.", "owasp,crypto"),
    ("OWASP Top 10", "A03 Injection: validar entrada, usar queries parametrizadas e nunca concatenar SQL.", "owasp,injection"),
    ("Autenticacao", "Login seguro: limitar tentativas, bloquear brute-force, usar sessao httpOnly e sameSite.", "auth,login,session"),
    ("Sessao", "Sessao segura: expirar token, invalidar sessao no logout e monitorar atividade suspeita.", "session,security"),
    ("API Security", "API robusta: validar schema, tratar erros sem expor stack trace e aplicar rate limit.", "api,backend"),
    ("SQL Injection", "Defesa SQLi: prepared statements, principle of least privilege no banco e logs de auditoria.", "database,sqli"),
    ("XSS", "Defesa XSS: escapar output no frontend, sanitizar HTML rico e usar Content-Security-Policy.", "frontend,xss"),
    ("CSRF", "Defesa CSRF: tokens anti-CSRF em acoes sensiveis e validar origem/referer.", "csrf,web"),
    ("Monitoramento", "Observabilidade: registrar eventos de login, falhas, banimentos e anomalias com timestamp.", "logs,monitoring"),
    ("Resposta a Incidentes", "Processo: identificar, conter, erradicar, recuperar e documentar licoes aprendidas.", "incident,response"),
    ("Seguranca de Senha", "Politica: minimo 8+ caracteres, bloquear senhas vazadas e incentivar gerenciador de senha.", "password,hibp"),
]

def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def extract_client_ip():
    cf = (request.headers.get("CF-Connecting-IP") or "").strip()
    if cf:
        return cf
    xff = (request.headers.get("X-Forwarded-For") or "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return (request.remote_addr or "unknown").strip()


def valid_ip(value):
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def lookup_geo_by_ip(ip):
    if not valid_ip(ip):
        return {}
    if ip in geo_cache:
        return geo_cache[ip]

    try:
        r = requests.get(f"https://ipwho.is/{ip}", timeout=10)
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            return {}
        out = {
            "city": data.get("city"),
            "region": data.get("region"),
            "country": data.get("country"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
        }
        geo_cache[ip] = out
        return out
    except requests.RequestException:
        return {}


def ensure_users_schema(conn):
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "is_banned" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0")
    if "avatar_path" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN avatar_path TEXT")


def ensure_knowledge_base_seed(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    row = conn.execute("SELECT COUNT(*) AS c FROM ai_knowledge_base").fetchone()
    if int(row["c"] or 0) == 0:
        conn.executemany(
            "INSERT INTO ai_knowledge_base (title, content, tags) VALUES (?, ?, ?)",
            KB_SEED,
        )


def init_db():
    conn = db_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_banned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    ensure_users_schema(conn)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            username TEXT,
            ip TEXT,
            user_agent TEXT,
            city TEXT,
            region TEXT,
            country TEXT,
            latitude REAL,
            longitude REAL,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT NOT NULL,
            target_value TEXT NOT NULL,
            reason TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(target_type, target_value)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT 'Novo Chat',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            conversation_id INTEGER,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cols_ai = {row["name"] for row in conn.execute("PRAGMA table_info(ai_messages)").fetchall()}
    if "conversation_id" not in cols_ai:
        conn.execute("ALTER TABLE ai_messages ADD COLUMN conversation_id INTEGER")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS active_sessions (
            username TEXT PRIMARY KEY,
            last_seen INTEGER NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message_type TEXT NOT NULL,
            message_text TEXT,
            file_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_group_members (
            group_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, username)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_group_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            message_type TEXT NOT NULL,
            message_text TEXT,
            file_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_typing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            change_type TEXT NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_likes (
            post_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, username)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    ensure_knowledge_base_seed(conn)
    conn.commit()

    admin_pass = "gustavo270998"
    row = conn.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
    if row:
        conn.execute(
            "UPDATE users SET password_hash = ?, is_banned = 0 WHERE username = ?",
            (generate_password_hash(admin_pass), ADMIN_USERNAME),
        )
    else:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_banned) VALUES (?, ?, 0)",
            (ADMIN_USERNAME, generate_password_hash(admin_pass)),
        )

    conn.commit()
    conn.close()


def record_user_change(username, change_type, details=None):
    conn = db_conn()
    conn.execute(
        "INSERT INTO user_changes (username, change_type, details) VALUES (?, ?, ?)",
        (username, change_type, details),
    )
    conn.commit()
    conn.close()

def record_access(event_type, username=None, details=None):
    ip = extract_client_ip()
    geo = lookup_geo_by_ip(ip)
    conn = db_conn()
    conn.execute(
        """
        INSERT INTO access_logs (event_type, username, ip, user_agent, city, region, country, latitude, longitude, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_type,
            username,
            ip,
            (request.headers.get("User-Agent") or "")[:400],
            geo.get("city"),
            geo.get("region"),
            geo.get("country"),
            geo.get("latitude"),
            geo.get("longitude"),
            details,
        ),
    )
    conn.commit()
    conn.close()


def save_ai_message(username, conversation_id, role, content, source=None, metadata=None):
    conn = db_conn()
    conn.execute(
        "INSERT INTO ai_messages (username, conversation_id, role, content, source, metadata) VALUES (?, ?, ?, ?, ?, ?)",
        (username, conversation_id, role, content[:5000], source, metadata),
    )
    conn.execute(
        "UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND username=?",
        (conversation_id, username),
    )
    conn.commit()
    conn.close()


def create_ai_conversation(username, title="Novo Chat"):
    conn = db_conn()
    cur = conn.execute(
        "INSERT INTO ai_conversations (username, title) VALUES (?, ?)",
        (username, (title or "Novo Chat")[:120]),
    )
    conv_id = cur.lastrowid
    conn.commit()
    conn.close()
    return conv_id


def conversation_exists(username, conversation_id):
    conn = db_conn()
    row = conn.execute(
        "SELECT id FROM ai_conversations WHERE id=? AND username=?",
        (conversation_id, username),
    ).fetchone()
    conn.close()
    return bool(row)


def get_latest_conversation_id(username):
    conn = db_conn()
    row = conn.execute(
        "SELECT id FROM ai_conversations WHERE username=? ORDER BY updated_at DESC, id DESC LIMIT 1",
        (username,),
    ).fetchone()
    conn.close()
    return row["id"] if row else None

def fetch_conversation_memory(username, conversation_id, limit=10):
    conn = db_conn()
    rows = conn.execute(
        """
        SELECT role, content
        FROM ai_messages
        WHERE username = ? AND conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (username, conversation_id, limit),
    ).fetchall()
    conn.close()
    if not rows:
        return "Sem memoria previa."

    ordered = list(reversed(rows))
    lines = []
    for r in ordered:
        role = "Usuario" if r["role"] == "user" else "Nemo IA"
        lines.append(f"{role}: {compact_text(r['content'], 320)}")
    return "\n".join(lines)


def retrieve_kb_context(question, limit=4):
    tokens = [t for t in re.findall(r"[a-zA-Z0-9_+-]+", (question or "").lower()) if len(t) >= 3]
    if not tokens:
        return "Sem contexto de base de conhecimento."

    conn = db_conn()
    rows = conn.execute("SELECT title, content, tags FROM ai_knowledge_base ORDER BY id DESC").fetchall()
    conn.close()

    ranked = []
    for r in rows:
        hay = f"{r['title']} {r['content']} {r['tags'] or ''}".lower()
        score = sum(1 for tok in tokens if tok in hay)
        if score > 0:
            ranked.append((score, r))

    if not ranked:
        return "Sem contexto de base de conhecimento."

    ranked.sort(key=lambda x: x[0], reverse=True)
    top = [item[1] for item in ranked[:limit]]
    return "\n".join([f"- {r['title']}: {compact_text(r['content'], 240)}" for r in top])


def compact_text(text, limit):
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(0, limit - 3)] + "..."

def strip_reasoning(text):
    s = (text or "").strip()
    if not s:
        return ""
    if s.startswith("{") and "\"content\"" in s:
        try:
            obj = json.loads(s)
            if isinstance(obj, dict) and "content" in obj:
                s = str(obj.get("content") or "").strip()
        except json.JSONDecodeError:
            m = re.search(r"\"content\"\s*:\s*\"(.*?)\"\s*(,\s*\"tool_calls\"|,\s*\"role\"|}\s*$)", s, flags=re.S)
            if m:
                try:
                    s = bytes(m.group(1), "utf-8").decode("unicode_escape").strip()
                except Exception:
                    s = m.group(1).strip()
    if s.startswith("{") and "reasoning_content" in s:
        m = re.search(r"\"content\"\s*:\s*\"(.*?)\"", s, flags=re.S)
        if m:
            s = m.group(1).strip()
    return s


def wants_image_generation(question):
    q = (question or "").lower()
    has_image_term = any(word in q for word in ["imagem", "foto", "ilustracao", "arte", "logo", "wallpaper"])
    has_generate_term = any(word in q for word in ["gere", "gerar", "crie", "criar", "faca", "faca", "produza", "desenhe"])
    return has_image_term and has_generate_term


def wants_spreadsheet_request(question):
    q = (question or "").lower()
    planilha_terms = ["planilha", "csv", "excel", "google sheets", "tabela", "coluna", "linhas", "listagem", "organize", "organizar"]
    action_terms = ["crie", "criar", "monte", "gerar", "gere", "organize", "organizar", "liste", "listagem"]
    return any(t in q for t in planilha_terms) and any(a in q for a in action_terms)


def spreadsheet_output_rules():
    return (
        "Se a tarefa for planilha/listagem, responda no formato estrito abaixo, sem markdown.\n"
        "1) TITULO: uma linha curta.\n"
        "2) CSV: bloco com cabecalho e linhas separadas por virgula.\n"
        "3) PASSOS: lista numerada curta (max 5).\n"
        "Regras: nao usar **, ##, bullets markdown ou texto redundante."
    )


def cleanup_spreadsheet_answer(text):
    cleaned = text or ""
    for token in ["**", "##", "```", "`"]:
        cleaned = cleaned.replace(token, "")
    cleaned = cleaned.replace("- ", "")
    return cleaned.strip()


def build_generated_image_url(question):
    prompt = compact_text(question, 220)
    return f"{request.url_root.rstrip('/')}/api/ai/generated-image?prompt={quote(prompt)}"


def build_local_answer(question, image_text, context_web):
    if context_web and context_web != "Sem contexto web adicional.":
        cleaned = context_web.replace("Resumo web: ", "").replace("Topico relacionado: ", "")
        return compact_text(cleaned, 900)
    if image_text:
        return "Texto da imagem: " + compact_text(image_text, 600)
    return "Nao consegui acessar a IA agora. Tente novamente."


def query_pollinations(prompt):
    # O endpoint recebe prompt na URL; manter curto evita falha por URL longa.
    safe_prompt = compact_text(prompt, 1400)
    url = f"https://text.pollinations.ai/{quote(safe_prompt)}"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    return (resp.text or "").strip()


def query_gemini(prompt, system_prompt=None):
    if not GEMINI_API_KEY:
        return ""
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": compact_text(prompt, 5000)}],
            }
        ],
    }
    if system_prompt:
        payload["systemInstruction"] = {
            "parts": [{"text": compact_text(system_prompt, 2000)}],
        }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    resp = requests.post(url, params={"key": GEMINI_API_KEY}, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [p.get("text") for p in parts if p.get("text")]
    return "\n".join(texts).strip()


def query_deepseek(prompt, system_prompt=None):
    if not DEEPSEEK_API_KEY:
        return ""
    payload = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0.2,
        "max_tokens": 900,
        "messages": [
            {
                "role": "system",
                "content": system_prompt or NEMO_SYSTEM_PROMPT,
            },
            {"role": "user", "content": compact_text(prompt, 5000)},
        ],
    }
    resp = requests.post(
        "https://api.deepseek.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return (msg.get("content") or "").strip()


def set_user_active(username):
    now_ts = int(time.time())
    conn = db_conn()
    conn.execute(
        "INSERT INTO active_sessions (username, last_seen) VALUES (?, ?) "
        "ON CONFLICT(username) DO UPDATE SET last_seen=excluded.last_seen",
        (username, now_ts),
    )
    conn.commit()
    conn.close()


def clear_user_active(username):
    conn = db_conn()
    conn.execute("DELETE FROM active_sessions WHERE username = ?", (username,))
    conn.commit()
    conn.close()


def get_online_users():
    threshold = int(time.time()) - 90
    conn = db_conn()
    rows = conn.execute(
        "SELECT username, last_seen FROM active_sessions WHERE last_seen >= ? ORDER BY username",
        (threshold,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def to_public_file_url(abs_path):
    try:
        rel = Path(abs_path).resolve().relative_to((BASE_DIR / "static").resolve())
    except Exception:
        return None
    return f"/static/{str(rel).replace('\\', '/')}"


def save_uploaded_file(file_obj, target_dir, allowed_exts):
    if not file_obj or not file_obj.filename:
        return None
    filename = secure_filename(file_obj.filename)
    ext = Path(filename).suffix.lower()
    if ext not in allowed_exts:
        return None
    final_name = f"{uuid.uuid4().hex}{ext}"
    full = target_dir / final_name
    file_obj.save(str(full))
    return str(full)

def current_user():
    return session.get("username")


def is_admin(user):
    return user == ADMIN_USERNAME


def is_banned_ip(ip):
    if not ip:
        return False
    conn = db_conn()
    row = conn.execute(
        "SELECT 1 FROM bans WHERE target_type='ip' AND target_value=?", (ip,)
    ).fetchone()
    conn.close()
    return bool(row)


def is_banned_user(username):
    if not username:
        return False
    conn = db_conn()
    row = conn.execute("SELECT is_banned FROM users WHERE username=?", (username,)).fetchone()
    extra = conn.execute(
        "SELECT 1 FROM bans WHERE target_type='username' AND target_value=?", (username,)
    ).fetchone()
    conn.close()
    return bool((row and row["is_banned"]) or extra)


def require_auth():
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Nao autenticado"}), 401)
    if is_banned_user(user):
        session.clear()
        return None, (jsonify({"error": "Usuario banido"}), 403)
    return user, None


def require_admin():
    user, err = require_auth()
    if err:
        return None, err
    if not is_admin(user):
        return None, (jsonify({"error": "Acesso restrito ao administrador"}), 403)
    return user, None


def valid_username(name):
    return bool(re.fullmatch(r"[A-Za-z0-9_\-.]{3,32}", name or ""))


def valid_password(password):
    return isinstance(password, str) and len(password) >= 8


def normalize_url(url):
    raw = (url or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ALLOWED_SCHEMES or not parsed.netloc:
        return None
    return raw


def valid_domain(host):
    return bool(re.fullmatch(r"[a-z0-9.-]{3,255}", host or ""))


@app.after_request
def secure_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/")
def home():
    record_access("visit", current_user() or "guest")
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/auth/me")
def auth_me():
    user = current_user()
    return jsonify({"authenticated": bool(user), "username": user, "is_admin": is_admin(user)})


@app.post("/api/auth/register")
def auth_register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not valid_username(username):
        return jsonify({"error": "Usuario invalido. Use 3-32 chars: letras, numeros, _.-"}), 400
    if not valid_password(password):
        return jsonify({"error": "Senha invalida. Minimo 8 caracteres."}), 400

    if is_banned_user(username):
        return jsonify({"error": "Usuario bloqueado pelo administrador"}), 403

    conn = db_conn()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_banned) VALUES (?, ?, 0)",
            (username, generate_password_hash(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Usuario ja existe"}), 409

    conn.close()
    record_access("register", username)
    record_user_change(username, "register", f"ip={extract_client_ip()}")
    return jsonify({"ok": True, "message": "Conta criada"})


@app.post("/api/auth/login")
def auth_login():
    ip = extract_client_ip()
    now = time.time()
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if is_banned_ip(ip):
        record_access("login_blocked", username or "unknown", "ip_banned")
        return jsonify({"error": "IP banido pelo administrador"}), 403

    tries = [t for t in login_attempts.get(ip, []) if now - t < 300]
    login_attempts[ip] = tries
    if len(tries) >= 10:
        record_access("login_blocked", username or "unknown", "rate_limited")
        return jsonify({"error": "Muitas tentativas. Aguarde 5 minutos."}), 429

    conn = db_conn()
    row = conn.execute(
        "SELECT username, password_hash, is_banned FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        login_attempts[ip].append(now)
        record_access("login_failed", username or "unknown", "invalid_credentials")
        return jsonify({"error": "Credenciais invalidas"}), 401

    if row["is_banned"] or is_banned_user(username):
        record_access("login_blocked", username, "user_banned")
        return jsonify({"error": "Usuario banido pelo administrador"}), 403

    session.clear()
    session["username"] = row["username"]
    set_user_active(row["username"])
    record_access("login_success", row["username"])
    return jsonify({"ok": True, "username": row["username"], "is_admin": is_admin(row["username"])})


@app.post("/api/auth/logout")
def auth_logout():
    user = current_user() or "unknown"
    if user != "unknown":
        clear_user_active(user)
    record_access("logout", user)
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/auth/ping")
def auth_ping():
    user, err = require_auth()
    if err:
        return err
    set_user_active(user)
    return jsonify({"ok": True})


@app.get("/api/profile")
def profile_get():
    user, err = require_auth()
    if err:
        return err

    conn = db_conn()
    row = conn.execute("SELECT username, avatar_path FROM users WHERE username = ?", (user,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Usuario nao encontrado"}), 404
    avatar_url = to_public_file_url(row["avatar_path"]) if row["avatar_path"] else None
    return jsonify({"username": row["username"], "avatar_url": avatar_url})


@app.post("/api/profile/rename")
def profile_rename():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    new_username = (data.get("new_username") or "").strip()
    password = data.get("password") or ""

    if not valid_username(new_username):
        return jsonify({"error": "Novo nome invalido"}), 400
    if new_username == user:
        return jsonify({"ok": True, "username": user})

    conn = db_conn()
    row = conn.execute("SELECT password_hash FROM users WHERE username = ?", (user,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        conn.close()
        return jsonify({"error": "Senha incorreta"}), 401

    exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (new_username,)).fetchone()
    if exists:
        conn.close()
        return jsonify({"error": "Nome de usuario ja em uso"}), 409

    conn.execute("UPDATE users SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE access_logs SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE ai_conversations SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE ai_messages SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE active_sessions SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE chat_messages SET sender = ? WHERE sender = ?", (new_username, user))
    conn.execute("UPDATE chat_messages SET receiver = ? WHERE receiver = ?", (new_username, user))
    conn.execute("UPDATE chat_groups SET created_by = ? WHERE created_by = ?", (new_username, user))
    conn.execute("UPDATE chat_group_members SET username = ? WHERE username = ?", (new_username, user))
    conn.execute("UPDATE chat_group_messages SET sender = ? WHERE sender = ?", (new_username, user))
    conn.execute("UPDATE chat_typing SET sender = ? WHERE sender = ?", (new_username, user))
    conn.execute("UPDATE chat_typing SET receiver = ? WHERE receiver = ?", (new_username, user))
    conn.commit()
    conn.close()

    session["username"] = new_username
    record_access("profile_rename", new_username, f"old={user}")
    record_user_change(new_username, "profile_rename", f"old={user}")
    return jsonify({"ok": True, "username": new_username})


@app.post("/api/profile/avatar")
def profile_avatar():
    user, err = require_auth()
    if err:
        return err

    uploaded = request.files.get("avatar")
    file_path = save_uploaded_file(uploaded, AVATAR_DIR, ALLOWED_IMAGE_EXT)
    if not file_path:
        return jsonify({"error": "Arquivo de avatar invalido"}), 400

    conn = db_conn()
    conn.execute("UPDATE users SET avatar_path = ? WHERE username = ?", (file_path, user))
    conn.commit()
    conn.close()

    record_user_change(user, "profile_avatar", f"file={Path(file_path).name}")
    return jsonify({"ok": True, "avatar_url": to_public_file_url(file_path)})


@app.get("/api/users")
def users_list():
    user, err = require_auth()
    if err:
        return err

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT username, avatar_path,
               COALESCE((SELECT last_seen FROM active_sessions a WHERE a.username = u.username), 0) AS last_seen
        FROM users u
        WHERE username <> ?
        ORDER BY username
        """
        , (user,),
    ).fetchall()
    conn.close()

    threshold = int(time.time()) - 90
    items = []
    for r in rows:
        items.append({
            "username": r["username"],
            "avatar_url": to_public_file_url(r["avatar_path"]) if r["avatar_path"] else None,
            "online": int(r["last_seen"] or 0) >= threshold,
        })
    return jsonify({"count": len(items), "items": items})


@app.get("/api/admin/users")
def admin_users():
    user, err = require_admin()
    if err:
        return err
    conn = db_conn()
    rows = conn.execute(
        """
        SELECT username, avatar_path, created_at,
               COALESCE((SELECT last_seen FROM active_sessions a WHERE a.username = u.username), 0) AS last_seen
        FROM users u
        ORDER BY created_at DESC
        """
    ).fetchall()
    conn.close()

    threshold = int(time.time()) - 90
    items = []
    for r in rows:
        items.append(
            {
                "username": r["username"],
                "created_at": r["created_at"],
                "avatar_url": to_public_file_url(r["avatar_path"]) if r["avatar_path"] else None,
                "online": int(r["last_seen"] or 0) >= threshold,
            }
        )
    return jsonify({"count": len(items), "items": items})


@app.get("/api/admin/changes")
def admin_changes():
    user, err = require_admin()
    if err:
        return err
    try:
        limit = max(20, min(300, int(request.args.get("limit", "80"))))
    except ValueError:
        limit = 80
    conn = db_conn()
    rows = conn.execute(
        """
        SELECT username, change_type, details, created_at
        FROM user_changes
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return jsonify({"items": [dict(r) for r in rows]})


@app.get("/api/chat/messages")
def chat_messages_list():
    user, err = require_auth()
    if err:
        return err

    peer = (request.args.get("with") or "").strip()
    if not valid_username(peer):
        return jsonify({"error": "Usuario alvo invalido"}), 400

    try:
        limit = max(20, min(300, int(request.args.get("limit", "120"))))
    except ValueError:
        limit = 120

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT id, sender, receiver, message_type, message_text, file_path, created_at
        FROM chat_messages
        WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
        ORDER BY id DESC
        LIMIT ?
        """
        , (user, peer, peer, user, limit),
    ).fetchall()
    conn.close()

    items = []
    for r in reversed(rows):
        item = dict(r)
        item["file_url"] = to_public_file_url(item.get("file_path")) if item.get("file_path") else None
        items.append(item)
    return jsonify({"count": len(items), "items": items})





@app.post("/api/chat/send")
def chat_send():
    user, err = require_auth()
    if err:
        return err

    to_user = (request.form.get("to") or "").strip()
    if not valid_username(to_user) or to_user == user:
        return jsonify({"error": "Destino invalido"}), 400

    message_text = (request.form.get("message") or "").strip()
    image = request.files.get("image")
    video = request.files.get("video")
    audio = request.files.get("audio")

    message_type = "text"
    file_path = None
    if image and image.filename:
        file_path = save_uploaded_file(image, CHAT_DIR, ALLOWED_IMAGE_EXT)
        if not file_path:
            return jsonify({"error": "Imagem invalida"}), 400
        message_type = "image"
    elif video and video.filename:
        file_path = save_uploaded_file(video, CHAT_DIR, ALLOWED_VIDEO_EXT)
        if not file_path:
            return jsonify({"error": "Video invalido"}), 400
        message_type = "video"
    elif audio and audio.filename:
        file_path = save_uploaded_file(audio, CHAT_DIR, ALLOWED_AUDIO_EXT)
        if not file_path:
            return jsonify({"error": "Audio invalido"}), 400
        message_type = "audio"

    if not message_text and not file_path:
        return jsonify({"error": "Mensagem vazia"}), 400

    conn = db_conn()
    conn.execute(
        "INSERT INTO chat_messages (sender, receiver, message_type, message_text, file_path) VALUES (?, ?, ?, ?, ?)",
        (user, to_user, message_type, message_text[:4000], file_path),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


@app.delete("/api/chat/messages")
def chat_messages_delete_conversation():
    user, err = require_auth()
    if err:
        return err

    peer = (request.args.get("with") or "").strip()
    if not valid_username(peer):
        return jsonify({"error": "Usuario alvo invalido"}), 400

    conn = db_conn()
    conn.execute(
        "DELETE FROM chat_messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)",
        (user, peer, peer, user),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.get("/api/chat/groups")
def chat_groups_list():
    user, err = require_auth()
    if err:
        return err

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT g.id, g.name, g.created_by, g.created_at
        FROM chat_groups g
        JOIN chat_group_members m ON m.group_id = g.id
        WHERE m.username = ?
        ORDER BY g.id DESC
        """
        , (user,),
    ).fetchall()
    conn.close()
    return jsonify({"count": len(rows), "items": [dict(r) for r in rows]})


@app.post("/api/chat/groups")
def chat_group_create():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if len(name) < 3:
        return jsonify({"error": "Nome do grupo muito curto"}), 400

    members = data.get("members") or []
    valid_members = []
    for m in members:
        mname = (str(m) or "").strip()
        if valid_username(mname) and mname != user:
            valid_members.append(mname)

    conn = db_conn()
    cur = conn.execute("INSERT INTO chat_groups (name, created_by) VALUES (?, ?)", (name[:80], user))
    gid = cur.lastrowid
    conn.execute(
        "INSERT INTO chat_group_members (group_id, username, is_admin) VALUES (?, ?, 1)",
        (gid, user),
    )
    for m in set(valid_members):
        conn.execute(
            "INSERT OR IGNORE INTO chat_group_members (group_id, username, is_admin) VALUES (?, ?, 0)",
            (gid, m),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "group_id": gid})


@app.post("/api/chat/groups/<int:group_id>/members")
def chat_group_add_members(group_id):
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    members = data.get("members") or []

    conn = db_conn()
    admin_row = conn.execute(
        "SELECT 1 FROM chat_group_members WHERE group_id = ? AND username = ? AND is_admin = 1",
        (group_id, user),
    ).fetchone()
    if not admin_row:
        conn.close()
        return jsonify({"error": "Apenas admin do grupo pode adicionar membros"}), 403

    added = 0
    for m in members:
        mname = (str(m) or "").strip()
        if not valid_username(mname):
            continue
        conn.execute(
            "INSERT OR IGNORE INTO chat_group_members (group_id, username, is_admin) VALUES (?, ?, 0)",
            (group_id, mname),
        )
        added += 1
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "added": added})


@app.get("/api/chat/groups/<int:group_id>/messages")
def chat_group_messages_list(group_id):
    user, err = require_auth()
    if err:
        return err

    try:
        limit = max(20, min(300, int(request.args.get("limit", "120"))))
    except ValueError:
        limit = 120

    conn = db_conn()
    member = conn.execute(
        "SELECT 1 FROM chat_group_members WHERE group_id = ? AND username = ?",
        (group_id, user),
    ).fetchone()
    if not member:
        conn.close()
        return jsonify({"error": "Voce nao participa deste grupo"}), 403

    rows = conn.execute(
        """
        SELECT id, group_id, sender, message_type, message_text, file_path, created_at
        FROM chat_group_messages
        WHERE group_id = ?
        ORDER BY id DESC
        LIMIT ?
        """
        , (group_id, limit),
    ).fetchall()
    conn.close()

    items = []
    for r in reversed(rows):
        item = dict(r)
        item["file_url"] = to_public_file_url(item.get("file_path")) if item.get("file_path") else None
        items.append(item)
    return jsonify({"count": len(items), "items": items})





@app.post("/api/chat/groups/<int:group_id>/send")
def chat_group_send(group_id):
    user, err = require_auth()
    if err:
        return err

    message_text = (request.form.get("message") or "").strip()
    image = request.files.get("image")
    video = request.files.get("video")
    audio = request.files.get("audio")

    conn = db_conn()
    member = conn.execute(
        "SELECT 1 FROM chat_group_members WHERE group_id = ? AND username = ?",
        (group_id, user),
    ).fetchone()
    if not member:
        conn.close()
        return jsonify({"error": "Voce nao participa deste grupo"}), 403

    message_type = "text"
    file_path = None
    if image and image.filename:
        file_path = save_uploaded_file(image, CHAT_DIR, ALLOWED_IMAGE_EXT)
        if not file_path:
            conn.close()
            return jsonify({"error": "Imagem invalida"}), 400
        message_type = "image"
    elif video and video.filename:
        file_path = save_uploaded_file(video, CHAT_DIR, ALLOWED_VIDEO_EXT)
        if not file_path:
            conn.close()
            return jsonify({"error": "Video invalido"}), 400
        message_type = "video"
    elif audio and audio.filename:
        file_path = save_uploaded_file(audio, CHAT_DIR, ALLOWED_AUDIO_EXT)
        if not file_path:
            conn.close()
            return jsonify({"error": "Audio invalido"}), 400
        message_type = "audio"

    if not message_text and not file_path:
        conn.close()
        return jsonify({"error": "Mensagem vazia"}), 400

    conn.execute(
        "INSERT INTO chat_group_messages (group_id, sender, message_type, message_text, file_path) VALUES (?, ?, ?, ?, ?)",
        (group_id, user, message_type, message_text[:4000], file_path),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.post("/api/chat/typing")
def chat_typing_set():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    receiver = (data.get("receiver") or "").strip()
    is_typing = bool(data.get("is_typing", True))
    if not valid_username(receiver):
        return jsonify({"error": "Destino invalido"}), 400

    conn = db_conn()
    conn.execute(
        "DELETE FROM chat_typing WHERE sender = ? AND receiver = ?",
        (user, receiver),
    )
    if is_typing:
        conn.execute(
            "INSERT INTO chat_typing (sender, receiver, expires_at) VALUES (?, ?, ?)",
            (user, receiver, int(time.time()) + 8),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.get("/api/chat/typing")
def chat_typing_get():
    user, err = require_auth()
    if err:
        return err

    peer = (request.args.get("with") or "").strip()
    if not valid_username(peer):
        return jsonify({"error": "Usuario alvo invalido"}), 400

    now = int(time.time())
    conn = db_conn()
    conn.execute("DELETE FROM chat_typing WHERE expires_at < ?", (now,))
    rows = conn.execute(
        "SELECT sender FROM chat_typing WHERE receiver = ? AND sender = ? AND expires_at >= ?",
        (user, peer, now),
    ).fetchall()
    conn.commit()
    conn.close()
    return jsonify({"typing": len(rows) > 0})


@app.get("/api/admin/audit")
def admin_audit():
    _, err = require_admin()
    if err:
        return err

    try:
        limit = max(10, min(300, int(request.args.get("limit", "80"))))
    except ValueError:
        limit = 80

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT id, event_type, username, ip, city, region, country, created_at
        FROM access_logs
        WHERE event_type IN ('visit', 'login_success')
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()

    return jsonify({"count": len(rows), "items": [dict(r) for r in rows], "online_users": get_online_users()})


@app.get("/api/admin/bans")
def admin_bans():
    _, err = require_admin()
    if err:
        return err

    conn = db_conn()
    rows = conn.execute(
        "SELECT id, target_type, target_value, reason, created_by, created_at FROM bans ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return jsonify({"count": len(rows), "items": [dict(r) for r in rows]})


@app.post("/api/admin/ban")
def admin_ban():
    admin_user, err = require_admin()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target_type = (data.get("target_type") or "").strip().lower()
    target_value = (data.get("target_value") or "").strip()
    reason = (data.get("reason") or "Sem motivo informado").strip()[:200]

    if target_type not in {"username", "ip"}:
        return jsonify({"error": "target_type deve ser username ou ip"}), 400

    if target_type == "username":
        if not valid_username(target_value):
            return jsonify({"error": "Usuario invalido"}), 400
        if target_value == ADMIN_USERNAME:
            return jsonify({"error": "Admin nao pode banir a propria conta"}), 400
        conn = db_conn()
        conn.execute("UPDATE users SET is_banned = 1 WHERE username = ?", (target_value,))
        conn.execute(
            "INSERT OR REPLACE INTO bans (target_type, target_value, reason, created_by) VALUES ('username', ?, ?, ?)",
            (target_value, reason, admin_user),
        )
        conn.commit()
        conn.close()
        record_access("admin_ban", admin_user, f"username:{target_value}")
        return jsonify({"ok": True})

    if not valid_ip(target_value):
        return jsonify({"error": "IP invalido"}), 400

    conn = db_conn()
    conn.execute(
        "INSERT OR REPLACE INTO bans (target_type, target_value, reason, created_by) VALUES ('ip', ?, ?, ?)",
        (target_value, reason, admin_user),
    )
    conn.commit()
    conn.close()
    record_access("admin_ban", admin_user, f"ip:{target_value}")
    return jsonify({"ok": True})


@app.post("/api/admin/unban")
def admin_unban():
    admin_user, err = require_admin()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target_type = (data.get("target_type") or "").strip().lower()
    target_value = (data.get("target_value") or "").strip()

    if target_type not in {"username", "ip"}:
        return jsonify({"error": "target_type deve ser username ou ip"}), 400

    conn = db_conn()
    if target_type == "username":
        conn.execute("UPDATE users SET is_banned = 0 WHERE username = ?", (target_value,))

    conn.execute(
        "DELETE FROM bans WHERE target_type = ? AND target_value = ?", (target_type, target_value)
    )
    conn.commit()
    conn.close()

    record_access("admin_unban", admin_user, f"{target_type}:{target_value}")
    return jsonify({"ok": True})


@app.get("/api/geo/ip")
def geo_ip():
    user, err = require_auth()
    if err:
        return err

    ip = request.args.get("ip", "").strip()
    endpoint = f"https://ipwho.is/{ip}" if ip else "https://ipwho.is/"

    resp = requests.get(endpoint, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success", False):
        return jsonify({"error": "Falha ao consultar geolocalizacao"}), 502

    return jsonify(
        {
            "requested_by": user,
            "ip": data.get("ip"),
            "city": data.get("city"),
            "region": data.get("region"),
            "country": data.get("country"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "timezone": (data.get("timezone") or {}).get("id"),
            "org": data.get("connection", {}).get("isp"),
        }
    )


@app.get("/api/geo/reverse")
def geo_reverse():
    _, err = require_auth()
    if err:
        return err

    lat = (request.args.get("lat") or "").strip()
    lon = (request.args.get("lon") or "").strip()
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except ValueError:
        return jsonify({"error": "Latitude/longitude invalidas"}), 400

    r = requests.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"format": "jsonv2", "lat": lat_f, "lon": lon_f},
        headers={"User-Agent": "redblack-security-hub/1.0"},
        timeout=12,
    )
    r.raise_for_status()
    data = r.json()
    addr = data.get("address", {})

    return jsonify(
        {
            "display_name": data.get("display_name"),
            "city": addr.get("city") or addr.get("town") or addr.get("village"),
            "state": addr.get("state"),
            "country": addr.get("country"),
            "postcode": addr.get("postcode"),
        }
    )


@app.get("/api/network/download-test")
def network_download_test():
    _, err = require_auth()
    if err:
        return err

    try:
        size_mb = int(request.args.get("size_mb", "5"))
    except ValueError:
        size_mb = 5
    size_mb = max(1, min(20, size_mb))

    payload = b"0" * (size_mb * 1024 * 1024)
    return Response(
        payload,
        mimetype="application/octet-stream",
        headers={"Content-Length": str(len(payload)), "Cache-Control": "no-store"},
    )


@app.post("/api/network/upload-test")
def network_upload_test():
    _, err = require_auth()
    if err:
        return err

    body = request.get_data(cache=False, as_text=False)
    return jsonify({"bytes_received": len(body)})


@app.get("/api/map/earthquakes")
def map_earthquakes():
    _, err = require_auth()
    if err:
        return err

    feed = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
    resp = requests.get(feed, timeout=12)
    resp.raise_for_status()
    data = resp.json()

    points = []
    for feature in data.get("features", [])[:160]:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [None, None])
        if len(coords) < 2 or coords[0] is None or coords[1] is None:
            continue
        points.append(
            {
                "lon": coords[0],
                "lat": coords[1],
                "place": props.get("place"),
                "mag": props.get("mag"),
                "time": props.get("time"),
                "url": props.get("url"),
            }
        )

    return jsonify({"count": len(points), "items": points})


@app.get("/api/vuln")
def vuln_scan():
    _, err = require_auth()
    if err:
        return err

    host = (request.args.get("host") or "").strip().lower()
    if not valid_domain(host):
        return jsonify({"error": "Dominio invalido"}), 400

    try:
        ip = socket.gethostbyname(host)
    except socket.gaierror:
        return jsonify({"error": "Nao foi possivel resolver o dominio"}), 400

    intel_resp = requests.get(f"https://internetdb.shodan.io/{ip}", timeout=12)
    if intel_resp.status_code == 404:
        return jsonify(
            {
                "host": host,
                "ip": ip,
                "ports": [],
                "vulns": [],
                "cpes": [],
                "tags": [],
                "risk": "Sem dados publicos na InternetDB para este IP.",
            }
        )

    intel_resp.raise_for_status()
    intel = intel_resp.json()

    open_ports = intel.get("ports", [])
    vulns = intel.get("vulns", [])
    risk = "alto" if vulns else ("medio" if len(open_ports) >= 5 else "baixo")

    return jsonify(
        {
            "host": host,
            "ip": ip,
            "ports": open_ports,
            "vulns": vulns,
            "cpes": intel.get("cpes", []),
            "tags": intel.get("tags", []),
            "risk": risk,
            "source": "Shodan InternetDB (free, no key)",
        }
    )


@app.get("/api/intel/ip")
def intel_ip():
    _, err = require_auth()
    if err:
        return err

    ip = (request.args.get("ip") or "").strip()
    if not valid_ip(ip):
        return jsonify({"error": "IP invalido"}), 400

    shodan_resp = requests.get(f"https://internetdb.shodan.io/{ip}", timeout=12)
    shodan_data = shodan_resp.json() if shodan_resp.status_code == 200 else {}

    otx_resp = requests.get(
        f"https://otx.alienvault.com/api/v1/indicators/IPv4/{ip}/general", timeout=12
    )
    otx_resp.raise_for_status()
    otx = otx_resp.json()

    pulses = ((otx.get("pulse_info") or {}).get("pulses") or [])[:8]
    pulse_names = [p.get("name") for p in pulses if p.get("name")]

    return jsonify(
        {
            "ip": ip,
            "reputation": otx.get("reputation"),
            "country": (otx.get("country_name") or ""),
            "asn": otx.get("asn"),
            "pulse_count": len((otx.get("pulse_info") or {}).get("pulses", [])),
            "pulse_names": pulse_names,
            "open_ports": shodan_data.get("ports", []),
            "known_vulns": shodan_data.get("vulns", []),
            "tags": shodan_data.get("tags", []),
        }
    )


@app.get("/api/intel/domain")
def intel_domain():
    _, err = require_auth()
    if err:
        return err

    domain = (request.args.get("domain") or "").strip().lower()
    if not valid_domain(domain):
        return jsonify({"error": "Dominio invalido"}), 400

    r = requests.get(
        f"https://otx.alienvault.com/api/v1/indicators/domain/{domain}/general", timeout=12
    )
    r.raise_for_status()
    d = r.json()

    return jsonify(
        {
            "domain": domain,
            "pulse_count": len((d.get("pulse_info") or {}).get("pulses", [])),
            "alexa": d.get("alexa"),
            "whois": d.get("whois"),
            "country": d.get("country_code"),
            "sections": d.get("sections", []),
        }
    )


@app.get("/api/threats/feodo")
def threats_feodo():
    _, err = require_auth()
    if err:
        return err

    ip = (request.args.get("ip") or "").strip()
    if ip and not valid_ip(ip):
        return jsonify({"error": "IP invalido"}), 400

    r = requests.get(
        "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json", timeout=15
    )
    r.raise_for_status()
    data = r.json()

    if ip:
        match = [x for x in data if x.get("ip_address") == ip]
        return jsonify({"ip": ip, "listed": bool(match), "matches": match[:5]})

    return jsonify({"total": len(data), "sample": data[:25]})


@app.get("/api/cves/latest")
def cves_latest():
    _, err = require_auth()
    if err:
        return err

    limit_raw = request.args.get("limit", "10")
    try:
        limit = max(1, min(30, int(limit_raw)))
    except ValueError:
        limit = 10

    r = requests.get("https://cve.circl.lu/api/last", timeout=15)
    r.raise_for_status()
    items = r.json()

    simplified = []
    for item in items[:limit]:
        md = item.get("cveMetadata", {})
        cont = (item.get("containers") or {}).get("cna", {})
        descs = cont.get("descriptions", [])
        description = descs[0].get("value", "") if descs else ""
        simplified.append(
            {
                "cve": md.get("cveId"),
                "published": md.get("datePublished"),
                "updated": md.get("dateUpdated"),
                "title": cont.get("title"),
                "description": description[:280],
            }
        )

    return jsonify({"count": len(simplified), "items": simplified})


@app.get("/api/domain/certs")
def domain_certs():
    _, err = require_auth()
    if err:
        return err

    domain = (request.args.get("domain") or "").strip().lower()
    if not valid_domain(domain):
        return jsonify({"error": "Dominio invalido"}), 400

    r = requests.get(f"https://crt.sh/?q={domain}&output=json", timeout=15)
    r.raise_for_status()

    try:
        rows = r.json()
    except ValueError:
        return jsonify({"error": "Resposta invalida do crt.sh"}), 502

    names = []
    for row in rows[:200]:
        val = row.get("common_name") or ""
        if val and val not in names:
            names.append(val)

    return jsonify(
        {
            "domain": domain,
            "cert_count": len(rows),
            "common_names_sample": names[:30],
        }
    )


@app.post("/api/password/pwned-check")
def password_pwned_check():
    _, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    if len(password) < 4:
        return jsonify({"error": "Senha para analise muito curta"}), 400

    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1[:5]
    suffix = sha1[5:]

    r = requests.get(f"https://api.pwnedpasswords.com/range/{prefix}", timeout=12)
    r.raise_for_status()

    found = 0
    for line in r.text.splitlines():
        parts = line.split(":")
        if len(parts) == 2 and parts[0].strip().upper() == suffix:
            try:
                found = int(parts[1].strip())
            except ValueError:
                found = 0
            break

    return jsonify(
        {
            "pwned": found > 0,
            "count": found,
            "k_anonymity": True,
            "source": "HaveIBeenPwned Pwned Passwords API",
        }
    )


@app.get("/api/cyber/cisa-kev")
def cyber_cisa_kev():
    _, err = require_auth()
    if err:
        return err

    r = requests.get("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", timeout=20)
    r.raise_for_status()
    data = r.json()
    vulns = data.get("vulnerabilities") or []
    items = vulns[:50]
    return jsonify({"count": len(items), "items": items})





@app.get("/api/cyber/urlhaus-recent")
def cyber_urlhaus_recent():
    _, err = require_auth()
    if err:
        return err

    r = requests.get("https://urlhaus.abuse.ch/downloads/json_recent/", timeout=20)
    r.raise_for_status()
    data = r.json()
    urls = data.get("urls") or []
    items = urls[:50]
    return jsonify({"count": len(items), "items": items})





@app.get("/api/cyber/security-headers")
def cyber_security_headers():
    _, err = require_auth()
    if err:
        return err

    domain = (request.args.get("domain") or "").strip().lower()
    if not valid_domain(domain):
        return jsonify({"error": "Dominio invalido"}), 400

    r = requests.get(f"https://securityheaders.com/?q={domain}&hide=on&followRedirects=on&format=json", timeout=20)
    r.raise_for_status()
    data = r.json()
    return jsonify(data)


@app.get("/api/ai/conversations")
def ai_conversations_list():
    user, err = require_auth()
    if err:
        return err

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT c.id, c.title, c.created_at, c.updated_at,
               (SELECT content FROM ai_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message
        FROM ai_conversations c
        WHERE c.username=?
        ORDER BY c.updated_at DESC, c.id DESC
        """,
        (user,),
    ).fetchall()
    conn.close()

    items = [dict(r) for r in rows]
    return jsonify({"count": len(items), "items": items})





@app.post("/api/ai/conversations")
def ai_conversation_create():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "Novo Chat").strip()[:120] or "Novo Chat"
    cid = create_ai_conversation(user, title)
    return jsonify({"ok": True, "conversation_id": cid})


@app.get("/api/ai/history")
def ai_history():
    user, err = require_auth()
    if err:
        return err

    try:
        limit = max(20, min(300, int(request.args.get("limit", "120"))))
    except ValueError:
        limit = 120

    conv_raw = request.args.get("conversation_id")
    conversation_id = None
    if conv_raw:
        try:
            conversation_id = int(conv_raw)
        except ValueError:
            return jsonify({"error": "conversation_id invalido"}), 400
    else:
        conversation_id = get_latest_conversation_id(user)

    if not conversation_id:
        return jsonify({"count": 0, "items": [], "conversation_id": None})

    if not conversation_exists(user, conversation_id):
        return jsonify({"error": "Conversa nao encontrada"}), 404

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT id, role, content, source, metadata, created_at
        FROM ai_messages
        WHERE username = ? AND conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (user, conversation_id, limit),
    ).fetchall()
    conn.close()

    items = [dict(r) for r in reversed(rows)]
    return jsonify({"count": len(items), "items": items, "conversation_id": conversation_id})


@app.delete("/api/ai/history")
def ai_history_clear():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    conv_raw = data.get("conversation_id")
    if conv_raw is None:
        return jsonify({"error": "conversation_id obrigatorio"}), 400

    try:
        conversation_id = int(conv_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "conversation_id invalido"}), 400

    if not conversation_exists(user, conversation_id):
        return jsonify({"error": "Conversa nao encontrada"}), 404

    conn = db_conn()
    conn.execute("DELETE FROM ai_messages WHERE username = ? AND conversation_id = ?", (user, conversation_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.delete("/api/ai/history/<int:message_id>")
def ai_history_delete_one(message_id):
    user, err = require_auth()
    if err:
        return err

    conn = db_conn()
    conn.execute("DELETE FROM ai_messages WHERE id = ? AND username = ?", (message_id, user))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.get("/api/ai/generated-image")
def ai_generated_image():
    _, err = require_auth()
    if err:
        return err

    prompt = compact_text((request.args.get("prompt") or "").strip(), 220)
    if len(prompt) < 3:
        return jsonify({"error": "Prompt muito curto"}), 400

    candidates = [
        f"https://image.pollinations.ai/prompt/{quote(prompt)}?width=1024&height=1024&nologo=true&safe=true",
        f"https://image.pollinations.ai/prompt/{quote(prompt)}?width=1024&height=1024&model=flux&nologo=true&safe=true",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; NemoIA/1.0)",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
    }
    last_error = "Falha ao gerar imagem"

    for remote_url in candidates:
        try:
            r = requests.get(remote_url, timeout=45, headers=headers)
            r.raise_for_status()
            content_type = (r.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
            if content_type.startswith("image/"):
                return Response(r.content, mimetype=content_type, headers={"Cache-Control": "no-store"})
            last_error = f"Resposta invalida do provedor: {content_type}"
        except requests.RequestException as exc:
            last_error = str(exc)

    return jsonify({"error": last_error}), 502


@app.post("/api/ai/ask")
def ai_ask():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    if len(question) < 3:
        return jsonify({"error": "Pergunta muito curta"}), 400

    conv_raw = data.get("conversation_id")
    conversation_id = None
    if conv_raw is not None:
        try:
            conversation_id = int(conv_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "conversation_id invalido"}), 400
        if not conversation_exists(user, conversation_id):
            return jsonify({"error": "Conversa nao encontrada"}), 404
    else:
        conversation_id = create_ai_conversation(user, question[:48])

    image_text = compact_text((data.get("image_text") or "").strip(), 1200)
    composed_question = question
    if image_text:
        composed_question = f"Pergunta do usuario: {question}\n\nTexto extraido da imagem:\n{image_text}"

    save_ai_message(user, conversation_id, "user", question)
    record_access("ai_ask", user, question[:120])
    spreadsheet_mode = wants_spreadsheet_request(question)

    if wants_image_generation(question):
        image_url = build_generated_image_url(question)
        image_answer = f"Imagem gerada conforme pedido:\n{image_url}"
        save_ai_message(user, conversation_id, "assistant", image_answer, "Pollinations Image", "image_generation")
        return jsonify({"answer": image_answer, "source": "Pollinations Image", "conversation_id": conversation_id})


    web_bits = []
    try:
        ddg_ctx = requests.get(
            "https://api.duckduckgo.com/",
            params={"q": question, "format": "json", "no_html": 1, "no_redirect": 1},
            timeout=8,
        )
        ddg_ctx.raise_for_status()
        j = ddg_ctx.json()
        if j.get("AbstractText"):
            web_bits.append("Resumo web: " + j.get("AbstractText"))
        topics = (j.get("RelatedTopics") or [])[:3]
        for t in topics:
            txt = t.get("Text") if isinstance(t, dict) else None
            if txt:
                web_bits.append("Topico relacionado: " + txt)
    except requests.RequestException:
        pass

    context_web = "\n".join(web_bits) if web_bits else "Sem contexto web adicional."
    context_web = compact_text(context_web, 700)

    memory_context = compact_text(fetch_conversation_memory(user, conversation_id, limit=10), 1800)
    kb_context = compact_text(retrieve_kb_context(question, limit=4), 1200)

    extra_mode = spreadsheet_output_rules() if spreadsheet_mode else ""
    prompt = (
        f"Modo adicional:\n{extra_mode}\n\n"
        f"Memoria recente da conversa:\n{memory_context}\n\n"
        f"Base de conhecimento interna:\n{kb_context}\n\n"
        f"Contexto web atual:\n{context_web}\n\n"
        f"Pergunta:\n{composed_question}\n\n"
        "Responda direto e apenas com a resposta final."
    )
    try:
        answer = query_gemini(prompt, NEMO_SYSTEM_PROMPT)
        if answer:
            clean_answer = compact_text(strip_reasoning(answer), 3500)
            if spreadsheet_mode:
                clean_answer = cleanup_spreadsheet_answer(clean_answer)
            save_ai_message(user, conversation_id, "assistant", clean_answer, "Gemini", "web_lookup")
            return jsonify({"answer": clean_answer, "source": "Gemini", "conversation_id": conversation_id})
    except requests.RequestException:
        pass

    try:
        answer = query_deepseek(prompt, NEMO_SYSTEM_PROMPT)
        if answer:
            clean_answer = compact_text(strip_reasoning(answer), 3500)
            if spreadsheet_mode:
                clean_answer = cleanup_spreadsheet_answer(clean_answer)
            save_ai_message(user, conversation_id, "assistant", clean_answer, "DeepSeek", "web_lookup")
            return jsonify({"answer": clean_answer, "source": "DeepSeek", "conversation_id": conversation_id})
    except requests.RequestException:
        pass

    try:
        answer = query_pollinations(prompt)
        if answer:
            clean_answer = compact_text(strip_reasoning(answer), 3500)
            if spreadsheet_mode:
                clean_answer = cleanup_spreadsheet_answer(clean_answer)
            save_ai_message(user, conversation_id, "assistant", clean_answer, "Pollinations AI", "web_lookup")
            return jsonify({"answer": clean_answer, "source": "Pollinations AI", "conversation_id": conversation_id})
    except requests.RequestException:
        pass

    fallback = build_local_answer(question, image_text, context_web)
    save_ai_message(user, conversation_id, "assistant", fallback, "Nemo Local Fallback", "local")
    return jsonify({"answer": fallback, "source": "Nemo Local Fallback", "conversation_id": conversation_id})


@app.errorhandler(requests.RequestException)
def handle_request_error(err):
    return jsonify({"error": f"Falha na API externa: {err}"}), 502


@app.errorhandler(Exception)
def handle_generic_error(err):
    if isinstance(err, HTTPException):
        return err
    return jsonify({"error": f"Erro interno: {err}"}), 500


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
else:
    init_db()


















































