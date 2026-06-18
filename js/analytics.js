// Analytics view rendering, metrics, timelines, and SVG charts.

function renderAnalytics() {
  const apps = analyticsApplications();
  const events = analyticsEvents(apps);
  const tasks = analyticsTasks(apps);
  const segmentCounts = countApplicationsBySegment(apps, state.analyticsSegment);
  const conversion = conversionMetrics(apps, events);
  const stale = apps.filter((app) => !isClosed(applicationStage(app)) && daysSince(lastActivityDate(app.id)) >= STALE_AFTER_DAYS).length;
  const withAnyDocs = apps.filter((app) => hasAnyDocument(app)).length;
  const withResume = apps.filter((app) => app.resumeName || app.resumePath).length;
  const withCoverLetter = apps.filter((app) => app.coverLetterName || app.coverLetterPath).length;
  const missingDocs = apps.filter((app) => !hasAnyDocument(app)).length;
  const tailoredDocs = apps.filter((app) => app.tailoredDocuments).length;
  const openTasks = tasks.filter((task) => !task.completedAt).length;
  const overdueTasks = tasks.filter((task) => !task.completedAt && new Date(task.dueAt) < startOfToday()).length;
  const cadence = pipelineCadenceMetrics(apps);
  const salary = salaryAnalytics(apps);

  document.getElementById("analyticsView").innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Dates become signal</p>
        <h2>Analytics</h2>
      </div>
    </div>
    <div class="panel analytics-filter-panel">
      <div class="analytics-controls">
        <label>
          Segment
          <select id="analyticsSegment">
            ${["stage", "path", "workMode", "tailored"].map((segment) => `<option value="${segment}" ${segment === state.analyticsSegment ? "selected" : ""}>${analyticsSegmentLabel(segment)}</option>`).join("")}
          </select>
        </label>
        <label>
          From
          <input id="analyticsFrom" type="date" value="${escapeHtml(state.analyticsFrom)}" />
        </label>
        <label>
          To
          <input id="analyticsTo" type="date" value="${escapeHtml(state.analyticsTo)}" />
        </label>
        <label>
          Chart
          <select id="analyticsChart">
            <option value="bars" ${state.analyticsChart === "bars" ? "selected" : ""}>Bars</option>
            <option value="donut" ${state.analyticsChart === "donut" ? "selected" : ""}>Donut</option>
            <option value="flow" ${state.analyticsChart === "flow" ? "selected" : ""}>Flow</option>
          </select>
        </label>
      </div>
    </div>
    <div class="layout-grid analytics-grid">
      <div class="panel">
        <h3>${analyticsChartTitle()}</h3>
        <div class="chart">${renderSelectedChart(segmentCounts, apps)}</div>
      </div>
      <div class="panel">
        <h3>Totals</h3>
        <div class="stats-grid">
          ${statCard(apps.length, "Applications")}
          ${statCard(events.length, "Activities")}
          ${statCard(openTasks, "Open next actions")}
          ${statCard(overdueTasks, "Overdue next actions")}
        </div>
      </div>
      <div class="panel">
        <h3>Outcomes</h3>
        <div class="stats-grid">
          ${statCard(conversion.applied, "Submitted")}
          ${statCard(conversion.interviewed, "Interviewed")}
          ${statCard(conversion.offers, "Offers")}
          ${statCard(conversion.rejected, "Rejected")}
          ${statCard(conversion.abandoned, "Abandoned")}
          ${statCard(conversion.withdrawn, "Withdrawn")}
        </div>
      </div>
      <div class="panel">
        <h3>Age metrics</h3>
        ${renderAgeMetrics(apps)}
      </div>
      <div class="panel">
        <h3>Salary</h3>
        ${renderSalaryAnalytics(salary)}
      </div>
      <div class="panel">
        <h3>Action cadence</h3>
        ${renderCadenceMetrics(cadence)}
      </div>
      <div class="panel panel-wide">
        <h3>Application timelines</h3>
        ${renderApplicationDurationBreakdown(apps)}
      </div>
      <div class="panel panel-wide document-coverage-panel">
        <h3>Document coverage</h3>
        <div class="stats-grid document-coverage-grid">
          ${statCard(withAnyDocs, "With documents")}
          ${statCard(withResume, "Resume tracked")}
          ${statCard(withCoverLetter, "Cover letter tracked")}
          ${statCard(tailoredDocs, "Marked tailored")}
          ${statCard(missingDocs, "Missing documents")}
          ${statCard(stale, "Stale active apps")}
        </div>
      </div>
      <div class="panel panel-wide">
        <h3>Submissions by week</h3>
        <div class="chart">${renderLineChart(submissionsByWeek(apps, events))}</div>
      </div>
    </div>
  `;

  bindAnalyticsControls();
}

function renderBars(counts, max) {
  const entries = Object.entries(counts);
  if (!entries.length) return `<p class="empty">No data yet.</p>`;

  return entries.map(([label, value]) => `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width: ${(value / max) * 100}%"></div></div>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderAgeMetrics(applications = state.applications) {
  const active = applications.filter((app) => !isClosed(applicationStage(app)));
  if (!active.length) return `<p class="empty">No active applications yet.</p>`;

  const activeAges = active.map((app) => daysSince(applicationStartDate(app)));
  const silenceAges = active.map((app) => daysSince(lastActivityDate(app.id)));
  const averageAge = Math.round(activeAges.reduce((sum, age) => sum + age, 0) / activeAges.length);
  const oldestActive = Math.max(...activeAges);
  const averageSilence = Math.round(silenceAges.reduce((sum, age) => sum + age, 0) / silenceAges.length);
  const longestSilence = Math.max(...silenceAges);

  return `
    <div class="stats-grid">
      ${statCard(active.length, "Active applications")}
      ${statCard(formatAgeValue(averageAge), "Avg age")}
      ${statCard(formatAgeValue(oldestActive), "Oldest active")}
      ${statCard(formatAgeValue(averageSilence), "Avg since action")}
      ${statCard(formatAgeValue(longestSilence), "Longest silence")}
    </div>
  `;
}

