# Security Policy

## Intended Use

This project is a personal local application intended to run on `localhost`.

It is not designed for public internet exposure, hosted deployment, production use, commercial use, regulated environments, or multi-user operation.

## Security Model

Current protections include:

- localhost-only server binding
- local unlock passphrase for browser/API access
- salted, memory-hard **scrypt** password hashing (≈256 MiB cost per guess)
- **mandatory TOTP two-factor authentication** (RFC 6238) on every unlock
- **tamper-evident, hash-chained audit ledger** of every privileged read and write
- server-side session records with `HttpOnly` same-site cookies
- same-origin checks for state-changing requests
- static file allowlisting
- blocked static access to private runtime data under `data/`
- private runtime file permissions for `data/`, SQLite files, sidecars, and uploaded documents on POSIX filesystems
- JSON request size limits
- file upload size limits

## Zero-Trust Controls

This build adopts a defense-in-depth, zero-trust posture for the local
browser/API layer:

- **Memory-hard credentials.** The passphrase is derived with scrypt
  (`N=2^15, r=8, p=1`), making offline brute force materially more expensive on
  GPUs and ASICs than the previous compute-only PBKDF2.
- **Possession factor.** Knowledge of the passphrase is no longer sufficient.
  Every unlock additionally requires a current six-digit code from an enrolled
  authenticator app. The TOTP secret is shown exactly once, at enrollment.
- **Tamper-evident telemetry.** Every authenticated read, write, delete,
  import, and upload is appended to a SHA-256 hash-chained ledger. The chain can
  be verified at any time via `GET /api/audit`; altering or deleting any entry
  breaks the chain and is detected.

All of the above is implemented with the Python standard library only, so the
project retains its zero-dependency posture.

Important limitations:

- SQLite data is not encrypted at rest.
- Uploaded documents are stored locally under `data/documents/`.
- Runtime file permissions reduce accidental exposure to other local users, but they do not protect against a process running as your OS account.
- Anyone with filesystem access as the same OS user can still copy the database and uploaded documents.
- The local unlock passphrase protects the browser/API layer, not raw files on disk.
- To protect raw files on a stolen laptop, use FileVault, an encrypted volume/disk image, or a future SQLCipher/encrypted-database build.
- The app does not implement multi-user authorization, tenant isolation, hosted deployment hardening, HTTPS termination, managed secret rotation, or production monitoring.

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
