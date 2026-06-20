# Database Schema

This app uses a local SQLite database created by `server.py` when the service starts.

Database file:

```text
data/job-tracker.sqlite
```

Document files are copied to:

```text
data/documents/
```

The database is local to this project folder. The browser never opens SQLite directly. Instead, frontend JavaScript calls local HTTP endpoints exposed by `server.py`, and `server.py` performs all database reads and writes.

## Design

The schema is intentionally hybrid:

- `applications`, `events`, and `tasks` store the full browser record as JSON in a `data` column.
- Those same tables also keep a few duplicated metadata columns for sorting, filtering, joins, and indexes.
- `uploaded_files` stores document metadata plus the file bytes as a SQLite `BLOB`.
- `auth_users` and `auth_sessions` support the local unlock screen.

This keeps frontend changes flexible while still allowing useful SQLite queries and indexes.

## Browser/API Flow

The app is served from `http://localhost:4173`.

`server.py` has two jobs:

1. Serve static frontend files such as `index.html`, `styles.css`, `app.js`, and files under `js/`.
2. Handle JSON API requests under `/api/*`.

The browser-side API helper lives in `js/storage.js`:

```js
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...options
  });
}
```

`API_BASE` is `/api`, so a frontend call like this:

```js
getAll("applications")
```

becomes this browser request:

```http
GET /api/applications
```

`server.py` receives that request, identifies the target table, reads rows from SQLite, parses each row's `data` JSON, and returns a JSON array to the browser.

### Static Files vs API Routes

Static files are loaded directly by the browser:

```text
GET /
GET /styles.css
GET /app.js
GET /js/views.js
```

Those requests return files from the project folder.

API routes are different:

```text
GET    /api/applications
PUT    /api/applications
DELETE /api/applications/{id}
POST   /api/import
POST   /api/files
```

Those requests are handled by Python code in `server.py`; they do not map to files on disk.

### Main Data Endpoints

The three main app tables share the same API pattern.

| Frontend helper | HTTP request | Server behavior |
| --- | --- | --- |
| `getAll("applications")` | `GET /api/applications` | Return all application JSON records |
| `put("applications", app)` | `PUT /api/applications` | Insert or update one application |
| `remove("applications", id)` | `DELETE /api/applications/{id}` | Delete one application |
| `getAll("events")` | `GET /api/events` | Return all activity JSON records |
| `put("events", event)` | `PUT /api/events` | Insert or update one activity |
| `remove("events", id)` | `DELETE /api/events/{id}` | Delete one activity |
| `getAll("tasks")` | `GET /api/tasks` | Return all next-action JSON records |
| `put("tasks", task)` | `PUT /api/tasks` | Insert or update one next action |
| `remove("tasks", id)` | `DELETE /api/tasks/{id}` | Delete one next action |

For `PUT` requests, the browser sends the full record as JSON. The server validates that it has an `id`, stores the complete JSON in the `data` column, and copies selected fields into metadata columns.

Example:

```http
PUT /api/applications
Content-Type: application/json

{
  "id": "application-id",
  "companyName": "Example Co",
  "jobTitle": "Product Manager",
  "createdAt": "2026-06-16",
  "updatedAt": "2026-06-16T12:00:00.000Z"
}
```

That becomes one row in `applications`:

```text
id         -> "application-id"
data       -> full JSON object as text
created_at -> value from createdAt
updated_at -> value from updatedAt
```

### Import/Export Endpoint

Export is assembled entirely in the browser from already-loaded state:

```js
{
  exportedAt,
  applications,
  events,
  tasks
}
```

Import uses:

```http
POST /api/import
```

The server validates that the payload contains `applications`, `events`, and `tasks` arrays. It then replaces all rows in those three tables. It does not replace uploaded files or local authentication settings.

### File Upload Endpoint

Document uploads use:

```http
POST /api/files
```

The browser reads the selected file, Base64-encodes it, and sends:

```json
{
  "name": "resume.pdf",
  "mimeType": "application/pdf",
  "data": "base64-file-content"
}
```

The server:

1. Decodes the Base64 payload.
2. Rejects files larger than the configured upload limit.
3. Creates a sanitized filename with a UUID prefix.
4. Writes the file to `data/documents/`.
5. Stores the file metadata and bytes in `uploaded_files`.
6. Returns the local `storedPath` to the browser.

The application record then stores that returned path in fields like `resumePath` or `coverLetterPath`.

### Authentication Endpoints

