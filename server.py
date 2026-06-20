#!/usr/bin/env python3
import json
import os
import sqlite3
import base64
import hashlib
import hmac
import posixpath
import re
import secrets
import struct
import threading
import time
import uuid
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
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
PRIVATE_DIR_MODE = 0o700
PRIVATE_FILE_MODE = 0o600

# JSON-backed application data tables exposed through the generic CRUD API.
TABLES = ("applications", "events", "tasks")

# Canonical labels returned by the API for event records. This keeps older
# saved records from leaking internal event codes into the UI.
EVENT_LABELS = {
    "internal_contact_replied": "Internal Contact Replied",
}

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

# Credential hardening. The previous build derived the passphrase hash with
# PBKDF2 (600k iterations). PBKDF2 is purely compute-bound, which makes it
# cheap to attack on commodity GPUs/ASICs. We migrate to scrypt, a
# memory-hard KDF, so an offline cracker has to pay for ~256 MiB of RAM per
# guess instead of a fistful of SHA-256 rounds. (Phase 2: Argon2id once we are
# permitted a third-party dependency; scrypt is the strongest stdlib option.)
SCRYPT_N = 2 ** 15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64
SCRYPT_SALT_BYTES = 32
SCRYPT_MAXMEM = 256 * 1024 * 1024

# Mandatory second factor (RFC 6238 TOTP). Possession of the local passphrase
# is no longer sufficient to read application data; the operator must also
# present a time-based one-time code from an enrolled authenticator. Hand-rolled
# on hmac/struct to preserve the project's zero-dependency posture.
TOTP_DIGITS = 6
TOTP_PERIOD = 30
TOTP_DRIFT_WINDOW = 1
TOTP_ISSUER = "Job Tracker (localhost)"
TOTP_ACCOUNT = "local-operator"

# Tamper-evident audit ledger. Every privileged read or mutation is appended to
# a hash-chained log so that after-the-fact tampering with the ledger is
# detectable. Genesis is the all-zero digest.
AUDIT_GENESIS = "0" * 64
AUDIT_ACTOR = "local-operator"

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
    DATA_DIR.mkdir(mode=PRIVATE_DIR_MODE, exist_ok=True)
    harden_path_permissions(DATA_DIR, PRIVATE_DIR_MODE)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    harden_path_permissions(DB_PATH, PRIVATE_FILE_MODE)
    return connection


def harden_path_permissions(path, mode):
    if os.name != "posix":
        return
    try:
        path.chmod(mode)
    except OSError:
        # Permission hardening is best-effort: never strand the local app because
        # a filesystem does not support chmod or a sidecar file disappeared.
        pass


