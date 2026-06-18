# Job Tracker

A local-first job application tracker for managing applications, documents, follow-ups, activity history, and analytics from a web browser.

The app runs locally on your machine, stores data in SQLite, and does not require a cloud account or external service.

This project was vibe-coded by Ricardo Gonzalez with assistance from OpenAI Codex.

## What's New

See [CHANGELOG.md](CHANGELOG.md) for release notes and a human-readable history of notable app changes.

## Features

- Track job applications with company, role, location, job URL, work mode, salary range, and current status.
- Support multiple application paths:
  - direct application
  - referral, including referrer details
  - headhunter/recruiter outreach, including contact details
- Attach and track documents used for each application, including resumes, cover letters, and portfolio/work samples.
- Store uploaded documents locally and retain their paths for later reference.
- Maintain a dated activity timeline for each application.
- Record activity types such as application submitted, follow-up sent, recruiter replies, internal contact replies, interviews, thank-you notes, offers, rejections, and abandoned applications.
- Manage next actions and follow-up reminders.
- Mark follow-ups as complete, including contact method and message/notes sent.
- Mark follow-ups as unavailable when there is no contact information.
- Edit and delete application activity.
- View a dashboard with recent activity, stale applications, and next actions.
- Use analytics to inspect application status, submission trends, document coverage, salary ranges, flow diagrams, and per-application timelines.
- Export and import portable JSON backups.
- Protect the local browser/API layer with a local unlock passphrase.

## Tech Stack

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Modular browser scripts under `js/`
- SVG-based charts rendered directly in the browser

There is no frontend build step and no package manager requirement.

### Backend

- Python standard library HTTP server
- SQLite
- JSON API endpoints under `/api/*`
- Local file handling for uploaded documents

The server is implemented in `server.py`.

### Persistence

- Main database: `data/job-tracker.sqlite`
- Uploaded documents: `data/documents/`
- Schema details: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

The app uses a hybrid SQLite model:

- application, activity, and task records are stored as JSON in SQLite
- selected metadata fields are duplicated into SQLite columns for indexing and lookup
- uploaded documents are stored on disk and as SQLite BLOBs
- auth settings and sessions are stored in SQLite

## Getting Started

Requirements:

- Python 3
- SQLite support through Python's `sqlite3` module
- A modern browser

Most standard Python 3 installs include the `sqlite3` module. You can check with:

```zsh
python3 -c "import sqlite3; print(sqlite3.sqlite_version)"
```

The `sqlite3` command-line tool is optional, but useful if you want to inspect the database manually.

Start the app:

```zsh
python3 server.py
```

Then open:

```text
http://localhost:4173
```

On first run, the app creates the local SQLite database and asks you to set a local passphrase. After that, use the passphrase to unlock the tracker in the browser.

Stop the server with `Ctrl-C` in the terminal where it is running.

## Project Structure

```text
.
├── .gitignore              # Excludes private runtime data and local artifacts
├── CHANGELOG.md            # Release notes and notable changes
├── app.js                  # Browser startup
├── index.html              # App shell and dialogs
├── styles.css              # UI styling
├── server.py               # Local HTTP server, API routes, SQLite persistence, auth
├── DATABASE_SCHEMA.md      # Database and API/storage details
├── LICENSE.md              # Source-available/no-license terms
├── SECURITY.md             # Local security policy
├── js/
│   ├── analytics.js        # Analytics views and charts
│   ├── actions.js          # Dialog handling and mutations
│   ├── config.js           # Shared constants and client state
│   ├── models.js           # App data helpers
│   ├── navigation.js       # Dashboard drill-down navigation
│   ├── router.js           # URL/history state
│   ├── session.js          # Browser-side idle lock/session guard
│   ├── storage.js          # API client, import/export, uploads
│   └── views.js            # Main UI rendering
├── scripts/
│   └── smoke_test.py       # Isolated startup/auth/API smoke test
└── data/                   # Generated locally on first run; do not commit
```

## Data And Backups

The Data tab can export a JSON backup shaped like:

```json
{
  "exportedAt": "2026-06-16T00:00:00.000Z",
  "applications": [],
  "events": [],
  "tasks": []
}
```

