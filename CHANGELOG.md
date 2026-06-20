# Changelog

This file tracks notable user-facing, security, documentation, and maintenance changes to Job Tracker.

This project tracks changes by date because the public `main` branch is the active version of the app.

Version labels are human-readable project milestones. GitHub releases or tags are optional.

## 2026-06-20

### Security

- Replaced PBKDF2 passphrase hashing with memory-hard scrypt (`N=2^15, r=8, p=1`) to raise the cost of offline brute force on GPUs/ASICs.
- Added mandatory TOTP two-factor authentication (RFC 6238). The unlock screen now requires a 6-digit authenticator code in addition to the passphrase. The TOTP secret is enrolled once at setup.
- Added a tamper-evident, hash-chained audit ledger recording every privileged read, write, delete, import, and upload, with chain verification exposed at `GET /api/audit`.
- Added owner-only permissions for local runtime data: `data/`, `data/documents/`, SQLite files, sidecars, and uploaded documents now use private POSIX permissions where supported. In short: the `cat data/job-tracker.sqlite` concern is meow fixed for casual local reads; same-user disk access still belongs to FileVault, encrypted volumes, or future SQLCipher support. Series A diligence remains focused on "the disk."

### Changed

- The unlock screen now collects a 6-digit authentication code; first-run setup shows a one-time 2FA enrollment step.
- All new controls use the Python standard library only, preserving the project's zero-dependency, no-build posture.

## 2026-06-18

### Added

- Added a browser-side session guard that automatically shows the unlock screen before an expired local session causes a save or activity update to fail.
- Added an Internal Contact Replied activity type for referral/internal stakeholder responses.

### Changed

- Standardized activity display labels so views prefer canonical labels over stored/raw event titles.
- Sorted the Applications view by the latest meaningful user-added activity while ignoring Next Action menu completion/unavailable events.
- Aligned the Add Activity dialog controls so the activity type and date fields render as a cleaner, consistent row.

## 2026-06-17

### Added

- Added this changelog so future changes can be tracked outside the README.

## 0.1.0 - 2026-06-16

Initial public/source-available snapshot.

### Added

- Local-first job application tracker that runs in a browser.
- Python standard library HTTP server with SQLite persistence.
- Local unlock flow using a passphrase and session cookie.
- Application records with company, role, location, job URL, salary range, application path, work mode, and status.
- Support for direct applications, referrals, and headhunter/recruiter outreach.
- Local document upload and tracking for resumes, cover letters, and work samples.
- Dated activity timeline for each application.
- Activity editing and deletion.
- Duplicate activity warning before saving repeated activity.
- Follow-up and next-action tracking.
- Follow-up completion with contact method and message/notes.
- Follow-up unavailable state for applications without contact information.
- Dashboard with recent activity, stale applications, and next actions.
- Analytics for status totals, submissions by week, age metrics, document coverage, salary ranges, flow diagrams, and application timelines.
- JSON import/export for portable backups.
- Database schema documentation.
- Security documentation for local-only use.
- Smoke test script for startup, auth, session, and basic API checks.

### Changed

- Refactored browser JavaScript into modules under `js/`.
- Removed sample/demo data seeding from the public copy so each user starts with an empty local database.
- Simplified the public folder to exclude private runtime data, uploaded documents, SQLite databases, backups, and generated files.

### Security

- Added localhost-only API protection with passphrase setup/login.
- Added salted PBKDF2 passphrase hashing.
- Added `HttpOnly` same-site session cookie handling.
- Added origin checks for state-changing API requests.
- Added static-file allowlisting so private runtime data is not served directly.
- Added request and upload size limits.
