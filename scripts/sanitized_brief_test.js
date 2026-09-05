#!/usr/bin/env node
// Focused, dependency-free verification for the allowlisted Markdown export.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const state = { applications: [], events: [] };
const sandbox = {
  console,
  state,
  Blob: class Blob {},
  URL: { createObjectURL() {}, revokeObjectURL() {} },
  document: { createElement() { return { click() {} }; } },
  alert() {},
  fetch() {},
  toDateInput(date) {
    return new Date(date).toISOString().slice(0, 10);
  },
  dateOnly(value) {
    return String(value || "").slice(0, 10);
  },
  daysSince(value) {
    const day = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Math.max(0, Math.floor((Date.now() - day) / 86400000));
  },
  normalizeStage(stage) {
    return !stage || stage === "Saved" || stage === "Preparing" ? "Applied" : stage;
  },
  inferApplicationPath(app) {
    return ["direct", "referral", "headhunter"].includes(app.applicationPath) ? app.applicationPath : "direct";
  },
  applicationStartDate(app) {
    return app.createdAt;
  },
  applicationStage(app) {
    return sandbox.normalizeStage(app.stage);
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "js", "storage.js"), "utf8"), sandbox);

const applications = [
  {
    id: "application-private-id",
    companyName: "Example Systems",
    jobTitle: "Senior Product Manager",
    applicationPath: "referral",
    workMode: "Remote",
    stage: "Applied",
    createdAt: "2026-06-01",
    jobUrl: "https://jobs.example.test/opening?tracking=private",
    referrerName: "Private Referrer",
    referrerContact: "person@example.test",
    notes: "The system is broken. Call +1 000 000 0000.",
    resumePath: "/Users/REPLACE_WITH_LOCAL_ACCOUNT/resume.pdf",
    documentNotes: "Recommended by another reviewer.",
    salaryMin: 170000,
    fit: "high",
    excitement: "high",
    source: "legacy",
  },
  {
    id: "application-second-id",
    companyName: "Plain Company",
    jobTitle: "Director of Product",
    applicationPath: "direct",
    workMode: "Hybrid",
    stage: "Applied",
    createdAt: "2026-06-02",
  },
];
const events = [
  {
    id: "event-private-id",
    applicationId: "application-private-id",
    type: "interview_scheduled",
    occurredAt: "2026-06-04",
    scheduledFor: "2026-06-10",
    createdAt: "2026-06-04T09:15:00Z",
    description: "Recruiter said email person@example.test and visit https://private.example.test.",
  },
  {
    id: "event-rejection-id",
    applicationId: "application-private-id",
    type: "rejected",
    occurredAt: "2026-06-12",
    createdAt: "2026-06-12T10:30:00Z",
    description: "No raw message should appear.",
  },
];

const brief = sandbox.createSanitizedBrief(applications, events, new Date("2026-09-05T00:00:00Z"));
sandbox.assertSanitizedBrief(brief, applications);

state.events = events;
sandbox.applicationStage = (app) => sandbox.briefStage(app, state.events);
const normalizedBackup = sandbox.normalizedBackupApplication(applications[0]);
assert.equal(normalizedBackup.stage, "Rejected", "private backups must use the reconciled terminal stage");
assert.equal("fit" in normalizedBackup, false, "private backups must omit fit");
assert.equal("excitement" in normalizedBackup, false, "private backups must omit excitement");
assert.equal("source" in normalizedBackup, false, "private backups must omit obsolete source");

assert.match(brief, /Total application submission records: 2/);
assert.match(brief, /Direct: 1/);
assert.match(brief, /Referral: 1/);
assert.match(brief, /Example Systems — Senior Product Manager/);
assert.match(brief, /Interview 1 \(2026-06-10\)/);
assert.match(brief, /Rejected \(2026-06-12\)/);
[
  "person@example.test",
  "Private Referrer",
  "https://",
  "/Users/",
  "000 000 0000",
  "The system is broken",
  "resume.pdf",
  "170000",
  "application-private-id",
  "event-private-id",
].forEach((value) => assert.equal(brief.includes(value), false, `brief leaked ${value}`));

console.log("Sanitized brief test passed");
