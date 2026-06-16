#!/usr/bin/env python3
import json
import sqlite3
import base64
import hashlib
import hmac
import posixpath
import re
import secrets
import threading
import time
import uuid
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from datetime import datetime, timedelta, timezone


# ---------------------------------------------------------------------------
# Runtime configuration
# ---------------------------------------------------------------------------

# Local filesystem paths. `data/` is private runtime state and should not be
# committed to source control.
ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "job-tracker.sqlite"
DOCUMENTS_DIR = DATA_DIR / "documents"

# JSON-backed application data tables exposed through the generic CRUD API.
TABLES = ("applications", "events", "tasks")

# Request limits keep local mistakes or unexpected browser input bounded.
MAX_JSON_BODY_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

# Static serving allowlist. Anything outside this list, especially `data/`, is
# not served as a public file.
STATIC_ROOT_FILES = {"index.html", "styles.css", "app.js"}
STATIC_DIRS = {"js"}

# Local auth/session settings. This protects the browser/API layer for the
# single-user local app; it is not a replacement for disk encryption.
SESSION_COOKIE = "job_tracker_session"
PASSWORD_MIN_LENGTH = 15
PBKDF2_ITERATIONS = 600_000
SESSION_IDLE_TIMEOUT = timedelta(hours=4)

# In-memory login throttling for this server process. It slows repeated bad
# attempts without storing additional private data on disk.
MAX_FAILED_LOGINS = 5
LOGIN_LOCKOUT_SECONDS = 60
FAILED_LOGINS = {}
FAILED_LOGINS_LOCK = threading.Lock()

