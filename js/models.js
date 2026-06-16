// Domain selectors and application data helpers.

function filteredApplications() {
  return state.applications.filter((app) => {
    const search = state.search.trim().toLowerCase();
    const matchesSearch = !search || `${app.companyName} ${app.jobTitle}`.toLowerCase().includes(search);
    const matchesStage = state.stageFilter === "All" || applicationStage(app) === state.stageFilter;
    const matchesIds = !state.applicationIdsFilter || state.applicationIdsFilter.includes(app.id);
    return matchesSearch && matchesStage && matchesIds;
  });
}


function compareApplicationsForList(a, b) {
  const stageA = applicationStage(a);
  const stageB = applicationStage(b);
  const statusRankA = applicationListRank(stageA);
  const statusRankB = applicationListRank(stageB);

  if (statusRankA !== statusRankB) return statusRankA - statusRankB;

  const lastA = lastActivityDate(a.id) || dateOnly(a.updatedAt) || a.createdAt || "";
  const lastB = lastActivityDate(b.id) || dateOnly(b.updatedAt) || b.createdAt || "";
  if (lastA !== lastB) return lastB.localeCompare(lastA);

  return `${a.companyName} ${a.jobTitle}`.localeCompare(`${b.companyName} ${b.jobTitle}`);
}

function applicationListRank(stage) {
  if (stage === "Abandoned") return 3;
  if (["Rejected", "Withdrawn", "Ghosted", "Offer"].includes(stage)) return 2;
  return 1;
}

function inferApplicationPath(app) {
  if (!app) return "direct";
  if (app.applicationPath) return app.applicationPath;
  if (app.referrerName) return "referral";
  if (app.headhunterName) return "headhunter";
  return "direct";
}

function applicationPathLabel(app) {
  const path = inferApplicationPath(app);
  if (path === "referral") return "Referral";
  if (path === "headhunter") return "Headhunter";
  return "Direct";
}

function salaryFieldsForApp(app) {
  if (!app) return { min: "", max: "" };
  if (app.salaryMin || app.salaryMax) {
    return {
      min: app.salaryMin || "",
      max: app.salaryMax || "",
    };
  }

  return parseSalaryRange(app.salaryRange);
}

function parseSalaryRange(value) {
  if (!value) return { min: "", max: "" };
  const matches = String(value).match(/\d+(?:\.\d+)?\s*k?/gi) || [];
  const amounts = matches.map((match) => {
    const normalized = match.toLowerCase().trim();
    const number = Number.parseFloat(normalized);
    if (Number.isNaN(number)) return "";
    return normalized.includes("k") ? Math.round(number * 1000) : Math.round(number);
  }).filter(Boolean);

  return {
    min: amounts[0] || "",
    max: amounts[1] || amounts[0] || "",
  };
}

function formatSalaryRange(app) {
  const { min, max } = salaryFieldsForApp(app);
  if (min && max && min !== max) return `${formatSalary(min)} - ${formatSalary(max)}`;
  if (min || max) return formatSalary(min || max);
  return "";
}

function formatSalary(value) {
  const number = Number(value);
  if (!number) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}

function renderApplicationPathDetail(app) {
  const path = inferApplicationPath(app);
  if (path === "referral" && app.referrerName) {
    return `
      <div class="path-detail">
        <p class="meta"><span>Referral</span><span>Referred by ${escapeHtml(app.referrerName)}</span></p>
        ${app.referrerContact ? `<a class="document-link" href="${contactHref(app.referrerContact)}" target="_blank" rel="noreferrer">${escapeHtml(app.referrerContact)}</a>` : ""}
        ${app.jobUrl ? `<a class="document-link" href="${escapeHtml(app.jobUrl)}" target="_blank" rel="noreferrer">${escapeHtml(compactUrl(app.jobUrl))}</a>` : ""}
      </div>
    `;
  }
  if (path === "headhunter" && app.headhunterName) {
    return `
      <div class="path-detail">
        <p class="meta"><span>Headhunter reached out</span><span>${escapeHtml(app.headhunterName)}</span></p>
        ${app.headhunterContact ? `<a class="document-link" href="${contactHref(app.headhunterContact)}" target="_blank" rel="noreferrer">${escapeHtml(app.headhunterContact)}</a>` : ""}
      </div>
    `;
  }
  if (path === "direct" && app.jobUrl) {
    return `
      <div class="path-detail">
        <p class="meta"><span>Direct application</span></p>
        <a class="document-link" href="${escapeHtml(app.jobUrl)}" target="_blank" rel="noreferrer">${escapeHtml(compactUrl(app.jobUrl))}</a>
      </div>
    `;
  }
  return `<p class="meta"><span>${escapeHtml(applicationPathLabel(app))}</span></p>`;
}

