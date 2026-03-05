import os
import re
import sqlite3
import socket
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"
ALLOWED_SCHEMES = {"http", "https"}

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "nemo-redblack-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

login_attempts = {}


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    admin_user = "Nemo"
    admin_pass = "gustavo270998"
    row = conn.execute("SELECT id FROM users WHERE username = ?", (admin_user,)).fetchone()
    if row:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (generate_password_hash(admin_pass), admin_user),
        )
    else:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (admin_user, generate_password_hash(admin_pass)),
        )
    conn.commit()
    conn.close()


def current_user():
    return session.get("username")


def require_auth():
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Nao autenticado"}), 401)
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


@app.after_request
def secure_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/auth/me")
def auth_me():
    user = current_user()
    return jsonify({"authenticated": bool(user), "username": user})


@app.post("/api/auth/register")
def auth_register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not valid_username(username):
        return jsonify({"error": "Usuario invalido. Use 3-32 chars: letras, numeros, _.-"}), 400
    if not valid_password(password):
        return jsonify({"error": "Senha invalida. Minimo 8 caracteres."}), 400

    conn = db_conn()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
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
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")
    now = time.time()
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    tries = [t for t in login_attempts.get(ip, []) if now - t < 300]
    login_attempts[ip] = tries
    if len(tries) >= 10:
        return jsonify({"error": "Muitas tentativas. Aguarde 5 minutos."}), 429

    conn = db_conn()
    row = conn.execute(
        "SELECT username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        login_attempts[ip].append(now)
        return jsonify({"error": "Credenciais invalidas"}), 401

    session.clear()
    session["username"] = row["username"]
    return jsonify({"ok": True, "username": row["username"]})


@app.post("/api/auth/logout")
def auth_logout():
    session.clear()
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


@app.post("/api/ping")
def ping_url():
    _, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target = normalize_url(data.get("url"))
    if not target:
        return jsonify({"error": "URL invalida"}), 400

    measurements = []
    for _ in range(3):
        start = time.perf_counter()
        try:
            requests.get(target, timeout=8)
            ms = (time.perf_counter() - start) * 1000
            measurements.append(round(ms, 2))
        except requests.RequestException:
            measurements.append(None)

    valid = [m for m in measurements if isinstance(m, (int, float))]
    avg = round(sum(valid) / len(valid), 2) if valid else None

    return jsonify({"target": target, "attempts_ms": measurements, "avg_ms": avg})


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
    for feature in data.get("features", [])[:120]:
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
    if not re.fullmatch(r"[a-z0-9.-]{3,255}", host):
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






