// Primary view rendering and reusable UI fragments.

function render() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });

  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
  document.getElementById(`${state.activeView}View`).classList.add("active-view");

  renderDashboard();
  renderApplications();
  renderReminders();
  renderAnalytics();
  renderSettings();
}

function renderDashboard() {
  const active = state.applications.filter((app) => !isClosed(applicationStage(app)));
  const remindersDue = dueTasks().length;
  const interviewEvents = state.events.filter((event) => event.type.includes("interview"));
  const interviews = interviewEvents.length;
  const stale = active.filter((app) => daysSince(lastActivityDate(app.id)) >= STALE_AFTER_DAYS).length;

  document.getElementById("dashboardView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Overview</p>
        <h2>Pipeline dashboard</h2>
      </div>
    </div>
    <div class="stats-grid">
      ${dashboardStatCard(active.length, "Active applications", "active")}
      ${dashboardStatCard(remindersDue, "Due follow-ups", "reminders")}
      ${dashboardStatCard(interviews, "Interview events", "interviews")}
      ${dashboardStatCard(stale, "Stale applications", "stale")}
    </div>
    <div class="layout-grid">
      <div class="panel">
        <h3>Needs attention</h3>
        <div class="application-list">
          ${renderAttentionList()}
        </div>
      </div>
      <div class="panel">
        <h3>Recent activity</h3>
        <div class="timeline-list">
          ${renderTimeline(visibleEvents(state.events).slice(0, 8))}
        </div>
      </div>
    </div>
  `;

  bindCardActions();
  bindDashboardLinks();
}

function renderApplications() {
  const applications = filteredApplications();
  const stageOptions = ["All", ...stageOrder].map((stage) => {
    const selected = stage === state.stageFilter ? "selected" : "";
    return `<option ${selected}>${stage}</option>`;
  }).join("");

  document.getElementById("applicationsView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Pipeline</p>
        <h2>Applications</h2>
        ${state.applicationFilterLabel ? `<p class="meta"><span>${escapeHtml(state.applicationFilterLabel)}</span><button class="mini-button" id="clearApplicationFilter">Clear</button></p>` : ""}
      </div>
      <div class="toolbar">
        <input class="search-input" id="searchInput" placeholder="Search company or role" value="${escapeHtml(state.search)}" />
        <select id="stageFilter">${stageOptions}</select>
      </div>
    </div>
    <div class="application-list">
      ${applications.length ? applications.map(renderApplicationCard).join("") : `<p class="empty">No applications match this view.</p>`}
    </div>
  `;

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.applicationIdsFilter = null;
    state.applicationFilterLabel = "";
    replaceHistoryState();
    renderApplications();
  });

  document.getElementById("stageFilter").addEventListener("change", (event) => {
    state.stageFilter = event.target.value;
    state.applicationIdsFilter = null;
    state.applicationFilterLabel = "";
    pushHistoryState();
    renderApplications();
  });

  document.getElementById("clearApplicationFilter")?.addEventListener("click", () => {
    state.applicationIdsFilter = null;
    state.applicationFilterLabel = "";
    pushHistoryState();
    renderApplications();
  });

  bindCardActions();
}

function renderReminders() {
  const tasks = state.tasks.filter((task) => !task.completedAt);

  document.getElementById("remindersView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Future prompts</p>
        <h2>Next Actions</h2>
      </div>
    </div>
    <div class="reminder-list">
      ${tasks.length ? tasks.map(renderReminder).join("") : `<p class="empty">No open next actions. Excellent breathing room.</p>`}
    </div>
  `;

  document.querySelectorAll("[data-complete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleTaskCompletionButton(button);
    });
  });
}


function renderAuthGate(auth = state.auth, message = "") {
  const isSetup = !auth.configured;
  const authView = document.getElementById("authView");
  document.body.classList.add("tracker-locked");
  document.getElementById("appShell").hidden = true;
  authView.hidden = false;
  authView.innerHTML = `
    <div class="auth-card">
      <p class="eyebrow">Local security</p>
      <h1>${isSetup ? "Protect your tracker" : "Unlock Job Tracker"}</h1>
      <p class="auth-copy">
        ${isSetup
          ? "Set a local passphrase before the tracker loads your SQLite data."
          : "Your local tracker is locked. Enter your passphrase to continue."}
      </p>
      <form id="authForm" class="auth-form">
        <label>
          Passphrase
          <input
            id="authPassword"
            type="password"
            minlength="${PASSWORD_MIN_LENGTH}"
            autocomplete="${isSetup ? "new-password" : "current-password"}"
            required
          />
        </label>
        ${isSetup ? `
          <label>
            Confirm passphrase
            <input id="authPasswordConfirm" type="password" minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password" required />
          </label>
        ` : ""}
        <p class="auth-hint">Use at least ${PASSWORD_MIN_LENGTH} characters. A memorable passphrase is perfect here.</p>
        <p id="authError" class="auth-error" ${message ? "" : "hidden"}>${escapeHtml(message)}</p>
        <button class="primary-button" type="submit">${isSetup ? "Set passphrase" : "Unlock"}</button>
      </form>
    </div>
  `;

  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuthForm(isSetup);
  });
  document.getElementById("authPassword").focus();
}

async function submitAuthForm(isSetup) {
  const password = document.getElementById("authPassword").value;
  const error = document.getElementById("authError");
  error.hidden = true;
  error.textContent = "";

  if (password.length < PASSWORD_MIN_LENGTH) {
    error.textContent = `Passphrase must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    error.hidden = false;
    return;
  }

  if (isSetup && password !== document.getElementById("authPasswordConfirm").value) {
    error.textContent = "Passphrases do not match.";
    error.hidden = false;
    return;
  }

  try {
    state.auth = isSetup ? await setupAuth(password) : await loginAuth(password);
    await startAuthenticatedApp();
  } catch (authError) {
    error.textContent = authError.message || "Could not unlock tracker.";
    error.hidden = false;
  }
}