function eventsFor(applicationId) {
  return state.events.filter((event) => event.applicationId === applicationId);
}

function dueTasks() {
  return state.tasks.filter((task) => !task.completedAt && new Date(task.dueAt) <= endOfToday());
}

function lastActivityDate(applicationId) {
  const events = eventsFor(applicationId);
  return events[0]?.occurredAt || state.applications.find((app) => app.id === applicationId)?.createdAt || toDateInput(new Date());
}

function firstEventDate(applicationId, type) {
  const matching = eventsFor(applicationId)
    .filter((event) => event.type === type)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return matching[0]?.occurredAt || "";
}

function applicationStage(app) {
  const terminalEventStage = latestTerminalEventStage(app.id);
  return terminalEventStage || normalizeStage(app.stage);
}

function normalizeStage(stage) {
  if (!stage || stage === "Saved" || stage === "Preparing") return "Applied";
  return stage;
}

function latestTerminalEventStage(applicationId) {
  const terminalStageByEvent = {
    offer_received: "Offer",
    rejected: "Rejected",
    abandoned_no_response: "Abandoned",
  };

  const latestTerminalEvent = eventsFor(applicationId)
    .filter((event) => terminalStageByEvent[event.type])
    .sort((a, b) => `${b.occurredAt}-${b.createdAt || ""}`.localeCompare(`${a.occurredAt}-${a.createdAt || ""}`))[0];

  return latestTerminalEvent ? terminalStageByEvent[latestTerminalEvent.type] : "";
}

function applicationStartDate(app) {
  return firstEventDate(app.id, "application_submitted") || app.createdAt || toDateInput(new Date());
}

function formatAgeValue(days) {
  return days === 0 ? "Today" : days;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function submissionsByWeek(applications = state.applications, events = state.events) {
  const submittedEventAppIds = new Set(events
    .filter((event) => event.type === "application_submitted")
    .map((event) => event.applicationId));

  const eventCounts = events
    .filter((event) => event.type === "application_submitted")
    .reduce((acc, event) => {
      const date = new Date(`${event.occurredAt}T00:00:00`);
      const monday = addDays(date, -((date.getDay() + 6) % 7));
      const key = toDateInput(monday);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  applications
    .filter((app) => !submittedEventAppIds.has(app.id))
    .forEach((app) => {
      const date = new Date(`${app.createdAt}T00:00:00`);
      const monday = addDays(date, -((date.getDay() + 6) % 7));
      const key = toDateInput(monday);
      eventCounts[key] = (eventCounts[key] || 0) + 1;
    });

  return eventCounts;
}

function tasksFor(applicationId) {
  return state.tasks.filter((task) => task.applicationId === applicationId);
}

function formatShortDate(dateString) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
    .format(new Date(`${dateString}T00:00:00`));
}

function filenameFromPath(path) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function displayFilenameFromPath(path) {
  const filename = filenameFromPath(path);
  const withoutStoredPrefix = filename.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
  return withoutStoredPrefix.replace(/\.[^.]+$/, "");
}

function fileHref(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `file://${path}`;
}

function compactUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function contactHref(value) {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
  return "#";
}

function numberOrBlank(value) {
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}