Local unlock uses these endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/status` | Checks whether auth is configured and whether the current browser session is unlocked |
| `POST /api/auth/setup` | Sets the first local passphrase |
| `POST /api/auth/login` | Unlocks the app |
| `POST /api/auth/logout` | Deletes the current session and clears the browser cookie |

`POST /api/auth/setup` provisions a TOTP secret and returns it once, in a
`twoFactor` object (`secret`, `manualKey`, `provisioningUri`), so the browser can
prompt the operator to enroll an authenticator. `POST /api/auth/login` requires
both `password` and a current `totpCode`; either one missing or invalid fails the
unlock.

The browser receives an `HttpOnly` session cookie after setup or login. After that, `credentials: "same-origin"` makes `fetch()` include the cookie automatically on future local API calls.

All application data routes require authentication once the local passphrase has been configured.

`GET /api/audit` returns the tamper-evident audit ledger and a `chainIntact`
flag. It requires authentication like any other data route.

### Request Guards

Before mutating data, `server.py` applies several checks:

- Host must be local: `localhost`, `127.0.0.1`, or `::1`.
- Write requests must come from the same local origin.
- JSON request bodies must be valid JSON.
- Request body size is limited.
- File upload size is limited.
- API paths are explicitly routed; arbitrary files under `data/` are not served.

## Initialization

The schema is defined in `init_db()` inside `server.py`.

On server startup:

1. `data/` is created if missing.
2. `data/job-tracker.sqlite` is opened.
3. `PRAGMA foreign_keys = ON` is enabled for each connection.
4. `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements ensure the schema exists.

There is no formal migration framework yet. New columns or tables are currently added through `server.py`.

## Tables

### `applications`

Stores one row per job application.

```sql
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);
```

Columns:

- `id`: application id, generated in the browser with `crypto.randomUUID()`.
- `data`: full application JSON record.
- `created_at`: copied from `data.createdAt`.
- `updated_at`: copied from `data.updatedAt`.

Common JSON fields inside `data` include:

- `companyName`
- `jobTitle`
- `stage`
- `applicationPath`
- `jobUrl`
- `location`
- `workMode`
- `salaryMin`
- `salaryMax`
- `resumeName`
- `resumePath`
- `coverLetterName`
- `coverLetterPath`
- `portfolioPath`
- `tailoredDocuments`
- `documentNotes`
- `referrerName`
- `referrerContact`
- `headhunterName`
- `headhunterContact`
- `notes`
- `createdAt`
- `updatedAt`

### `events`

Stores dated activity for each application.

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  data TEXT NOT NULL,
  occurred_at TEXT,
  created_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
```

Columns:

- `id`: event id.
- `application_id`: copied from `data.applicationId`.
- `data`: full activity JSON record.
- `occurred_at`: copied from `data.occurredAt`.
- `created_at`: copied from `data.createdAt`.

Common event types:

- `application_submitted`
- `follow_up_sent`
- `recruiter_replied`
- `internal_contact_replied`
- `interview_scheduled`
- `interview_completed`
- `thank_you_sent`
- `offer_received`
- `rejected`
- `abandoned_no_response`
- `next_action_completed`
- `next_action_unavailable`
- `note_added`

`job_saved` may exist internally, but the UI generally hides it because it is not meaningful user activity.

Relationship:

- When an application is deleted, its events are deleted automatically through `ON DELETE CASCADE`.

Indexes:

```sql
CREATE INDEX idx_events_application_id ON events(application_id);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
```

### `tasks`

Stores open and completed next actions.

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  data TEXT NOT NULL,
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
```

Columns:

- `id`: task id.
- `application_id`: copied from `data.applicationId`.
- `data`: full task JSON record.
- `due_at`: copied from `data.dueAt`.
- `completed_at`: copied from `data.completedAt`.
- `created_at`: copied from `data.createdAt`.

Common JSON fields inside `data` include:

- `applicationId`
- `title`
- `dueAt`
- `priority`
- `type`
- `notes`
- `completedAt`
- `source`
- `relatedEventId`
- `createdAt`

Relationship:

- When an application is deleted, its tasks are deleted automatically through `ON DELETE CASCADE`.

Indexes:

```sql
CREATE INDEX idx_tasks_application_id ON tasks(application_id);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
```

### `uploaded_files`

Stores uploaded resume, cover letter, and portfolio file metadata.

```sql
CREATE TABLE uploaded_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT,
  byte_size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
```

Columns:

- `id`: uploaded file id.
- `original_name`: filename selected by the user.
- `stored_name`: sanitized local filename with a UUID prefix.
- `stored_path`: absolute local filesystem path under `data/documents/`.
- `mime_type`: browser-provided MIME type.
- `byte_size`: file size in bytes.
- `data`: full file content as a SQLite `BLOB`.
- `created_at`: upload timestamp.

