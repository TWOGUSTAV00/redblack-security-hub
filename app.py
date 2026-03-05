import hashlib
import ipaddress
import os
import re
import socket
import sqlite3
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote, urlparse

import requests
from flask import Flask, Response, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"
ALLOWED_SCHEMES = {"http", "https"}
ADMIN_USERNAME = "Nemo"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "nemo-redblack-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

login_attempts = {}
geo_cache = {}


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
        CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

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


def save_ai_message(username, role, content, source=None, metadata=None):
    conn = db_conn()
    conn.execute(
        "INSERT INTO ai_messages (username, role, content, source, metadata) VALUES (?, ?, ?, ?, ?)",
        (username, role, content[:5000], source, metadata),
    )
    conn.commit()
    conn.close()


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
    record_access("login_success", row["username"])
    return jsonify({"ok": True, "username": row["username"], "is_admin": is_admin(row["username"])})


@app.post("/api/auth/logout")
def auth_logout():
    user = current_user() or "unknown"
    record_access("logout", user)
    session.clear()
    return jsonify({"ok": True})


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
        SELECT id, event_type, username, ip, city, region, country, user_agent, details, created_at
        FROM access_logs
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()

    return jsonify({"count": len(rows), "items": [dict(r) for r in rows]})


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


@app.get("/api/ai/history")
def ai_history():
    user, err = require_auth()
    if err:
        return err

    try:
        limit = max(20, min(300, int(request.args.get("limit", "120"))))
    except ValueError:
        limit = 120

    conn = db_conn()
    rows = conn.execute(
        """
        SELECT id, role, content, source, metadata, created_at
        FROM ai_messages
        WHERE username = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (user, limit),
    ).fetchall()
    conn.close()

    items = [dict(r) for r in reversed(rows)]
    return jsonify({"count": len(items), "items": items})


@app.post("/api/ai/ask")
def ai_ask():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    if len(question) < 3:
        return jsonify({"error": "Pergunta muito curta"}), 400

    save_ai_message(user, "user", question)
    record_access("ai_ask", user, question[:120])

    prompt = (
        "Voce e Nemo IA, assistente de ciberseguranca. Responda em portugues, objetivo, pratico e seguro. "
        "Pergunta: " + question
    )

    try:
        url = f"https://text.pollinations.ai/{quote(prompt)}"
        r = requests.get(url, timeout=25)
        r.raise_for_status()
        answer = (r.text or "").strip()
        if answer:
            save_ai_message(user, "assistant", answer[:3500], "Pollinations AI", "web_lookup")
            return jsonify({"answer": answer[:3500], "source": "Pollinations AI"})
    except requests.RequestException:
        pass

    ddg = requests.get(
        "https://api.duckduckgo.com/",
        params={"q": question, "format": "json", "no_html": 1, "no_redirect": 1},
        timeout=15,
    )
    ddg.raise_for_status()
    j = ddg.json()

    fallback = j.get("AbstractText") or j.get("Answer") or "Nao consegui gerar resposta no momento."
    save_ai_message(user, "assistant", fallback[:3500], "DuckDuckGo fallback", "web_lookup")
    return jsonify({"answer": fallback, "source": "DuckDuckGo fallback"})


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
    app.run(host="0.0.0.0", port=5000, debug=False)
else:
    init_db()