def harden_private_storage_permissions():
    DATA_DIR.mkdir(mode=PRIVATE_DIR_MODE, exist_ok=True)
    DOCUMENTS_DIR.mkdir(mode=PRIVATE_DIR_MODE, exist_ok=True)
    harden_path_permissions(DATA_DIR, PRIVATE_DIR_MODE)
    harden_path_permissions(DOCUMENTS_DIR, PRIVATE_DIR_MODE)

    sqlite_paths = [
        DB_PATH,
        Path(f"{DB_PATH}-journal"),
        Path(f"{DB_PATH}-shm"),
        Path(f"{DB_PATH}-wal"),
    ]
    for path in sqlite_paths:
        if path.exists():
            harden_path_permissions(path, PRIVATE_FILE_MODE)

    if DOCUMENTS_DIR.exists():
        for path in DOCUMENTS_DIR.rglob("*"):
            harden_path_permissions(path, PRIVATE_DIR_MODE if path.is_dir() else PRIVATE_FILE_MODE)


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
              kdf_params TEXT NOT NULL DEFAULT '{}',
              totp_secret TEXT NOT NULL DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS audit_log (
              seq INTEGER PRIMARY KEY AUTOINCREMENT,
              ts TEXT NOT NULL,
              actor TEXT NOT NULL,
              action TEXT NOT NULL,
              detail TEXT NOT NULL,
              prev_hash TEXT NOT NULL,
              entry_hash TEXT NOT NULL
            );
            """
        )

        # Online migration for databases created before zero-trust hardening.
        # `CREATE TABLE IF NOT EXISTS` will not retrofit columns onto an existing
        # auth_users row, so add them explicitly when absent.
        ensure_column(db, "auth_users", "kdf_params", "TEXT NOT NULL DEFAULT '{}'")
        ensure_column(db, "auth_users", "totp_secret", "TEXT NOT NULL DEFAULT ''")
    harden_private_storage_permissions()


def ensure_column(db, table, column, declaration):
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


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


def normalize_record(table, record):
    if table != "events" or not isinstance(record, dict):
        return record
    label = EVENT_LABELS.get(record.get("type"))
    if not label:
        return record
    return {**record, "title": label}


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
# memory-hard scrypt hash so the local passphrase is not recoverable from SQLite
# and is expensive to brute-force offline even with GPU/ASIC acceleration.
def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(SCRYPT_SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        maxmem=SCRYPT_MAXMEM,
        dklen=SCRYPT_DKLEN,
    )
    return {
        "hash": base64.b64encode(derived).decode("ascii"),
        "salt": base64.b64encode(salt).decode("ascii"),
        "params": {"algo": "scrypt", "n": SCRYPT_N, "r": SCRYPT_R, "p": SCRYPT_P, "dklen": SCRYPT_DKLEN},
    }


def is_legacy_kdf(user):
    # Pre-hardening databases stored a PBKDF2 hash and left kdf_params empty.
    try:
        params = json.loads(user["kdf_params"] or "{}")
    except Exception:
        return True
    return params.get("algo") != "scrypt"


def verify_password(password, user):
    try:
        salt = base64.b64decode(user["password_salt"])
        params = json.loads(user["kdf_params"] or "{}")
    except Exception:
        return False

    if params.get("algo") != "scrypt":
        # Backward compatibility: verify legacy PBKDF2-HMAC-SHA256 credentials so
        # existing operators are never locked out by the migration. Successful
        # logins are transparently rehashed to scrypt (see handle_auth_post).
        legacy_hash = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(user["iterations"])
        )
        return hmac.compare_digest(base64.b64encode(legacy_hash).decode("ascii"), user["password_hash"])

    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=int(params.get("n", SCRYPT_N)),
        r=int(params.get("r", SCRYPT_R)),
        p=int(params.get("p", SCRYPT_P)),
        maxmem=SCRYPT_MAXMEM,
        dklen=int(params.get("dklen", SCRYPT_DKLEN)),
    )
    return hmac.compare_digest(base64.b64encode(derived).decode("ascii"), user["password_hash"])


def upgrade_password_hash(db, password):
    # Transparent KDF upgrade on successful legacy login.
    password_data = hash_password(password)
    db.execute(
        "UPDATE auth_users SET password_hash = ?, password_salt = ?, iterations = ?, kdf_params = ?, updated_at = ? WHERE id = 1",
        (
            password_data["hash"],
            password_data["salt"],
            SCRYPT_N,
            json.dumps(password_data["params"]),
            iso_utc(now_utc()),
        ),
    )


def enroll_second_factor(db):
    # Provision a TOTP secret for an operator who predates 2FA enforcement.
    secret = generate_totp_secret()
    db.execute(
        "UPDATE auth_users SET totp_secret = ?, updated_at = ? WHERE id = 1",
        (secret, iso_utc(now_utc())),
    )
    return secret


# --- Mandatory second factor: RFC 6238 TOTP, hand-rolled on the standard lib ---
def generate_totp_secret():
    # 160-bit secret -> 32 base32 chars, no padding. Standard authenticator size.
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def _totp_at(secret_b32, counter):
    key = base64.b32decode(secret_b32, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(truncated % (10 ** TOTP_DIGITS)).zfill(TOTP_DIGITS)


def generate_totp(secret_b32, for_time=None):
    if for_time is None:
        for_time = time.time()
    return _totp_at(secret_b32, int(for_time // TOTP_PERIOD))


def verify_totp(secret_b32, code):
    if not secret_b32 or not code:
        return False
    code = str(code).strip()
    if not code.isdigit() or len(code) != TOTP_DIGITS:
        return False
    counter = int(time.time() // TOTP_PERIOD)
    # Accept a small clock-drift window on either side of the current step.
    for drift in range(-TOTP_DRIFT_WINDOW, TOTP_DRIFT_WINDOW + 1):
        if hmac.compare_digest(_totp_at(secret_b32, counter + drift), code):
            return True
    return False


def totp_provisioning_uri(secret):
    label = quote(f"{TOTP_ISSUER}:{TOTP_ACCOUNT}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(TOTP_ISSUER)}"
        f"&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD}"
    )


def totp_manual_key(secret):
    # Grouped into quads so a human can transcribe it into an authenticator app.
    return " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))


# --- Tamper-evident, hash-chained audit ledger -----------------------------
def audit(db, action, detail=""):
    prev_row = db.execute("SELECT entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
    prev_hash = prev_row["entry_hash"] if prev_row else AUDIT_GENESIS
    ts = iso_utc(now_utc())
    payload = "|".join([ts, AUDIT_ACTOR, action, detail, prev_hash])
    entry_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    db.execute(
        "INSERT INTO audit_log (ts, actor, action, detail, prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?)",
        (ts, AUDIT_ACTOR, action, detail, prev_hash, entry_hash),
    )


def verify_audit_chain(db):
    prev_hash = AUDIT_GENESIS
    for row in db.execute(
        "SELECT ts, actor, action, detail, prev_hash, entry_hash FROM audit_log ORDER BY seq ASC"
    ):
        if row["prev_hash"] != prev_hash:
            return False
        payload = "|".join([row["ts"], row["actor"], row["action"], row["detail"], prev_hash])
        if hashlib.sha256(payload.encode("utf-8")).hexdigest() != row["entry_hash"]:
            return False
        prev_hash = row["entry_hash"]
    return True


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


def two_factor_enrolled(db):
    row = db.execute("SELECT totp_secret FROM auth_users WHERE id = 1").fetchone()
    return bool(row and row["totp_secret"])


def auth_state_fields(configured, authenticated_flag, two_factor):
    return {
        "configured": configured,
        "authenticated": authenticated_flag,
        "twoFactorEnrolled": two_factor,
        "idleTimeoutSeconds": int(SESSION_IDLE_TIMEOUT.total_seconds()),
    }


def auth_status_for(handler):
    with connect() as db:
        configured = auth_configured(db)
        return auth_state_fields(
            configured,
            configured and authenticated(db, handler),
            configured and two_factor_enrolled(db),
        )


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
            two_factor = configured and two_factor_enrolled(db)
            if configured and authenticated(db, self):
                return True
        json_response(
            self,
            401,
            {"error": "Authentication required", **auth_state_fields(configured, False, two_factor)},
        )
        return False

    def handle_auth_get(self, path):
        if path != "/api/auth/status":
            return json_response(self, 404, {"error": "Unknown API path"})
        return json_response(self, 200, auth_status_for(self))

    def handle_auth_post(self, path):
        if path == "/api/auth/logout":
            token = get_cookie_token(self)
            with connect() as db:
                if token:
                    db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_digest(token),))
                configured = auth_configured(db)
                two_factor = configured and two_factor_enrolled(db)
                audit(db, "auth.logout", "session ended")
            return json_response(
                self,
                200,
                {"ok": True, **auth_state_fields(configured, False, two_factor)},
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
                totp_secret = generate_totp_secret()
                now = iso_utc(now_utc())
                db.execute(
                    """
                    INSERT INTO auth_users (id, password_hash, password_salt, iterations, kdf_params, totp_secret, created_at, updated_at)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        password_data["hash"],
                        password_data["salt"],
                        SCRYPT_N,
                        json.dumps(password_data["params"]),
                        totp_secret,
                        now,
                        now,
                    ),
                )
                token = create_session(db)
                audit(db, "auth.setup", "passphrase + 2FA enrolled")
                clear_failed_login(self.client_address[0])
                return json_response(
                    self,
                    200,
                    {
                        "ok": True,
                        **auth_state_fields(True, True, True),
                        # First-run 2FA enrollment payload. Returned exactly once,
                        # at setup, so the operator can register an authenticator.
                        "twoFactor": {
                            "secret": totp_secret,
                            "manualKey": totp_manual_key(totp_secret),
                            "provisioningUri": totp_provisioning_uri(totp_secret),
                            "digits": TOTP_DIGITS,
                            "period": TOTP_PERIOD,
                        },
                    },
                    {"Set-Cookie": session_cookie_header(token)},
                )

            if not configured:
                return json_response(self, 400, {"error": "Local authentication has not been configured yet."})

            user = db.execute("SELECT * FROM auth_users WHERE id = 1").fetchone()
            if not user or not verify_password(password, user):
                record_failed_login(self.client_address[0])
                audit(db, "auth.login.denied", "passphrase rejected")
                time.sleep(0.25)
                return json_response(self, 401, {"error": "Could not unlock tracker."})

            # Transparently upgrade legacy PBKDF2 credentials to scrypt so the
            # migration never strands an existing operator.
            if is_legacy_kdf(user):
                upgrade_password_hash(db, password)
                audit(db, "auth.kdf.upgraded", "pbkdf2 -> scrypt")

            # Grace enrollment: an operator who predates 2FA enforcement has a
            # correct passphrase but no enrolled secret. Provision one now and
            # hand it back so the browser can complete enrollment, rather than
            # locking them out.
            if not user["totp_secret"]:
                secret = enroll_second_factor(db)
                db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_digest(get_cookie_token(self)),))
                token = create_session(db)
                audit(db, "auth.2fa.enrolled", "grace enrollment on first hardened login")
                clear_failed_login(self.client_address[0])
                return json_response(
                    self,
                    200,
                    {
                        "ok": True,
                        **auth_state_fields(True, True, True),
                        "twoFactor": {
                            "secret": secret,
                            "manualKey": totp_manual_key(secret),
                            "provisioningUri": totp_provisioning_uri(secret),
                            "digits": TOTP_DIGITS,
                            "period": TOTP_PERIOD,
                        },
                    },
                    {"Set-Cookie": session_cookie_header(token)},
                )

            # Knowledge of the passphrase is not sufficient. The operator must
            # also present a valid second factor before any session is issued.
            totp_code = payload.get("totpCode") if isinstance(payload, dict) else ""
            if not verify_totp(user["totp_secret"], totp_code):
                record_failed_login(self.client_address[0])
                audit(db, "auth.login.denied", "second factor rejected")
                time.sleep(0.25)
                return json_response(
                    self,
                    401,
                    {"error": "Enter the 6-digit code from your authenticator app."},
                )

            # Rotate the current browser session on successful login.
            db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_digest(get_cookie_token(self)),))
            token = create_session(db)
            audit(db, "auth.login", "passphrase + second factor verified")
            clear_failed_login(self.client_address[0])
            return json_response(
                self,
                200,
                {"ok": True, **auth_state_fields(True, True, True)},
                {"Set-Cookie": session_cookie_header(token)},
            )

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
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

        if parsed.path == "/api/audit":
            if not self.require_auth():
                return
            with connect() as db:
                rows = db.execute(
                    "SELECT seq, ts, action, detail, entry_hash FROM audit_log ORDER BY seq ASC"
                ).fetchall()
                chain_intact = verify_audit_chain(db)
            return json_response(
                self,
                200,
                {"entries": [dict(row) for row in rows], "count": len(rows), "chainIntact": chain_intact},
            )

        table = table_from_path(parsed.path)

        if not table:
            if not static_path_for_request(self.path):
                return self.send_error(404, "File not found")
            return super().do_GET()

        if not self.require_auth():
            return

        with connect() as db:
            rows = db.execute(f"SELECT data FROM {table}").fetchall()
            audit(db, "data.read", table)
        records = [normalize_record(table, json.loads(row["data"])) for row in rows]
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

        record = normalize_record(table, record)
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
            audit(db, "data.write", f"{table}/{record['id']}")

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
            audit(db, "data.delete", f"{table}/{record_id}")
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
            harden_path_permissions(DOCUMENTS_DIR, PRIVATE_DIR_MODE)
            file_id = str(uuid.uuid4())
            stored_name = f"{file_id}-{safe_filename(payload['name'])}"
            stored_path = DOCUMENTS_DIR / stored_name
            stored_path.write_bytes(file_bytes)
            harden_path_permissions(stored_path, PRIVATE_FILE_MODE)
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
                audit(db, "file.upload", f"{stored_name} ({len(file_bytes)} bytes)")

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
            counts = "/".join(f"{table}:{len(payload[table])}" for table in TABLES)
            audit(db, "data.import", f"replaced all tables ({counts})")

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
    print("Security posture: scrypt KDF + mandatory TOTP 2FA + tamper-evident audit ledger")
    server.serve_forever()


if __name__ == "__main__":
    main()
