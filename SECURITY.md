# Security Policy

## Intended Use

This project is a personal local application intended to run on `localhost`.

It is not designed for public internet exposure, hosted deployment, production use, commercial use, regulated environments, or multi-user operation.

## Security Model

Current protections include:

- localhost-only server binding
- local unlock passphrase for browser/API access
- salted PBKDF2 password hashing
- server-side session records with `HttpOnly` same-site cookies
- same-origin checks for state-changing requests
- static file allowlisting
- blocked static access to private runtime data under `data/`
- JSON request size limits
- file upload size limits

Important limitations:

- SQLite data is not encrypted at rest.
- Uploaded documents are stored locally under `data/documents/`.
- Anyone with filesystem access to the project folder can copy the database and uploaded documents.
- The local unlock passphrase protects the browser/API layer, not raw files on disk.
- The app does not implement multi-user authorization, tenant isolation, hosted deployment hardening, HTTPS termination, managed secret rotation, audit logging, or production monitoring.

## Sensitive Data

Do not commit or publish runtime data.

The following should be treated as private:

- `data/`
- SQLite databases and sidecar files
- exported JSON backups
- uploaded resumes and cover letters
- application notes and follow-up messages
- local auth hashes and session records
- `.env` files or other local configuration

If private data is committed, treat it as exposed. Removing it in a later commit is not enough because Git preserves history.

## Reporting Security Issues

If this repository is hosted on GitHub and you discover a security issue, report it privately to the repository owner. Prefer GitHub private vulnerability reporting or a private security advisory when available.

Do not open a public issue containing sensitive details, private data, exploit steps, or personally identifiable information.

## No Warranty Or Liability

This software is provided as-is, without warranty of any kind.

The author assumes no liability and is not responsible for data loss, security incidents, misuse, or damages arising from use, inspection, modification, distribution, hosting, or reliance on this software.