INVALID_REQUEST = object()


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS applications (
              id TEXT PRIMARY KEY,
              data TEXT NOT NULL,
              created_at TEXT,
              updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              application_id TEXT,
              data TEXT NOT NULL,
              occurred_at TEXT,
              created_at TEXT,
              FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              application_id TEXT,
              data TEXT NOT NULL,
              due_at TEXT,
              completed_at TEXT,
              created_at TEXT,
              FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_events_application_id ON events(application_id);
            CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_application_id ON tasks(application_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);

            CREATE TABLE IF NOT EXISTS uploaded_files (
              id TEXT PRIMARY KEY,
              original_name TEXT NOT NULL,
              stored_name TEXT NOT NULL,
              stored_path TEXT NOT NULL,
              mime_type TEXT,
              byte_size INTEGER NOT NULL,
              data BLOB NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_users (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              password_hash TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              iterations INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
              id TEXT PRIMARY KEY,
              token_hash TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
            """
        )


def table_from_path(path):
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "api" and parts[1] in TABLES:
        return parts[1]
    return None


def record_id_from_path(path):
    parts = path.strip("/").split("/")
    if len(parts) == 3 and parts[0] == "api" and parts[1] in TABLES:
        return parts[2]
    return None


def json_response(handler, status, payload, headers=None):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    for key, value in (headers or {}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return None
    if length > MAX_JSON_BODY_BYTES:
        raise RequestError(413, "Request body is too large")
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RequestError(400, "Request body must be valid JSON")


def safe_filename(name):
    stem = Path(name).stem or "document"
    suffix = Path(name).suffix
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-") or "document"
    safe_suffix = re.sub(r"[^A-Za-z0-9.]+", "", suffix)
    return f"{safe_stem}{safe_suffix}"


def static_path_for_request(path):
    request_path = unquote(urlparse(path).path)
    if request_path in ("", "/"):
        return ROOT / "index.html"

    normalized = posixpath.normpath(request_path).lstrip("/")
    parts = normalized.split("/")

    if ".." in parts or not normalized:
        return None
    if len(parts) == 1 and parts[0] in STATIC_ROOT_FILES:
        return ROOT / parts[0]
    if len(parts) == 2 and parts[0] in STATIC_DIRS and parts[1].endswith(".js"):
        candidate = ROOT / parts[0] / parts[1]
        return candidate if candidate.is_file() else None
    return None


def is_allowed_local_origin(value):
    if not value:
        return True
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and parsed.hostname in ("localhost", "127.0.0.1", "::1")


def is_allowed_host(value):
    if not value:
        return True
    host = value.strip()
    if host.startswith("[") and "]" in host:
        hostname = host[1:].split("]", 1)[0]
    else:
        hostname = host.rsplit(":", 1)[0]
    return hostname in ("localhost", "127.0.0.1", "::1")


def is_same_origin_request(handler):
    sec_fetch_site = handler.headers.get("Sec-Fetch-Site", "").lower()
    if sec_fetch_site and sec_fetch_site not in ("same-origin", "none"):
        return False
    return is_allowed_local_origin(handler.headers.get("Origin")) and is_allowed_local_origin(handler.headers.get("Referer"))


def validate_record(record):
    return isinstance(record, dict) and isinstance(record.get("id"), str) and record["id"].strip()


def read_json_or_error(handler):
    try:
        return read_json(handler)
    except RequestError as error:
        json_response(handler, error.status, {"error": error.message})
        return INVALID_REQUEST


def now_utc():
    return datetime.now(timezone.utc)


def iso_utc(value):
    return value.isoformat()


# Passwords are never stored directly. The auth table keeps a random salt and a
# PBKDF2-HMAC-SHA256 hash so the local passphrase is not recoverable from SQLite.
def hash_password(password, salt=None, iterations=PBKDF2_ITERATIONS):
    salt = salt or secrets.token_bytes(32)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return {
        "hash": base64.b64encode(password_hash).decode("ascii"),
        "salt": base64.b64encode(salt).decode("ascii"),
        "iterations": iterations,
    }


def verify_password(password, user):
    try:
        salt = base64.b64decode(user["password_salt"])
    except Exception:
        return False
    candidate = hash_password(password, salt=salt, iterations=int(user["iterations"]))
    return hmac.compare_digest(candidate["hash"], user["password_hash"])


# Session tokens are bearer secrets. Store only their SHA-256 digest in SQLite;
# the raw token exists only in the HttpOnly browser cookie.
def token_digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_cookie_token(handler):
    raw_cookie = handler.headers.get("Cookie", "")
    if not raw_cookie:
        return ""
    cookie = SimpleCookie()
    try:
        cookie.load(raw_cookie)
    except CookieError:
        return ""
    morsel = cookie.get(SESSION_COOKIE)
    return morsel.value if morsel else ""


def session_cookie_header(token):
    max_age = int(SESSION_IDLE_TIMEOUT.total_seconds())
    return f"{SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict"


def clear_session_cookie_header():
    return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"


def auth_configured(db):
    return db.execute("SELECT 1 FROM auth_users WHERE id = 1").fetchone() is not None


def create_session(db):
    session_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    now = now_utc()
    expires_at = now + SESSION_IDLE_TIMEOUT
    db.execute(
        """
        INSERT INTO auth_sessions (id, token_hash, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (session_id, token_digest(token), iso_utc(now), iso_utc(expires_at), iso_utc(now)),
    )
    return token


def delete_expired_sessions(db):
    db.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (iso_utc(now_utc()),))


def authenticated(db, handler):
    token = get_cookie_token(handler)
    if not token:
        return False

    # Treat each authenticated API request as activity and slide the expiration
    # window forward. Expired sessions are opportunistically cleaned up here.
    delete_expired_sessions(db)
    row = db.execute(
        "SELECT id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?",
        (token_digest(token), iso_utc(now_utc())),
    ).fetchone()
    if not row:
        return False

    now = now_utc()
    db.execute(
        "UPDATE auth_sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?",
        (iso_utc(now + SESSION_IDLE_TIMEOUT), iso_utc(now), row["id"]),
    )
    return True


def auth_status_for(handler):
    with connect() as db:
        configured = auth_configured(db)
        return {
            "configured": configured,
            "authenticated": configured and authenticated(db, handler),
        }


# Login throttling is process-local by design: enough friction for a personal
# localhost app without persisting failed attempts in the user's database.
def failed_login_wait_seconds(client_ip):
    now = time.time()
    with FAILED_LOGINS_LOCK:
        entry = FAILED_LOGINS.get(client_ip)
        if not entry:
            return 0
        count, last_failed_at = entry
        if count < MAX_FAILED_LOGINS:
            return 0
        remaining = LOGIN_LOCKOUT_SECONDS - int(now - last_failed_at)
        if remaining <= 0:
            FAILED_LOGINS.pop(client_ip, None)
            return 0
        return remaining


def record_failed_login(client_ip):
    now = time.time()
    with FAILED_LOGINS_LOCK:
        count, _ = FAILED_LOGINS.get(client_ip, (0, 0))
        FAILED_LOGINS[client_ip] = (count + 1, now)


def clear_failed_login(client_ip):
    with FAILED_LOGINS_LOCK:
        FAILED_LOGINS.pop(client_ip, None)


def metadata(table, record):
    if table == "applications":
        return {
            "created_at": record.get("createdAt", ""),
            "updated_at": record.get("updatedAt", ""),
        }
    if table == "events":
        return {
            "application_id": record.get("applicationId", ""),
            "occurred_at": record.get("occurredAt", ""),
            "created_at": record.get("createdAt", ""),
        }
    return {
        "application_id": record.get("applicationId", ""),
        "due_at": record.get("dueAt", ""),
        "completed_at": record.get("completedAt", ""),
        "created_at": record.get("createdAt", ""),
    }


class Handler(SimpleHTTPRequestHandler):
    def reject_bad_host(self):
        if is_allowed_host(self.headers.get("Host")):
            return False
        json_response(self, 403, {"error": "Host is not allowed"})
        return True

    def require_auth(self):
        # All application data, imports, exports, and uploads pass through this
        # gate after the local passphrase has been configured.
        with connect() as db:
            configured = auth_configured(db)
            if configured and authenticated(db, self):
                return True
        json_response(
            self,
            401,
            {
                "error": "Authentication required",
                "configured": configured,
                "authenticated": False,
            },
        )
        return False

    def handle_auth_get(self, path):
        if path != "/api/auth/status":
            return json_response(self, 404, {"error": "Unknown API path"})
        return json_response(self, 200, auth_status_for(self))

    def handle_auth_post(self, path):
        if path == "/api/auth/logout":
            token = get_cookie_token(self)
            if token:
                with connect() as db:
                    db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_digest(token),))
            return json_response(
                self,
                200,
                {"ok": True, "configured": auth_status_for(self)["configured"], "authenticated": False},
                {"Set-Cookie": clear_session_cookie_header()},
            )

        if path not in ("/api/auth/setup", "/api/auth/login"):
            return json_response(self, 404, {"error": "Unknown API path"})

        wait_seconds = failed_login_wait_seconds(self.client_address[0])
        if wait_seconds:
            return json_response(
                self,
                429,
                {"error": f"Too many unlock attempts. Try again in {wait_seconds} seconds."},
            )

        payload = read_json_or_error(self)
        if payload is INVALID_REQUEST:
            return
        password = payload.get("password") if isinstance(payload, dict) else ""
        if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH:
            return json_response(
                self,
                400,
                {"error": f"Passphrase must be at least {PASSWORD_MIN_LENGTH} characters."},
            )

        with connect() as db:
            configured = auth_configured(db)

            if path == "/api/auth/setup":
                # First-run setup is intentionally one-time. Resetting a lost
                # passphrase should be a deliberate local database maintenance step.
                if configured:
                    return json_response(self, 409, {"error": "Local authentication is already configured."})
                password_data = hash_password(password)
                now = iso_utc(now_utc())
                db.execute(
                    """
                    INSERT INTO auth_users (id, password_hash, password_salt, iterations, created_at, updated_at)
                    VALUES (1, ?, ?, ?, ?, ?)
                    """,
                    (
                        password_data["hash"],
                        password_data["salt"],
                        password_data["iterations"],
                        now,
                        now,
                    ),
                )
                token = create_session(db)
                clear_failed_login(self.client_address[0])
                return json_response(
                    self,
                    200,
                    {"ok": True, "configured": True, "authenticated": True},
                    {"Set-Cookie": session_cookie_header(token)},
                )

            if not configured:
                return json_response(self, 400, {"error": "Local authentication has not been configured yet."})

            user = db.execute("SELECT * FROM auth_users WHERE id = 1").fetchone()
            if not user or not verify_password(password, user):
                record_failed_login(self.client_address[0])
                time.sleep(0.25)
                return json_response(self, 401, {"error": "Could not unlock tracker."})

            # Rotate the current browser session on successful login.
            db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_digest(get_cookie_token(self)),))
            token = create_session(db)
            clear_failed_login(self.client_address[0])
            return json_response(
                self,
                200,
                {"ok": True, "configured": True, "authenticated": True},
                {"Set-Cookie": session_cookie_header(token)},
            )

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'")
        super().end_headers()

    def translate_path(self, path):
        request_path = urlparse(path).path
        if request_path.startswith("/api/"):
            return str(ROOT / "index.html")
        static_path = static_path_for_request(path)
        return str(static_path or ROOT / "__not_found__")

    def do_GET(self):
        if self.reject_bad_host():
            return

        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/auth/"):
            return self.handle_auth_get(parsed.path)

        table = table_from_path(parsed.path)

        if not table:
            if not static_path_for_request(self.path):
                return self.send_error(404, "File not found")
            return super().do_GET()

        if not self.require_auth():
            return

        with connect() as db:
            rows = db.execute(f"SELECT data FROM {table}").fetchall()
        records = [json.loads(row["data"]) for row in rows]
        json_response(self, 200, records)

    def do_PUT(self):
        if self.reject_bad_host():
            return
        if not is_same_origin_request(self):
            return json_response(self, 403, {"error": "Cross-origin writes are not allowed"})

        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/auth/"):
            return self.handle_auth_post(parsed.path)

        if not self.require_auth():
            return

        table = table_from_path(parsed.path)
        if not table:
            return json_response(self, 404, {"error": "Unknown API path"})

        record = read_json_or_error(self)
        if record is INVALID_REQUEST:
            return
        if not validate_record(record):
            return json_response(self, 400, {"error": "Record requires an id"})

        meta = metadata(table, record)
        with connect() as db:
            if table == "applications":
                db.execute(
                    """
                    INSERT INTO applications (id, data, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      data = excluded.data,
                      created_at = excluded.created_at,
                      updated_at = excluded.updated_at
                    """,
                    (record["id"], json.dumps(record), meta["created_at"], meta["updated_at"]),
                )
            elif table == "events":
                db.execute(
                    """
                    INSERT INTO events (id, application_id, data, occurred_at, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      application_id = excluded.application_id,
                      data = excluded.data,
                      occurred_at = excluded.occurred_at,
                      created_at = excluded.created_at
                    """,
                    (
                        record["id"],
                        meta["application_id"],
                        json.dumps(record),
                        meta["occurred_at"],
                        meta["created_at"],
                    ),
                )
            else:
                db.execute(
                    """
                    INSERT INTO tasks (id, application_id, data, due_at, completed_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      application_id = excluded.application_id,
                      data = excluded.data,
                      due_at = excluded.due_at,
                      completed_at = excluded.completed_at,
                      created_at = excluded.created_at
                    """,
                    (
                        record["id"],
                        meta["application_id"],
                        json.dumps(record),
                        meta["due_at"],
                        meta["completed_at"],
                        meta["created_at"],
                    ),
                )

        json_response(self, 200, record)

    def do_DELETE(self):
        if self.reject_bad_host():
            return
        if not is_same_origin_request(self):
            return json_response(self, 403, {"error": "Cross-origin writes are not allowed"})

        parsed = urlparse(self.path)
        if not self.require_auth():
            return

        table = table_from_path(parsed.path)
        record_id = record_id_from_path(parsed.path)
        if not table or not record_id:
            return json_response(self, 404, {"error": "Unknown API path"})

        with connect() as db:
            db.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
        json_response(self, 200, {"ok": True})

    def do_POST(self):
        if self.reject_bad_host():
            return
        if not is_same_origin_request(self):
            return json_response(self, 403, {"error": "Cross-origin writes are not allowed"})

        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/auth/"):
            return self.handle_auth_post(parsed.path)

        if not self.require_auth():
            return

        if parsed.path == "/api/files":
            payload = read_json_or_error(self)
            if payload is INVALID_REQUEST:
                return
            if not payload or not payload.get("name") or not payload.get("data"):
                return json_response(self, 400, {"error": "File upload requires name and data"})

            try:
                file_bytes = base64.b64decode(payload["data"], validate=True)
            except Exception:
                return json_response(self, 400, {"error": "File data is invalid"})
            if len(file_bytes) > MAX_UPLOAD_BYTES:
                return json_response(self, 413, {"error": "Uploaded file is too large"})

            DOCUMENTS_DIR.mkdir(exist_ok=True)
            file_id = str(uuid.uuid4())
            stored_name = f"{file_id}-{safe_filename(payload['name'])}"
            stored_path = DOCUMENTS_DIR / stored_name
            stored_path.write_bytes(file_bytes)
            created_at = datetime.now(timezone.utc).isoformat()

            with connect() as db:
                db.execute(
                    """
                    INSERT INTO uploaded_files
                      (id, original_name, stored_name, stored_path, mime_type, byte_size, data, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        file_id,
                        payload["name"],
                        stored_name,
                        str(stored_path),
                        payload.get("mimeType", ""),
                        len(file_bytes),
                        file_bytes,
                        created_at,
                    ),
                )

            return json_response(
                self,
                200,
                {
                    "id": file_id,
                    "originalName": payload["name"],
                    "storedPath": str(stored_path),
                    "mimeType": payload.get("mimeType", ""),
                    "byteSize": len(file_bytes),
                    "createdAt": created_at,
                },
            )

        if parsed.path != "/api/import":
            return json_response(self, 404, {"error": "Unknown API path"})

        payload = read_json_or_error(self)
        if payload is INVALID_REQUEST:
            return
        if not isinstance(payload, dict):
            return json_response(self, 400, {"error": "Import payload is invalid"})
        if not all(isinstance(payload.get(table), list) for table in TABLES):
            return json_response(self, 400, {"error": "Import payload is invalid"})
        for table in TABLES:
            if not all(validate_record(record) for record in payload[table]):
                return json_response(self, 400, {"error": "Import records require ids"})

        with connect() as db:
            for table in TABLES:
                db.execute(f"DELETE FROM {table}")
            for application in payload["applications"]:
                meta = metadata("applications", application)
                db.execute(
                    "INSERT INTO applications (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    (application["id"], json.dumps(application), meta["created_at"], meta["updated_at"]),
                )
            for event in payload["events"]:
                meta = metadata("events", event)
                db.execute(
                    "INSERT INTO events (id, application_id, data, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)",
                    (event["id"], meta["application_id"], json.dumps(event), meta["occurred_at"], meta["created_at"]),
                )
            for task in payload["tasks"]:
                meta = metadata("tasks", task)
                db.execute(
                    "INSERT INTO tasks (id, application_id, data, due_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        task["id"],
                        meta["application_id"],
                        json.dumps(task),
                        meta["due_at"],
                        meta["completed_at"],
                        meta["created_at"],
                    ),
                )

        json_response(self, 200, {"ok": True})

    def do_OPTIONS(self):
        if self.reject_bad_host():
            return
        self.send_response(204)
        self.end_headers()


def main():
    init_db()
    server = ThreadingHTTPServer(("localhost", 4173), Handler)
    print(f"Serving http://localhost:4173")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