The server also writes the uploaded bytes to `data/documents/`. The app stores the resulting `stored_path` on the application record, such as `resumePath` or `coverLetterPath`.

### `auth_users`

Stores the local unlock passphrase hash.

```sql
CREATE TABLE auth_users (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  kdf_params TEXT NOT NULL DEFAULT '{}',
  totp_secret TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Columns:

- `id`: fixed to `1`; this is a single-user local app.
- `password_hash`: memory-hard scrypt password hash, Base64 encoded.
- `password_salt`: per-password random salt, Base64 encoded.
- `iterations`: retained for backward compatibility; now holds the scrypt cost parameter `N`.
- `kdf_params`: JSON describing the key-derivation function and its parameters, e.g. `{"algo":"scrypt","n":32768,"r":8,"p":1,"dklen":64}`.
- `totp_secret`: Base32 TOTP shared secret for the mandatory second factor. Disclosed to the browser exactly once, at enrollment.
- `created_at`: auth setup timestamp.
- `updated_at`: last auth update timestamp.

The passphrase itself is never stored. Databases created before zero-trust hardening are migrated in place: `init_db()` adds the `kdf_params` and `totp_secret` columns when they are absent.

### `audit_log`

Append-only, hash-chained ledger of every privileged operation. Each entry's
`entry_hash` is `SHA-256(ts | actor | action | detail | prev_hash)`, so any
later edit or deletion of a row breaks the chain and is detectable.

```sql
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);
```

Columns:

- `seq`: monotonic sequence number / chain order.
- `ts`: ISO-8601 UTC timestamp of the entry.
- `actor`: the local operator (single-user app).
- `action`: operation code, e.g. `auth.login`, `data.read`, `data.write`, `data.delete`, `data.import`, `file.upload`.
- `detail`: human-readable context (table, record id, byte count, etc.).
- `prev_hash`: `entry_hash` of the previous entry, or the all-zero genesis digest for the first row.
- `entry_hash`: SHA-256 digest binding this entry to the chain.

The chain is verified and returned by `GET /api/audit`, which responds with the
ordered entries plus a `chainIntact` boolean.

### `auth_sessions`

Stores active local browser sessions.

```sql
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
```

Columns:

- `id`: session id.
- `token_hash`: SHA-256 hash of the browser session token.
- `created_at`: session creation timestamp.
- `expires_at`: idle timeout expiration timestamp.
- `last_seen_at`: last authenticated API access timestamp.

The raw session token is only sent to the browser in an `HttpOnly` cookie. The database stores only its hash.

Index:

```sql
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);
```

## Relationships

```text
applications
  ├── events.application_id -> applications.id
  └── tasks.application_id  -> applications.id

uploaded_files
  └── linked indirectly by file paths stored in applications.data

auth_users
  └── local single-user unlock configuration

auth_sessions
  └── active unlock sessions
```

Deleting an application cascades to `events` and `tasks`. Uploaded files are not currently cascaded by a database foreign key because application records store document paths inside JSON.

## Import And Export

The Data tab exports this JSON shape:

```json
{
  "exportedAt": "2026-06-16T00:00:00.000Z",
  "applications": [],
  "events": [],
  "tasks": []
}
```

Only `applications`, `events`, and `tasks` are included in JSON import/export.

Not included:

- `uploaded_files`
- `auth_users`
- `auth_sessions`

Import replaces all rows in `applications`, `events`, and `tasks`. It does not replace local authentication settings.

## Security Notes

- The server listens on localhost only.
- API write routes reject cross-origin writes.
- Static file serving is allowlisted so `data/`, the SQLite database, and `server.py` are not served as public files.
- Local authentication protects the browser/API layer.
- The SQLite database is not encrypted at rest.
- If the local passphrase is forgotten, the auth rows can be reset without deleting application data.

## Useful Local Queries

Open the database:

```zsh
sqlite3 data/job-tracker.sqlite
```

List tables:

```sql
.tables
```

Count applications:

```sql
SELECT COUNT(*) FROM applications;
```

Show recent activity dates:

```sql
SELECT application_id, occurred_at
FROM events
ORDER BY occurred_at DESC
LIMIT 20;
```

Show open next actions:

```sql
SELECT application_id, due_at, json_extract(data, '$.title') AS title
FROM tasks
WHERE completed_at = ''
ORDER BY due_at ASC;
```