function renderCadenceMetrics(cadence) {
  if (!cadence.transitions.length) {
    return `<p class="empty">Add more dated actions to calculate cadence.</p>`;
  }

  return `
    <div class="stats-grid">
      ${statCard(formatAgeValue(cadence.averageGap), "Avg between actions")}
      ${statCard(formatAgeValue(cadence.fastestGap), "Fastest gap")}
      ${statCard(formatAgeValue(cadence.slowestGap), "Slowest gap")}
    </div>
  `;
}

function renderSalaryAnalytics(salary) {
  if (!salary.count) return `<p class="empty">No structured salary data yet.</p>`;

  return `
    <div class="stats-grid">
      ${statCard(formatSalary(salary.averageMin), "Avg minimum")}
      ${statCard(formatSalary(salary.averageMax), "Avg maximum")}
      ${statCard(formatSalary(salary.highestMax), "Highest maximum")}
      ${statCard(salary.count, "With salary")}
    </div>
  `;
}

function renderApplicationDurationBreakdown(applications) {
  const allRows = applications
    .filter(matchesTimelineStatusFilter)
    .map(applicationTimelineGraphRow)
    .filter((row) => row.points.length)
    .sort((a, b) => b.submittedDate.localeCompare(a.submittedDate));
  const maxPage = Math.max(0, Math.ceil(allRows.length / TIMELINE_PAGE_SIZE) - 1);
  if (state.timelinePage > maxPage) state.timelinePage = maxPage;

  const pageStart = state.timelinePage * TIMELINE_PAGE_SIZE;
  const rows = allRows.slice(pageStart, pageStart + TIMELINE_PAGE_SIZE);

  const hasRows = Boolean(rows.length);
  const today = toDateInput(new Date());

  return `
    ${renderTimelineStatusFilter(allRows.length)}
    ${hasRows ? `<div class="timeline-graph-list">
      ${rows.map((row) => {
        const timelineStart = row.submittedDate || today;
        const timelineEnd = today;
        return `
        <div
          class="timeline-graph-row timeline-row-link"
          role="button"
          tabindex="0"
          data-timeline-application="${escapeHtml(row.app.id)}"
          aria-label="${escapeHtml(`Open ${row.app.companyName} ${row.app.jobTitle}`)}"
        >
          <div class="timeline-row-summary">
            <h3>${escapeHtml(row.app.jobTitle)}</h3>
            <p class="timeline-row-meta">
              <span class="employer-badge">${escapeHtml(row.app.companyName)}</span>
              <span class="timeline-status-pill ${stageClass(applicationStage(row.app))}">${escapeHtml(flowOutcomeLabel(applicationStage(row.app)))}</span>
            </p>
            <p class="timeline-row-date">Submitted ${formatDate(row.submittedDate)}</p>
            ${row.nextActionDate ? `<p class="timeline-row-date">Next action ${formatDate(row.nextActionDate)}</p>` : ""}
          </div>
          <div class="timeline-graph">
            <div class="timeline-axis">
              <span>Submitted ${formatShortDate(timelineStart)}</span>
              <span>Today ${formatShortDate(timelineEnd)}</span>
            </div>
            <div class="timeline-track" aria-label="${escapeHtml(`${row.app.jobTitle} timeline`)}">
              ${row.points.map((point, index) => renderTimelineMarker(point, timelineStart, timelineEnd, index)).join("")}
            </div>
          </div>
        </div>
      `;
      }).join("")}
    </div>` : `<p class="empty">No dated application timeline data for this status yet.</p>`}
    ${renderTimelinePagination(allRows.length, pageStart, rows.length)}
  `;
}

