// Primary view rendering and reusable UI fragments.

function render() {
  document.body.classList.toggle("flow-map-mode", state.activeView === "flow-map");
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });

  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
  document.getElementById(`${state.activeView}View`).classList.add("active-view");

  renderDashboard();
  renderApplications();
  renderReminders();
  renderAnalytics();
  renderFlowMap();
  renderGuide();
  renderSettings();
}

function renderDashboard() {
  const active = state.applications.filter((app) => !isClosed(applicationStage(app)));
  const remindersDue = dueTasks().length;
  const interviewEvents = state.events.filter((event) => ["interview_scheduled", "interview_completed"].includes(event.type));
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
  const stageOptions = ["All", ...stageOrder].map((stage) => {
    const selected = stage === state.stageFilter ? "selected" : "";
    return `<option ${selected}>${stage}</option>`;
  }).join("");

  document.getElementById("applicationsView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Pipeline</p>
        <h2>Applications</h2>
        ${state.applicationFilterLabel ? `<p class="meta" id="applicationFilterLabel"><span>${escapeHtml(state.applicationFilterLabel)}</span><button class="mini-button" id="clearApplicationFilter">Clear</button></p>` : ""}
      </div>
      <div class="toolbar">
        <input class="search-input" id="searchInput" placeholder="Search company or role" value="${escapeHtml(state.search)}" />
        <select id="stageFilter">${stageOptions}</select>
      </div>
    </div>
    <div class="application-list" id="applicationResults">
      ${applicationListMarkup()}
    </div>
  `;

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.applicationIdsFilter = null;
    state.applicationFilterLabel = "";
    document.getElementById("applicationFilterLabel")?.remove();
    replaceHistoryState();
    renderApplicationResults();
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

function applicationListMarkup() {
  const applications = filteredApplications();
  return applications.length
    ? applications.map(renderApplicationCard).join("")
    : `<p class="empty">No applications match this view.</p>`;
}

function renderApplicationResults() {
  const results = document.getElementById("applicationResults");
  if (!results) return;
  results.innerHTML = applicationListMarkup();
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
        ` : `
          <label>
            Authentication code
            <input
              id="authTotp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="6-digit code"
            />
          </label>
        `}
        <p class="auth-hint">
          ${isSetup
            ? `Use at least ${PASSWORD_MIN_LENGTH} characters. A memorable passphrase is perfect here.`
            : "Enter your passphrase and the 6-digit code from your authenticator app."}
        </p>
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
    if (isSetup) {
      const result = await setupAuth(password);
      state.auth = result;
      // First-run two-factor enrollment must happen before the tracker loads.
      if (result?.twoFactor) {
        renderTwoFactorEnrollment(result.twoFactor);
        return;
      }
      await startAuthenticatedApp();
      return;
    }

    const totpCode = (document.getElementById("authTotp").value || "").trim();
    const result = await loginAuth(password, totpCode);
    state.auth = result;
    // Operators upgrading from a pre-2FA build are enrolled on first unlock and
    // get the one-time enrollment screen instead of going straight in.
    if (result?.twoFactor) {
      renderTwoFactorEnrollment(result.twoFactor);
      return;
    }
    await startAuthenticatedApp();
  } catch (authError) {
    error.textContent = authError.message || "Could not unlock tracker.";
    error.hidden = false;
  }
}

