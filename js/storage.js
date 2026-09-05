// SQLite API client, legacy migration, seed data, backups, and document uploads.

async function api(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...fetchOptions,
    headers: { "Content-Type": "application/json", ...headers },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/") && typeof renderAuthGate === "function") {
      handleApiUnauthorized(payload);
    }
    throw new Error(payload?.error || `API request failed: ${response.status}`);
  }

  if (typeof noteSessionActivityFromApi === "function") {
    noteSessionActivityFromApi(path, payload);
  }

  return payload;
}

async function getAuthStatus() {
  return api("/auth/status");
}

async function setupAuth(password) {
  return api("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function loginAuth(password, totpCode) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password, totpCode }),
  });
}

async function logoutAuth() {
  return api("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function getAll(storeName) {
  return api(`/${storeName}`);
}

async function put(storeName, record) {
  return api(`/${storeName}`, {
    method: "PUT",
    body: JSON.stringify(record),
  });
}

async function remove(storeName, id) {
  return api(`/${storeName}/${id}`, { method: "DELETE" });
}

async function migrateLegacyIndexedDbIfNeeded() {
  const existingSqliteApplications = await getAll("applications");
  if (existingSqliteApplications.length) return;

  const legacyData = await readLegacyIndexedDb();
  if (!legacyData || !legacyData.applications.length) return;

  await api("/import", {
    method: "POST",
    body: JSON.stringify(legacyData),
  });
}

function readLegacyIndexedDb() {
  return new Promise((resolve) => {
    const request = indexedDB.open("job-application-tracker");

    request.onerror = () => resolve(null);

    request.onupgradeneeded = () => {
      request.transaction.abort();
      resolve(null);
    };

    request.onsuccess = async () => {
      const legacyDb = request.result;
      const hasStores = stores.every((storeName) => legacyDb.objectStoreNames.contains(storeName));
      if (!hasStores) {
        legacyDb.close();
        resolve(null);
        return;
      }

      const transaction = legacyDb.transaction(stores, "readonly");
      const reads = stores.map((storeName) => legacyRequestToPromise(transaction.objectStore(storeName).getAll()));
      const [applications, events] = await Promise.all(reads);
      legacyDb.close();
      resolve({ applications, events });
    };
  });
}

function legacyRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadAll() {
  const [applications, events] = await Promise.all([
    getAll("applications"),
    getAll("events"),
  ]);

  state.events = events
    .map(normalizeEventRecord)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  state.applications = applications.sort(compareApplicationsForList);
}

async function exportData() {
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    applications: state.applications.map(normalizedBackupApplication),
    events: state.events,
  };
  downloadJson(payload, `jobflow-private-backup-${toDateInput(new Date())}.json`);
}

function normalizedBackupApplication(app) {
  const { fit, excitement, source, _stageBeforeTerminal, ...application } = app;
  return {
    ...application,
    applicationPath: sanitizedApplicationPath(app),
    stage: applicationStage(app),
  };
}

function exportSanitizedBrief() {
  try {
    const brief = createSanitizedBrief(state.applications, state.events, new Date());
    assertSanitizedBrief(brief, state.applications);
    downloadText(brief, `jobflow-sanitized-brief-${toDateInput(new Date())}.md`, "text/markdown");
  } catch (error) {
    console.error(error);
    alert("Job Flow could not create a safe sanitized brief. No file was exported.");
  }
}

function sanitizedApplicationPath(app) {
  const path = inferApplicationPath(app);
  return ["direct", "referral", "headhunter"].includes(path) ? path : "direct";
}

function sanitizedWorkMode(value) {
  return ["Remote", "Hybrid", "On-site", "Flexible"].includes(value) ? value : "Unspecified";
}

function normalizedBriefText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countValues(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function formatBriefCounts(counts, labelFormatter = (value) => value) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length
    ? entries.map(([label, count]) => `- ${labelFormatter(label)}: ${count}`).join("\n")
    : "- None";
}

function applicationEvents(events, applicationId) {
  return events
    .filter((event) => event.applicationId === applicationId)
    .sort((left, right) => `${dateOnly(left.occurredAt)}-${left.createdAt || ""}`.localeCompare(`${dateOnly(right.occurredAt)}-${right.createdAt || ""}`));
}

function interviewEventsForBrief(events, applicationId) {
  return applicationEvents(events, applicationId)
    .filter((event) => event.type === "interview_scheduled");
}

function briefStage(app, events) {
  const terminalStages = {
    offer_received: "Offer",
    offer_accepted: "Accepted",
    rejected: "Rejected",
    abandoned_no_response: "Abandoned",
  };
  const latestTerminal = applicationEvents(events, app.id)
    .filter((event) => terminalStages[event.type])
    .at(-1);
  return latestTerminal ? terminalStages[latestTerminal.type] : normalizeStage(app.stage);
}