function renderTimelinePagination(total, pageStart, visibleCount) {
  if (total <= TIMELINE_PAGE_SIZE) return "";

  const pageEnd = pageStart + visibleCount;
  const hasPrevious = state.timelinePage > 0;
  const hasNext = pageEnd < total;

  return `
    <div class="timeline-pagination">
      <p>Showing ${pageStart + 1}-${pageEnd} of ${total}</p>
      <div class="timeline-pagination-actions">
        ${hasPrevious ? `<button type="button" class="mini-button" data-timeline-page="previous">Previous</button>` : ""}
        ${hasNext ? `<button type="button" class="mini-button" data-timeline-page="next">Next</button>` : ""}
      </div>
    </div>
  `;
}

function renderTimelineStatusFilter(count) {
  const options = [
    ["all", "All"],
    ["in-progress", "In Progress"],
    ["rejected", "Rejected"],
    ["abandoned", "Abandoned"],
  ];

  return `
    <div class="timeline-filter-bar">
      <div class="timeline-filter" role="group" aria-label="Timeline status filter">
        ${options.map(([value, label]) => `
          <button
            type="button"
            class="timeline-filter-button ${state.timelineStatusFilter === value ? "active" : ""}"
            data-timeline-filter="${value}"
            aria-pressed="${state.timelineStatusFilter === value}"
          >
            ${label}
          </button>
        `).join("")}
      </div>
      <p>${count} ${count === 1 ? "application" : "applications"}</p>
    </div>
  `;
}

function matchesTimelineStatusFilter(app) {
  const stage = applicationStage(app);
  if (state.timelineStatusFilter === "in-progress") return !isClosed(stage);
  if (state.timelineStatusFilter === "rejected") return stage === "Rejected";
  if (state.timelineStatusFilter === "abandoned") return stage === "Abandoned";
  return true;
}

function applicationTimelineGraphRow(app) {
  const points = applicationTimelineGraphPoints(app);
  const submittedPoint = points.find((point) => point.kind === "submitted") || points[0];
  const nextActionPoint = points.find((point) => point.kind === "next-action");

  return {
    app,
    points,
    submittedDate: submittedPoint?.date || dateOnly(app.createdAt),
    nextActionDate: nextActionPoint?.date || "",
  };
}