function renderSettings() {
  document.getElementById("settingsView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Portable local data</p>
        <h2>Data</h2>
      </div>
    </div>
    <div class="panel">
      <p>Your tracker is persisted locally in SQLite at <strong>data/job-tracker.sqlite</strong>. Export a JSON backup whenever you want a portable copy.</p>
      <div class="data-actions">
        <button class="data-button export-button" id="exportButton" type="button">Export JSON</button>
        <button class="data-button import-button" id="importButton" type="button">Import JSON</button>
        <span
          class="data-format-help"
          tabindex="0"
          aria-label="Required JSON format"
          data-tooltip='Required JSON: { "applications": [...], "events": [...], "tasks": [...] }. Optional: "exportedAt". Import replaces current local data.'
        >?</span>
        <input id="importInput" type="file" accept="application/json" hidden />
      </div>
    </div>
  `;

  document.getElementById("exportButton").addEventListener("click", exportData);
  document.getElementById("importButton").addEventListener("click", () => document.getElementById("importInput").click());
  document.getElementById("importInput").addEventListener("change", importData);
}

function renderApplicationCard(app) {
  const appEvents = visibleEvents(eventsFor(app.id));
  const lastDate = lastActivityDate(app.id);
  const applied = firstEventDate(app.id, "application_submitted");
  const ageText = applied ? `${daysSince(applied)} days since applied` : `${daysSince(app.createdAt)} days since saved`;
  const displayedStage = applicationStage(app);
  const stale = !isClosed(displayedStage) && daysSince(lastDate) >= STALE_AFTER_DAYS;
  const pathDetail = renderApplicationPathDetail(app);
  const documentSummary = renderDocumentSummary(app);
  const salaryText = formatSalaryRange(app);

  return `
    <article class="application-card ${stale ? "overdue" : ""}">
      <div class="card-top">
        <div>
          <span class="pill ${stageClass(displayedStage)}">${escapeHtml(displayedStage)}</span>
          <h3>${escapeHtml(app.jobTitle)} at ${escapeHtml(app.companyName)}</h3>
          <p class="meta">
            <span>${escapeHtml(applicationPathLabel(app))}</span>
            <span>${escapeHtml(app.workMode)}</span>
            <span>${escapeHtml(app.location || "Location TBD")}</span>
            ${salaryText ? `<span>${escapeHtml(salaryText)}</span>` : ""}
            <span>${ageText}</span>
          </p>
        </div>
        <div class="card-actions">
          <button class="mini-button" data-add-activity="${app.id}">Activity</button>
          <button class="mini-button" data-add-task="${app.id}">Next Action</button>
          <button class="mini-button" data-edit-application="${app.id}">Edit</button>
          <button class="mini-button danger-button" data-delete-application="${app.id}">Delete</button>
        </div>
      </div>
      <details class="application-details">
        <summary>Details</summary>
        <div class="details-body">
          ${pathDetail}
          ${app.notes ? `<p>${escapeHtml(app.notes)}</p>` : ""}
          ${documentSummary}
          ${renderApplicationTasks(app)}
          <div class="timeline-list activity-section">
            ${appEvents.length ? renderTimeline(appEvents.slice(0, 5), { editable: true }) : `<p class="empty">No dated activity yet.</p>`}
          </div>
        </div>
      </details>
    </article>
  `;
}

function renderReminder(task) {
  const app = state.applications.find((item) => item.id === task.applicationId);
  const overdue = new Date(task.dueAt) < startOfToday();
  return `
    <div class="reminder-row ${overdue ? "overdue" : ""}">
      <div>
        <h3>${escapeHtml(task.title)}</h3>
        <p class="meta">
          <span>Due ${formatDate(task.dueAt)}</span>
          <span>${app ? `${escapeHtml(app.jobTitle)} at ${escapeHtml(app.companyName)}` : "Application removed"}</span>
        </p>
      </div>
      <div class="task-actions">
        <button class="mini-button" data-complete-task="${task.id}" data-task-outcome="done">Done</button>
        <button class="mini-button muted-button" data-complete-task="${task.id}" data-task-outcome="unavailable">No contact</button>
      </div>
    </div>
  `;
}

function renderDocumentSummary(app) {
  const documents = [
    { label: "Resume", name: app.resumeName, path: app.resumePath },
    { label: "Cover letter", name: app.coverLetterName, path: app.coverLetterPath },
    { label: "Portfolio", name: app.portfolioPath ? "Portfolio / work sample" : "", path: app.portfolioPath },
  ].filter((item) => item.name || item.path);

  if (!documents.length && !app.documentNotes && !app.tailoredDocuments) return "";

  return `
    <div class="document-list">
      <div class="section-heading">
        <span class="pill">${app.tailoredDocuments ? "Tailored documents" : "Documents tracked"}</span>
      </div>
      ${documents.map((item) => `
        <div class="document-item">
          ${item.path
            ? `<a class="document-link" href="${fileHref(item.path)}" title="${escapeHtml(item.path)}" target="_blank" rel="noreferrer">${escapeHtml(`${item.label} - ${displayFilenameFromPath(item.path)}`)}</a>`
            : `<span class="document-link">${escapeHtml(`${item.label} - ${item.name}`)}</span>`}
        </div>
      `).join("")}
      ${app.documentNotes ? `<p class="document-notes">${escapeHtml(app.documentNotes)}</p>` : ""}
    </div>
  `;
}

function renderApplicationTasks(app) {
  const openTasks = tasksFor(app.id).filter((task) => !task.completedAt).slice(0, 3);
  if (!openTasks.length) return "";

  return `
    <div class="task-list">
      ${openTasks.map((task) => `
        <div class="task-chip ${new Date(task.dueAt) < startOfToday() ? "overdue" : ""}">
          <div>
            <strong>${escapeHtml(task.title)}</strong>
            <p class="meta">
              <span>${escapeHtml(task.type || "Next action")}</span>
              <span>Due ${formatDate(task.dueAt)}</span>
              <span>${escapeHtml(task.priority || "Normal")}</span>
            </p>
          </div>
          <div class="task-actions">
            <button class="mini-button" data-complete-task="${task.id}" data-task-outcome="done">Done</button>
            <button class="mini-button muted-button" data-complete-task="${task.id}" data-task-outcome="unavailable">No contact</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTimeline(events, options = {}) {
  if (!events.length) return `<p class="empty">No activity recorded yet.</p>`;

  return events.map((event) => {
    const app = state.applications.find((item) => item.id === event.applicationId);
    const label = event.title || eventLabels[event.type] || event.type;
    const isLinked = app && !options.editable;
    const heading = isLinked ? `${app.jobTitle}` : label;
    return `
      <div class="timeline-item ${isLinked ? "timeline-link" : ""}" ${isLinked ? `data-application-link="${app.id}"` : ""}>
        <div class="timeline-item-header">
          <div>
            <h3>${escapeHtml(heading)}</h3>
            ${isLinked ? `
              <div class="recent-activity-meta">
                <span class="employer-badge">${escapeHtml(app.companyName)}</span>
                <span class="activity-status-chip">${escapeHtml(label)} - ${formatDate(event.occurredAt)}</span>
              </div>
            ` : `<p class="timeline-date">${formatDate(event.occurredAt)}</p>`}
          </div>
          ${options.editable ? `
            <div class="timeline-item-actions">
              <button class="mini-button" data-edit-activity="${event.id}">Edit</button>
              <button class="mini-button danger-button" data-delete-activity="${event.id}">Delete</button>
            </div>
          ` : ""}
        </div>
        ${event.description ? `<p class="timeline-description">${escapeHtml(event.description)}</p>` : ""}
      </div>
    `;
  }).join("");
}

function visibleEvents(events) {
  return events.filter((event) => event.type !== "job_saved");
}

function renderAttentionList() {
  const needsAttention = state.applications
    .filter((app) => !isClosed(applicationStage(app)))
    .filter((app) => daysSince(lastActivityDate(app.id)) >= STALE_AFTER_DAYS)
    .slice(0, 5);

  if (!needsAttention.length) return `<p class="empty">Nothing stale right now.</p>`;
  return needsAttention.map(renderApplicationCard).join("");
}


function statCard(value, label) {
  return `
    <div class="stat">
      <div class="stat-value">${value}</div>
      <p class="stat-label">${label}</p>
    </div>
  `;
}

function dashboardStatCard(value, label, target) {
  return `
    <button class="stat stat-link" type="button" data-dashboard-target="${target}">
      <div class="stat-value">${value}</div>
      <p class="stat-label">${label}</p>
    </button>
  `;
}