function isFinalBriefOutcome(stage) {
  return ["Accepted", "Rejected", "Abandoned"].includes(stage);
}

function deterministicSeniority(value) {
  const title = normalizedBriefText(value).toLowerCase();
  const levels = [
    ["Executive", /\b(?:chief|vice president|vp)\b/],
    ["Director", /\bdirector\b/],
    ["Principal", /\bprincipal\b/],
    ["Staff", /\bstaff\b/],
    ["Senior", /\bsenior\b/],
    ["Lead", /\blead\b/],
    ["Manager", /\bmanager\b/],
    ["Junior", /\b(?:junior|associate|intern)\b/],
  ];
  return levels.find(([, pattern]) => pattern.test(title))?.[0] || "";
}

function briefInterviewSequence(app, events) {
  const interviews = interviewEventsForBrief(events, app.id);
  const milestones = [];
  const submittedOn = dateOnly(applicationStartDate(app));
  if (submittedOn) milestones.push(`Submitted (${submittedOn})`);
  interviews.forEach((event, index) => {
    const milestone = dateOnly(event.scheduledFor) || dateOnly(event.occurredAt);
    if (milestone) milestones.push(`Interview ${index + 1} (${milestone})`);
  });
  const terminal = applicationEvents(events, app.id)
    .filter((event) => ["offer_received", "offer_accepted", "rejected", "abandoned_no_response"].includes(event.type))
    .at(-1);
  const stage = briefStage(app, events);
  if (terminal && dateOnly(terminal.occurredAt)) milestones.push(`${stage} (${dateOnly(terminal.occurredAt)})`);
  else milestones.push(stage);
  return milestones.join(" → ");
}

function rejectionTimingDistribution(applications, events) {
  const counts = { "Before interview": 0, "After Interview 1": 0, "After Interview 2": 0, "After Interview 3+": 0 };
  applications.filter((app) => briefStage(app, events) === "Rejected").forEach((app) => {
    const rejection = applicationEvents(events, app.id).filter((event) => event.type === "rejected").at(-1);
    const interviewCount = interviewEventsForBrief(events, app.id)
      .filter((event) => !rejection || dateOnly(event.occurredAt) <= dateOnly(rejection.occurredAt)).length;
    if (interviewCount === 0) counts["Before interview"] += 1;
    else if (interviewCount === 1) counts["After Interview 1"] += 1;
    else if (interviewCount === 2) counts["After Interview 2"] += 1;
    else counts["After Interview 3+"] += 1;
  });
  return counts;
}