function applicationTimelineGraphPoints(app) {
  const points = [];
  const submittedDate = firstEventDate(app.id, "application_submitted") || dateOnly(app.createdAt);
  if (submittedDate) {
    points.push({
      label: "Submitted",
      date: submittedDate,
      kind: "submitted",
      sortKey: `${submittedDate}T00:00:00.000Z`,
    });
  }

  visibleEvents(eventsFor(app.id))
    .filter((event) => event.type !== "application_submitted")
    .forEach((event) => {
      const date = dateOnly(event.occurredAt);
      points.push({
        label: shortTimelineLabel(eventDisplayLabel(event)),
        date,
        kind: timelineKindForEvent(event.type),
        sortKey: `${date}T01:00:00.000Z-${event.createdAt || ""}`,
      });
    });

  tasksFor(app.id).forEach((task) => {
    const isComplete = Boolean(task.completedAt);
    const date = dateOnly(isComplete ? task.completedAt : task.dueAt);
    points.push({
      label: isComplete ? "Action done" : "Next action",
      date,
      kind: isComplete ? "completed-action" : "next-action",
      sortKey: `${date}T02:00:00.000Z-${task.completedAt || task.dueAt || ""}`,
    });
  });

  return points
    .filter((point) => point.date)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function renderTimelineMarker(point, startDate, endDate, index = 0) {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  const left = Math.min(100, Math.max(0, (daysBetween(startDate, point.date) / totalDays) * 100));
  const edgeClass = left < 12 ? "edge-left" : left > 88 ? "edge-right" : "";
  const labelPosition = index % 2 === 0 ? "label-top" : "label-bottom";
  const label = `${truncateLabel(markerDisplayLabel(point.label), 16)} - ${formatShortDate(point.date)}`;
  return `
    <span
      class="timeline-marker-wrap ${labelPosition} ${edgeClass}"
      style="left: ${left}%"
      title="${escapeHtml(`${point.label}: ${formatDate(point.date)}`)}"
    >
      <span class="timeline-marker-label">${escapeHtml(label)}</span>
      <span class="timeline-marker marker-${point.kind}"></span>
    </span>
  `;
}

function markerDisplayLabel(label) {
  return String(label)
    .replace("Next action", "Next")
    .replace("Action done", "Done")
    .replace("Interview scheduled", "Interview")
    .replace("Interview completed", "Interview done")
    .replace("Follow-up sent", "Follow-up")
    .replace("Thank-you sent", "Thank-you");
}

function timelineKindForEvent(type) {
  if (type.includes("interview")) return "interview";
  if (["offer_received", "rejected", "abandoned_no_response"].includes(type)) return "outcome";
  if (type.includes("follow_up") || type === "thank_you_sent") return "follow-up";
  return "activity";
}

function shortTimelineLabel(label) {
  return String(label)
    .replace("Application ", "")
    .replace("Recruiter ", "Recruiter ")
    .replace("Abandoned - no response", "Abandoned");
}

function bindAnalyticsControls() {
  document.getElementById("analyticsSegment").addEventListener("change", (event) => {
    state.analyticsSegment = event.target.value;
    replaceHistoryState();
    renderAnalytics();
  });
  document.getElementById("analyticsFrom").addEventListener("change", (event) => {
    state.analyticsFrom = event.target.value;
    state.timelinePage = 0;
    replaceHistoryState();
    renderAnalytics();
  });
  document.getElementById("analyticsTo").addEventListener("change", (event) => {
    state.analyticsTo = event.target.value;
    state.timelinePage = 0;
    replaceHistoryState();
    renderAnalytics();
  });
  document.getElementById("analyticsChart").addEventListener("change", (event) => {
    state.analyticsChart = event.target.value;
    replaceHistoryState();
    renderAnalytics();
  });

  document.querySelectorAll("[data-timeline-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timelineStatusFilter = button.dataset.timelineFilter;
      state.timelinePage = 0;
      replaceHistoryState();
      renderAnalytics();
    });
  });

  document.querySelectorAll("[data-timeline-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timelinePage += button.dataset.timelinePage === "next" ? 1 : -1;
      state.timelinePage = Math.max(0, state.timelinePage);
      replaceHistoryState();
      renderAnalytics();
    });
  });

  document.querySelectorAll("[data-timeline-application]").forEach((row) => {
    const openApplication = () => {
      const app = state.applications.find((candidate) => candidate.id === row.dataset.timelineApplication);
      const label = app ? `Showing ${app.companyName}` : "Showing selected application";
      setApplicationDashboardFilter([row.dataset.timelineApplication], label);
    };

    row.addEventListener("click", openApplication);
    row.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openApplication();
    });
  });
}