Importing JSON replaces the current local application, activity, and next-action data.

Import/export does not include:

- uploaded document BLOBs
- local auth settings
- active sessions

For a deeper explanation, see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Security And Privacy

This is designed as a personal local app, not a hosted multi-user service.

See [SECURITY.md](SECURITY.md) for the full local security policy.

Current protections:

- server binds to localhost
- application data routes require local unlock after setup
- passphrase is stored as a salted PBKDF2 hash, never plaintext
- sessions use an `HttpOnly` same-site cookie
- state-changing API routes reject cross-origin writes
- static file serving is allowlisted
- private files under `data/` are not served as static files
- request and upload sizes are limited

Important limitations:

- SQLite data is not encrypted at rest.
- Anyone with filesystem access to the project folder can copy the database and uploaded documents.
- The app is not designed for public internet exposure.
- The local passphrase protects the browser/API layer, not the raw files on disk.

Do not expose this server directly to the public internet. The app does not implement multi-user authorization, tenant isolation, hosted deployment hardening, HTTPS termination, managed secret rotation, or production-grade monitoring.

## Disclaimer

This software is provided as-is, without warranty of any kind. It is a personal local tool and is not intended for production, hosted, commercial, regulated, or multi-user use.

The author assumes no liability and is not responsible for data loss, security incidents, misuse, or damages arising from use of this software.

This project was developed with AI assistance. Review, test, and validate the code before relying on it for any personal, professional, or sensitive workflow.

## Authorship And Third-Party Code

This project was vibe-coded by Ricardo Gonzalez with assistance from OpenAI Codex.

The CSS in this repository is project-specific app styling. It does not intentionally include copied third-party stylesheets, CSS frameworks, template code, or vendor CSS.

Before publishing or redistributing, review the repository contents and commit history to confirm no private data, generated files, third-party code, or unlicensed assets have been included.

## GitHub Publishing Notes

Do not commit runtime data.

Before publishing this project, make sure these files and folders are excluded:

```gitignore
data/
*.sqlite
*.sqlite-*
*.db
*.db-*
*.db-journal
*.db-wal
*.db-shm
*.backup*
.DS_Store
__pycache__/
*.pyc
.env
.env.*
```

The `data/` folder may contain:

- real application history
- notes and follow-up messages
- personal contacts
- salary information
- local auth hashes
- uploaded resumes and cover letters

For a clean public repository, start from source files only and let each user generate their own local `data/` directory on first run.

If private data is committed by mistake, deleting it in a later commit is not enough because Git preserves history. Treat any committed database, exported JSON backup, resume, cover letter, token, passphrase, or personal note as exposed.

This repository includes a `.gitignore` for local runtime data and generated files. Recommended repository hygiene before publishing:

- start from a clean folder that excludes `data/`
- do not commit local generated files such as `.DS_Store` or `__pycache__/`
- review the first commit with `git status` and `git diff --cached`
- enable GitHub secret scanning/push protection when available
- keep the repository private if it contains personal implementation notes you do not want reused

## Development Notes

There is no build step. Edit the HTML, CSS, Python, and JavaScript files directly, then refresh the browser.

Static assets are referenced directly from `index.html`. If the browser appears to keep an older version during development, perform a hard refresh.

The local server prints the SQLite database path on startup.

Run the isolated smoke test:

```zsh
python3 scripts/smoke_test.py
```

The smoke test starts a temporary localhost server with a temporary SQLite database and checks startup, auth setup, login/logout, and basic application CRUD. It does not touch your real `data/` folder.

## Limitations And Future Improvements

Potential future improvements:

- formal database migrations
- optional encrypted-at-rest storage
- document cleanup when deleting applications
- richer analytics export
- automated tests for the browser UI
- packaged desktop launcher

## License

This project is shared for portfolio and personal reference purposes only.

No license is granted for copying, modifying, distributing, sublicensing, or using this software in another project without prior written permission from the author.

This repository is not offered as open-source software.

See [LICENSE.md](LICENSE.md) for the full source-available/no-license terms.

Copyright (c) 2026 Ricardo Gonzalez. All rights reserved.