function createSanitizedBrief(applications = state.applications, events = state.events, exportedAt = new Date()) {
  const apps = applications.slice();
  const dates = apps.map(applicationStartDate).filter(Boolean).sort();
  const total = apps.length;
  const pathCounts = countValues(apps.map(sanitizedApplicationPath));
  const stages = countValues(apps.map((app) => briefStage(app, events)));
  const rejected = apps.filter((app) => briefStage(app, events) === "Rejected").length;
  const abandoned = apps.filter((app) => briefStage(app, events) === "Abandoned").length;
  const unresolved = apps.filter((app) => !isFinalBriefOutcome(briefStage(app, events)));
  const ageBuckets = { "0-14 days": 0, "15-30 days": 0, "31-60 days": 0, "61-90 days": 0, "More than 90 days": 0 };
  unresolved.forEach((app) => {
    const age = Math.max(0, daysSince(applicationStartDate(app)));
    if (age <= 14) ageBuckets["0-14 days"] += 1;
    else if (age <= 30) ageBuckets["15-30 days"] += 1;
    else if (age <= 60) ageBuckets["31-60 days"] += 1;
    else if (age <= 90) ageBuckets["61-90 days"] += 1;
    else ageBuckets["More than 90 days"] += 1;
  });
  const monthly = countValues(dates.map((date) => date.slice(0, 7)));
  const workModes = countValues(apps.map((app) => sanitizedWorkMode(app.workMode)));
  const seniority = countValues(apps.map((app) => deterministicSeniority(app.jobTitle)).filter(Boolean));
  const withInterviews = apps.filter((app) => interviewEventsForBrief(events, app.id).length > 0);
  const olderThanThirty = apps.filter((app) => daysSince(applicationStartDate(app)) > 30);
  const olderThanThirtyInterviews = olderThanThirty.filter((app) => interviewEventsForBrief(events, app.id).length > 0);
  const beyondFirst = apps.filter((app) => interviewEventsForBrief(events, app.id).length > 1).length;
  const reachedThird = apps.filter((app) => interviewEventsForBrief(events, app.id).length >= 3).length;
  const offers = apps.filter((app) => ["Offer", "Accepted"].includes(briefStage(app, events)) || applicationEvents(events, app.id).some((event) => event.type === "offer_received")).length;
  const percentage = (part, whole) => whole ? `${((part / whole) * 100).toFixed(1)}%` : "0.0%";
  const lines = [
    "# Job Flow sanitized brief",
    "",
    `Export date: ${toDateInput(exportedAt)}`,
    "",
    "## Scope",
    "",
    `- Total application submission records: ${total}`,
    `- Application date range: ${dates.length ? `${dates[0]} to ${dates.at(-1)}` : "No submission dates recorded"}`,
    "- Application counts are submission records and have not been deduplicated.",
    "",
    "## Submission trends",
    "",
    "### Monthly application counts",
    formatBriefCounts(monthly),
    "",
    "### Application routes",
    formatBriefCounts(pathCounts, (path) => path[0].toUpperCase() + path.slice(1)),
    "",
    "### Work modes",
    formatBriefCounts(workModes),
    "",
    "### Deterministic seniority signals",
    formatBriefCounts(seniority),
    "",
    "## Outcomes and current status",
    "",
    formatBriefCounts(stages),
    `- Rejected: ${rejected} (${percentage(rejected, total)})`,
    `- Abandoned without a later terminal outcome: ${abandoned}`,
    `- Unresolved: ${unresolved.length}`,
    "",
    "### Unresolved age buckets",
    formatBriefCounts(ageBuckets),
    "",
    "## Interview conversion",
    "",
    `- Unique applications with interviews: ${withInterviews.length}`,
    `- Application-to-interview conversion: ${percentage(withInterviews.length, total)}`,
    `- Applications older than 30 days: ${olderThanThirty.length}`,
    `- Interview conversion for applications older than 30 days: ${percentage(olderThanThirtyInterviews.length, olderThanThirty.length)}`,
    `- Advanced beyond Interview 1: ${beyondFirst}`,
    `- Reached Interview 3 or later: ${reachedThird}`,
    `- Offers: ${offers}`,
    "",
    "## Rejection timing",
    "",
    formatBriefCounts(rejectionTimingDistribution(apps, events)),
    "",
    "## Interview processes",
    "",
  ];

  if (!withInterviews.length) {
    lines.push("- No interview processes recorded.");
  } else {
    withInterviews
      .sort((left, right) => normalizedBriefText(left.companyName).localeCompare(normalizedBriefText(right.companyName)))
      .forEach((app) => {
        lines.push(`- ${normalizedBriefText(app.companyName)} — ${normalizedBriefText(app.jobTitle)}: ${briefInterviewSequence(app, events)}`);
      });
  }

  return lines.join("\n");
}

function assertSanitizedBrief(brief, applications = state.applications) {
  const unsafePatterns = [
    /@/,
    /http:\/\//i,
    /https:\/\//i,
    /\/Users\//,
    /file:\/\//i,
    /(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}/,
  ];
  if (unsafePatterns.some((pattern) => pattern.test(brief))) {
    throw new Error("The sanitized brief failed its privacy guard.");
  }
  const rawContactValues = applications.flatMap((app) => [
    app.candidateName, app.candidateEmail, app.candidatePhone, app.referrerName,
    app.referrerContact, app.headhunterName, app.headhunterContact,
  ]).map(normalizedBriefText).filter(Boolean);
  if (rawContactValues.some((value) => brief.includes(value))) {
    throw new Error("The sanitized brief contains a raw contact value.");
  }
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(text, filename, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    alert("That file is not valid JSON.");
    return;
  }

  if (!Array.isArray(payload.applications) || !Array.isArray(payload.events)) {
    if (payload.format === "jobflow-analysis-export" || payload.format === "jobflow-sanitized-brief") {
      alert("Sanitized briefs are designed for analysis and cannot restore the tracker. Choose a private backup JSON file instead.");
      return;
    }
    alert("This JSON file does not look like a tracker backup.");
    return;
  }

  if (!confirm("Importing will replace the current local tracker data.")) return;

  await api("/import", {
    method: "POST",
    body: JSON.stringify({
      applications: payload.applications,
      events: payload.events,
    }),
  });

  await loadAll();
  render();
}

async function handleDocumentUpload(fileInputId, nameInputId, pathInputId) {
  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];
  if (!file) return;

  const nameInput = document.getElementById(nameInputId);
  const pathInput = document.getElementById(pathInputId);
  const originalPlaceholder = pathInput.placeholder;
  pathInput.placeholder = "Saving selected file...";

  try {
    const uploaded = await uploadFile(file);
    if (!nameInput.value.trim()) {
      nameInput.value = file.name.replace(/\.[^.]+$/, "");
    }
    pathInput.value = uploaded.storedPath;
  } catch (error) {
    alert("The file could not be saved. Please try again.");
    console.error(error);
  } finally {
    pathInput.placeholder = originalPlaceholder;
  }
}

async function uploadFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return api("/files", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      data: btoa(binary),
    }),
  });
}