function analyticsApplications() {
  return state.applications.filter((app) => {
    if (isWithinAnalyticsRange(app.createdAt)) return true;

    const hasEventInRange = state.events.some((event) => (
      event.applicationId === app.id && isWithinAnalyticsRange(event.occurredAt)
    ));
    if (hasEventInRange) return true;

    return state.tasks.some((task) => (
      task.applicationId === app.id && isWithinAnalyticsRange(task.dueAt)
    ));
  });
}

function analyticsEvents(applications) {
  const appIds = new Set(applications.map((app) => app.id));
  return visibleEvents(state.events).filter((event) => appIds.has(event.applicationId) && isWithinAnalyticsRange(event.occurredAt));
}

function analyticsTasks(applications) {
  const appIds = new Set(applications.map((app) => app.id));
  return state.tasks.filter((task) => appIds.has(task.applicationId) && isWithinAnalyticsRange(task.dueAt));
}

function isWithinAnalyticsRange(dateString) {
  if (!dateString) return true;
  if (state.analyticsFrom && dateString < state.analyticsFrom) return false;
  if (state.analyticsTo && dateString > state.analyticsTo) return false;
  return true;
}

function countApplicationsBySegment(applications, segment) {
  return applications.reduce((acc, app) => {
    let key = app[segment] || "Unknown";
    if (segment === "stage") key = applicationStage(app);
    if (segment === "path") key = applicationPathLabel(app);
    if (segment === "tailored") key = app.tailoredDocuments ? "Tailored" : "Not tailored";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hasAnyDocument(app) {
  return Boolean(
    app.resumeName ||
    app.resumePath ||
    app.coverLetterName ||
    app.coverLetterPath ||
    app.portfolioPath
  );
}

function analyticsSegmentLabel(segment) {
  return {
    stage: "Stage",
    path: "Application path",
    workMode: "Work mode",
    tailored: "Document tailoring",
  }[segment] || segment;
}

function analyticsChartTitle() {
  if (state.analyticsChart === "flow") return "Application flow";
  return `Applications by ${analyticsSegmentLabel(state.analyticsSegment).toLowerCase()}`;
}

function conversionMetrics(applications, events) {
  const appIdsWithSubmittedEvents = new Set(events.filter((event) => event.type === "application_submitted").map((event) => event.applicationId));
  const appIdsWithInterviewEvents = new Set(events.filter((event) => event.type.includes("interview")).map((event) => event.applicationId));
  const appIdsWithOfferEvents = new Set(events.filter((event) => event.type === "offer_received").map((event) => event.applicationId));
  const appIdsWithRejectedEvents = new Set(events.filter((event) => event.type === "rejected").map((event) => event.applicationId));
  const appIdsWithAbandonedEvents = new Set(events.filter((event) => event.type === "abandoned_no_response").map((event) => event.applicationId));

  return {
    applied: applications.filter((app) => applicationStage(app) === "Applied" || appIdsWithSubmittedEvents.has(app.id)).length,
    interviewed: applications.filter((app) => ["Recruiter Screen", "Technical Screen", "Final Interview", "Offer"].includes(applicationStage(app)) || appIdsWithInterviewEvents.has(app.id)).length,
    offers: applications.filter((app) => applicationStage(app) === "Offer" || appIdsWithOfferEvents.has(app.id)).length,
    rejected: applications.filter((app) => applicationStage(app) === "Rejected" || appIdsWithRejectedEvents.has(app.id)).length,
    abandoned: applications.filter((app) => applicationStage(app) === "Abandoned" || appIdsWithAbandonedEvents.has(app.id)).length,
    withdrawn: applications.filter((app) => applicationStage(app) === "Withdrawn").length,
  };
}

function pipelineCadenceMetrics(applications) {
  const transitions = applications.flatMap(applicationTransitions);

  if (!transitions.length) {
    return {
      transitions: [],
      averageGap: 0,
      fastestGap: 0,
      slowestGap: 0,
    };
  }

  const gaps = transitions.map((transition) => transition.days);
  return {
    transitions,
    averageGap: Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
    fastestGap: Math.min(...gaps),
    slowestGap: Math.max(...gaps),
  };
}

function salaryAnalytics(applications) {
  const salaryRows = applications
    .map(salaryFieldsForApp)
    .filter((salary) => salary.min || salary.max);

  if (!salaryRows.length) {
    return {
      count: 0,
      averageMin: 0,
      averageMax: 0,
      highestMax: 0,
    };
  }

  const minimums = salaryRows.map((salary) => Number(salary.min || salary.max)).filter(Boolean);
  const maximums = salaryRows.map((salary) => Number(salary.max || salary.min)).filter(Boolean);

  return {
    count: salaryRows.length,
    averageMin: Math.round(minimums.reduce((sum, value) => sum + value, 0) / minimums.length),
    averageMax: Math.round(maximums.reduce((sum, value) => sum + value, 0) / maximums.length),
    highestMax: Math.max(...maximums),
  };
}

function applicationTransitions(app) {
  const points = applicationTimelinePoints(app);
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    return {
      from: previous,
      to: point,
      days: daysBetween(previous.date, point.date),
    };
  });
}

function applicationTimelinePoints(app) {
  const points = [];

  visibleEvents(eventsFor(app.id)).forEach((event) => {
    points.push({
      label: eventDisplayLabel(event),
      date: dateOnly(event.occurredAt),
      sortKey: `${dateOnly(event.occurredAt)}T01:00:00.000Z-${event.createdAt || ""}`,
    });
  });

  tasksFor(app.id)
    .filter((task) => task.completedAt)
    .forEach((task) => {
      points.push({
        label: `Completed next action: ${task.title}`,
        date: dateOnly(task.completedAt),
        sortKey: `${dateOnly(task.completedAt)}T02:00:00.000Z-${task.completedAt}`,
      });
    });

  return points
    .filter((point) => point.date)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function renderSelectedChart(counts, applications = state.applications) {
  if (state.analyticsChart === "flow") return renderFlowChart(applications);
  if (state.analyticsChart === "donut") return renderDonutChart(counts);
  return renderBars(counts, Math.max(1, ...Object.values(counts)));
}

function renderDonutChart(counts) {
  const entries = Object.entries(counts);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return `<p class="empty">No data yet.</p>`;

  const colors = ["#2f6f5e", "#315b8f", "#e7b84f", "#b95d54", "#65717d", "#6f5d8c"];
  let offset = 25;
  const slices = entries.map(([label, value], index) => {
    const amount = (value / total) * 100;
    const slice = `<circle r="52" cx="70" cy="70" pathLength="100" fill="transparent" stroke="${colors[index % colors.length]}" stroke-width="24" stroke-linecap="butt" stroke-dasharray="${amount} ${100 - amount}" stroke-dashoffset="${offset}" />`;
    offset -= amount;
    return slice;
  }).join("");

  const legend = entries.map(([label, value], index) => `
    <p class="meta">
      <span style="color:${colors[index % colors.length]}">■</span>
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </p>
  `).join("");

  return `
    <svg class="chart-svg" viewBox="0 0 320 150" role="img" aria-label="Donut chart">
      <g transform="rotate(-90 70 70)">${slices}</g>
      <text x="70" y="66" text-anchor="middle" class="chart-value">${total}</text>
      <text x="70" y="84" text-anchor="middle" class="chart-label">total</text>
      <foreignObject x="150" y="10" width="160" height="130">
        <div xmlns="http://www.w3.org/1999/xhtml">${legend}</div>
      </foreignObject>
    </svg>
  `;
}

function renderFlowChart(applications) {
  if (!applications.length) return `<p class="empty">No application flow data yet.</p>`;

  const total = applications.length;
  const sourceEntries = sortedFlowEntries(applications.reduce((acc, app) => {
    const label = applicationPathLabel(app);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {}));
  const outcomeEntries = sortedFlowEntries(applications.reduce((acc, app) => {
    const label = flowOutcomeLabel(applicationStage(app));
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {}));

  const width = 680;
  const nodeHeight = 56;
  const nodeGap = 18;
  const sideNodeCount = Math.max(sourceEntries.length, outcomeEntries.length, 1);
  const height = Math.max(240, sideNodeCount * nodeHeight + Math.max(0, sideNodeCount - 1) * nodeGap + 56);
  const nodeWidth = 132;
  const colors = ["#2f6f5e", "#315b8f", "#e7b84f", "#b95d54", "#65717d", "#6f5d8c"];
  const sourceNodes = layoutFlowNodes(sourceEntries, 22, nodeWidth, height, nodeHeight, nodeGap);
  const submittedNode = {
    label: "Submitted",
    value: total,
    x: 322,
    y: 28,
    width: nodeWidth,
    height: height - 56,
  };
  const outcomeNodes = layoutFlowNodes(outcomeEntries, 526, nodeWidth, height, nodeHeight, nodeGap);

  let sourceTargetCursor = 0;
  const sourceLinks = sourceNodes.map((node, index) => {
    const targetY = submittedNode.y + ((sourceTargetCursor + node.value / 2) / total) * submittedNode.height;
    sourceTargetCursor += node.value;
    return renderFlowLink(
      node.x + node.width,
      node.y + node.height / 2,
      submittedNode.x,
      targetY,
      node.value,
      total,
      colors[index % colors.length]
    );
  }).join("");

  let outcomeSourceCursor = 0;
  const outcomeLinks = outcomeNodes.map((node, index) => {
    const sourceY = submittedNode.y + ((outcomeSourceCursor + node.value / 2) / total) * submittedNode.height;
    outcomeSourceCursor += node.value;
    return renderFlowLink(
      submittedNode.x + submittedNode.width,
      sourceY,
      node.x,
      node.y + node.height / 2,
      node.value,
      total,
      colors[(index + sourceNodes.length) % colors.length]
    );
  }).join("");

  return `
    <div class="flow-wrapper">
      <svg class="chart-svg flow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Application flow chart">
        ${sourceLinks}
        ${outcomeLinks}
        ${[...sourceNodes, submittedNode, ...outcomeNodes].map(renderFlowNode).join("")}
      </svg>
      <p class="flow-caption">Application path to submitted applications to current stage or outcome.</p>
    </div>
  `;
}

function sortedFlowEntries(counts) {
  return Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function layoutFlowNodes(entries, x, width, chartHeight, nodeHeight, gap) {
  const top = 28;
  const totalHeight = entries.length * nodeHeight + Math.max(0, entries.length - 1) * gap;
  let y = top + Math.max(0, (chartHeight - top * 2 - totalHeight) / 2);

  return entries.map(([label, value]) => {
    const node = { label, value, x, y, width, height: nodeHeight };
    y += nodeHeight + gap;
    return node;
  });
}

function renderFlowLink(x1, y1, x2, y2, value, total, color) {
  const strokeWidth = Math.max(7, Math.min(42, (value / total) * 44));
  const curve = Math.max(70, (x2 - x1) * 0.5);
  return `
    <path
      class="flow-link"
      d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}"
      fill="none"
      stroke="${color}"
      stroke-width="${strokeWidth}"
    />
  `;
}

function renderFlowNode(node) {
  const labelY = node.y + Math.max(20, node.height / 2 - 4);
  const countY = labelY + 18;

  return `
    <g>
      <rect class="flow-node" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" />
      <text class="flow-node-label" x="${node.x + 12}" y="${labelY}">${escapeHtml(truncateLabel(node.label, 17))}</text>
      <text class="flow-node-count" x="${node.x + 12}" y="${countY}">${node.value}</text>
      <title>${escapeHtml(`${node.label}: ${node.value}`)}</title>
    </g>
  `;
}

function flowOutcomeLabel(stage) {
  return stage === "Applied" ? "In Progress" : stage;
}

function truncateLabel(label, maxLength) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}...`;
}

function renderLineChart(counts) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return `<p class="empty">No submissions yet.</p>`;

  const width = 520;
  const height = 180;
  const padding = 34;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const points = entries.map(([, value], index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, entries.length - 1);
    const y = height - padding - (value / max) * (height - padding * 2);
    return { x, y, value };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Submissions by week line chart">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d9dedb" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d9dedb" />
      <path d="${path}" fill="none" stroke="#2f6f5e" stroke-width="3" />
      ${points.map((point, index) => `
        <circle cx="${point.x}" cy="${point.y}" r="5" fill="#315b8f" />
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="chart-value">${point.value}</text>
        <text x="${point.x}" y="${height - 10}" text-anchor="middle" class="chart-label">${formatShortDate(entries[index][0])}</text>
      `).join("")}
    </svg>
  `;
}