function renderTwoFactorEnrollment(twoFactor) {
  const authView = document.getElementById("authView");
  document.body.classList.add("tracker-locked");
  document.getElementById("appShell").hidden = true;
  authView.hidden = false;
  authView.innerHTML = `
    <div class="auth-card">
      <p class="eyebrow">Zero-trust enrollment</p>
      <h1>Enroll your authenticator</h1>
      <p class="auth-copy">
        Two-factor authentication is required to unlock this tracker. Add the
        secret below to an authenticator app (1Password, Authy, Google
        Authenticator, etc.). This key is shown only once.
      </p>
      <label class="auth-2fa-field">
        Manual setup key
        <code class="auth-2fa-key">${escapeHtml(twoFactor.manualKey || "")}</code>
      </label>
      <label class="auth-2fa-field">
        otpauth URI
        <code class="auth-2fa-key">${escapeHtml(twoFactor.provisioningUri || "")}</code>
      </label>
      <p class="auth-hint">
        Future unlocks will require both your passphrase and a current
        ${twoFactor.digits || 6}-digit code.
      </p>
      <button class="primary-button" id="twoFactorContinue" type="button">I've saved it — continue</button>
    </div>
  `;
  document.getElementById("twoFactorContinue").addEventListener("click", async () => {
    await startAuthenticatedApp();
  });
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

function renderGuide() {
  document.getElementById("guideView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Start here</p>
        <h2>How to use Job Flow</h2>
        <p class="page-copy">A practical guide to recording your search without losing the history behind it.</p>
      </div>
    </div>

    <section class="panel guide-hero">
      <div>
        <p class="eyebrow">Simple workflow</p>
        <h3>Track the application, then record what actually happens.</h3>
        <p>Create an application once. From there, use activities for submissions, replies, interviews, offers, and outcomes. The dashboard, next actions, timelines, and Flow map update from those records.</p>
      </div>
      <ol class="guide-steps" aria-label="Recommended workflow">
        <li><strong>Add</strong><span>Create the application and choose its path.</span></li>
        <li><strong>Record</strong><span>Add activities as each real step happens.</span></li>
        <li><strong>Act</strong><span>Use Next Actions to keep follow-ups visible.</span></li>
        <li><strong>Review</strong><span>Use Analytics to understand the overall pipeline.</span></li>
      </ol>
    </section>

    <div class="guide-grid">
      <section class="panel guide-card">
        <p class="guide-number">1</p>
        <h3>Add an application</h3>
        <p>Select <strong>+ Application</strong> and enter the company, role, location, application path, and optional salary range. Add a referral or recruiter only when one was actually involved.</p>
        <p>Use the documents section to keep the resume, cover letter, portfolio, and tailoring notes associated with that application.</p>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">2</p>
        <h3>Use activities as the record of truth</h3>
        <p>Open an application’s <strong>Activity</strong> button whenever something happens. Choose the closest event, add its date, and include context in Details when it will help you later.</p>
        <ul class="guide-list">
          <li><strong>Application submitted:</strong> use when you actually submit.</li>
          <li><strong>Follow-up sent / replies:</strong> use for genuine outreach and responses.</li>
          <li><strong>Rejected, abandoned, or offer accepted:</strong> use when the outcome is known.</li>
          <li><strong>Note added:</strong> use for information that does not change the process.</li>
        </ul>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">3</p>
        <h3>Record interviews correctly</h3>
        <p>Choose <strong>Interview scheduled</strong>, then fill in both <strong>Scheduled on</strong> (when you learned about it) and <strong>Interview takes place on</strong> (the actual planned date). Add a separate <strong>Interview completed</strong> activity once it happens.</p>
        <p>If an interview moves, edit the scheduled activity and change only <strong>Interview takes place on</strong>. The dialog changes to <strong>Reschedule interview</strong>, explains the move before saving, and adds a history entry with the old and new dates. It does not create a second interview round in the Flow map.</p>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">4</p>
        <h3>Stay on top of next actions</h3>
        <p>Use <strong>Next Action</strong> on an application to create a reminder with a due date and priority. Some useful activities also create a follow-up automatically, so check the <strong>Next Actions</strong> page regularly.</p>
        <p>When the task is done, mark it complete and record the communication method and any useful notes.</p>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">5</p>
        <h3>Find and review applications</h3>
        <p>On <strong>Applications</strong>, search by company or role and filter by stage. Open <strong>Details</strong> to review the timeline, documents, notes, and upcoming actions for one application.</p>
        <p>The Dashboard highlights active, stale, and interview-related applications. Click a dashboard number to open the matching applications list.</p>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">6</p>
        <h3>Use Analytics and the Flow map</h3>
        <p>Analytics summarizes stages, sources, salary ranges, document coverage, and individual application timelines. Open the full Flow map for a visual route through the process.</p>
        <ul class="guide-list">
          <li><strong>Fit to one page:</strong> best for sharing or saving one complete image.</li>
          <li><strong>Scrollable review:</strong> best for examining a dense pipeline in detail.</li>
          <li><strong>Company aliases:</strong> replaces company and role details with generated labels for safer sharing.</li>
        </ul>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">7</p>
        <h3>Back up your tracker</h3>
        <p>Open <strong>Data</strong> and export JSON periodically. This saves applications, activities, and next actions. Importing a backup replaces the current tracker data, so export first if there is anything you may want to keep.</p>
        <p>Uploaded document files and your unlock settings are not included in the JSON backup.</p>
      </section>

      <section class="panel guide-card">
        <p class="guide-number">8</p>
        <h3>Keep your data private</h3>
        <p>Job Flow is local to your computer. Use <strong>Lock</strong> when stepping away, do not share raw backups, and use Company aliases before sharing a Flow-map image publicly.</p>
      </section>
    </div>

    <section class="panel guide-reference">
      <p class="eyebrow">Detailed reference</p>
      <h3>Everyday questions, answered</h3>

      <details open>
        <summary>Activity reference: when should I choose each option?</summary>
        <div class="guide-table-wrapper">
          <table class="guide-table">
            <thead><tr><th>Activity</th><th>Use it when</th><th>What it changes</th></tr></thead>
            <tbody>
              <tr><th>Application submitted</th><td>You have applied for the role.</td><td>Establishes the application timeline and can create a seven-day follow-up reminder.</td></tr>
              <tr><th>Follow-up sent</th><td>You send a check-in after applying or after a conversation.</td><td>Records the outreach and can create a seven-day reminder.</td></tr>
              <tr><th>Recruiter replied</th><td>A recruiter responds.</td><td>Records the response and can create a five-day next action.</td></tr>
              <tr><th>Internal Contact Replied</th><td>A referrer, hiring contact, or employee responds.</td><td>Records the response and can create a five-day next action.</td></tr>
              <tr><th>Interview scheduled</th><td>An interview has been arranged.</td><td>Adds the next numbered interview to the Flow map using its planned date.</td></tr>
              <tr><th>Interview completed</th><td>The interview has taken place.</td><td>Records the completed conversation and can create a next-day thank-you reminder.</td></tr>
              <tr><th>Thank-you sent</th><td>You send a thank-you note.</td><td>Keeps that outreach in the timeline.</td></tr>
              <tr><th>Offer received / accepted</th><td>You receive an offer or decide to accept it.</td><td>Marks the process as Offer or Accepted.</td></tr>
              <tr><th>Rejected / Abandoned</th><td>The employer declines, or the process has genuinely gone cold.</td><td>Closes the application and updates the Flow-map outcome.</td></tr>
              <tr><th>Note added</th><td>You want to preserve context without claiming a process step happened.</td><td>Records information only.</td></tr>
            </tbody>
          </table>
        </div>
      </details>

      <details>
        <summary>How dates, stages, corrections, and reschedules work</summary>
        <div class="guide-detail-copy">
          <p>New applications create one Application submitted activity using the day they are saved. Add applications when you apply, or edit that activity to the true submission date afterward.</p>
          <p>The Stage field is a quick current-status label. A recorded offer, acceptance, rejection, or abandonment is more authoritative and closes the application accordingly.</p>
          <p>Use <strong>Edit</strong> beside an activity to correct its date or details. Deleting an activity cannot be undone. When an Interview scheduled date changes, Job Flow preserves the move as a read-only reschedule entry. To correct it again, edit the original scheduled interview; this adds another clear date-change record rather than hiding history.</p>
        </div>
      </details>

      <details>
        <summary>Automatic reminders and Next Actions</summary>
        <div class="guide-detail-copy">
          <p>Job Flow creates an automatic reminder only when the application remains open and it does not already have an open automatic reminder. It schedules follow-up seven days after an application submission or follow-up, five days after a recruiter or internal contact reply, and a thank-you reminder one day after an interview is completed.</p>
          <p>Manual Next Actions are separate. Use them for preparation, deadlines, or any follow-up that needs a specific date. When completing a task, record the contact method and notes so the result stays with the application history.</p>
        </div>
      </details>

      <details>
        <summary>How to read Analytics and application timelines</summary>
        <div class="guide-detail-copy">
          <p>Choose a segment to group applications by Stage, application path, work mode, or document tailoring. The date range includes an application when its creation, an activity, or a next action falls inside the range.</p>
          <p>Outcome totals count applications, not every event. <strong>Interview scheduled</strong> means an interview was arranged; <strong>Interviewed</strong> means it was completed or the process is at a later stage.</p>
          <p>Application timelines are per-application routes. Scheduled interviews use the planned interview date. Completed interviews remain in the written activity timeline so the route stays readable.</p>
        </div>
      </details>

      <details>
        <summary>How to read and share the Flow map</summary>
        <div class="guide-detail-copy">
          <p>Each path represents one application. Interview boxes are numbered in order for that application. A process that is rejected or abandoned after interviews keeps its own route to that outcome.</p>
          <p>Use <strong>Fit to one page</strong> for a complete screenshot, printout, or presentation. Use <strong>Scrollable review</strong> when a larger pipeline needs closer inspection.</p>
          <p>Select <strong>Company aliases</strong> before sharing publicly. It replaces company names and role titles with stable aliases within that map. Review the whole screenshot before publishing: privacy mode protects the map labels, not any other content outside the map.</p>
        </div>
      </details>

      <details>
        <summary>Backups, documents, and troubleshooting</summary>
        <div class="guide-detail-copy">
          <p>Export JSON regularly from <strong>Data</strong>. Import replaces the current applications, activities, and next actions, so create a fresh export before importing anything. Uploaded document files and unlock settings are not in the JSON backup.</p>
          <p>If a search result looks wrong, clear the stage filter and search text. If analytics looks incomplete, clear its date range. If the app seems outdated after an update, reload the page. Use <strong>Lock</strong> whenever you step away from the computer.</p>
        </div>
      </details>
    </section>
  `;
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
    const label = eventDisplayLabel(event);
    const dateText = timelineDateText(event);
    const isLinked = app && !options.editable;
    const canEdit = options.editable && event.type !== "interview_rescheduled";
    const heading = isLinked ? `${app.jobTitle}` : label;
    return `
      <div class="timeline-item ${isLinked ? "timeline-link" : ""}" ${isLinked ? `data-application-link="${app.id}"` : ""}>
        <div class="timeline-item-header">
          <div>
            <h3>${escapeHtml(heading)}</h3>
            ${isLinked ? `
              <div class="recent-activity-meta">
                <span class="employer-badge">${escapeHtml(app.companyName)}</span>
                <span class="activity-status-chip">${escapeHtml(label)} - ${escapeHtml(dateText)}</span>
              </div>
            ` : `<p class="timeline-date">${escapeHtml(dateText)}</p>`}
          </div>
          ${canEdit ? `
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

function timelineDateText(event) {
  if (event.type === "interview_scheduled" && event.scheduledFor) {
    return `Scheduled ${formatDate(event.occurredAt)} · Interview ${formatDate(event.scheduledFor)}`;
  }
  return formatDate(event.occurredAt);
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
