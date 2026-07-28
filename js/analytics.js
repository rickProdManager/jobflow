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
        <div class="panel-heading">
          <h3>${analyticsChartTitle()}</h3>
          ${state.analyticsChart === "flow" ? `<button type="button" class="mini-button" data-open-flow-map>Open full map</button>` : ""}
        </div>
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
          ${statCard(conversion.interviewScheduled, "Interview scheduled")}
          ${statCard(conversion.interviewed, "Interviewed")}
          ${statCard(conversion.offers, "Offers")}
          ${statCard(conversion.accepted, "Accepted")}
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

function renderFlowMap() {
  const container = document.getElementById("flow-mapView");
  if (state.activeView !== "flow-map") {
    container.innerHTML = "";
    return;
  }

  const applications = analyticsApplications();
  const isFitLayout = state.flowMapLayout === "fit";
  container.innerHTML = `
    <div class="flow-map-page">
      <div class="page-header flow-map-header">
        <div>
          <p class="eyebrow">Application routes</p>
          <h2>${isFitLayout ? "One-page flow map" : "Detailed flow map"}</h2>
          <p class="meta">${isFitLayout ? "Share-ready layout that uses the full page height without horizontal scrolling." : "Scrollable layout for inspecting individual routes in detail."}</p>
        </div>
        <div class="flow-map-actions">
          <div class="flow-map-layout-toggle" aria-label="Flow map layout">
            <button type="button" class="mini-button ${isFitLayout ? "is-active" : ""}" data-flow-map-layout="fit" aria-pressed="${isFitLayout}">Fit to one page</button>
            <button type="button" class="mini-button ${!isFitLayout ? "is-active" : ""}" data-flow-map-layout="review" aria-pressed="${!isFitLayout}">Scrollable review</button>
          </div>
          <button type="button" class="mini-button" data-close-flow-map>Back to Analytics</button>
        </div>
      </div>
      <div class="flow-map-canvas ${isFitLayout ? "flow-map-canvas-fit" : ""}">
        ${renderFlowChart(applications, { layout: state.flowMapLayout })}
      </div>
    </div>
  `;

  document.querySelector("[data-close-flow-map]").addEventListener("click", () => {
    state.activeView = "analytics";
    pushHistoryState();
    render();
  });

  document.querySelectorAll("[data-flow-map-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      state.flowMapLayout = validFlowMapLayout(button.dataset.flowMapLayout);
      pushHistoryState();
      render();
    });
  });
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
    .map((app) => ({ app, steps: applicationFlowRoute(app) }))
    .sort((a, b) => compareApplicationsForList(a.app, b.app));
  const maxPage = Math.max(0, Math.ceil(allRows.length / TIMELINE_PAGE_SIZE) - 1);
  if (state.timelinePage > maxPage) state.timelinePage = maxPage;

  const pageStart = state.timelinePage * TIMELINE_PAGE_SIZE;
  const rows = allRows.slice(pageStart, pageStart + TIMELINE_PAGE_SIZE);

  return `
    ${renderTimelineStatusFilter(allRows.length)}
    ${rows.length ? `<div class="timeline-route-list">
      ${rows.map(renderTimelineRouteRow).join("")}
    </div>` : `<p class="empty">No applications match this status yet.</p>`}
    ${renderTimelinePagination(allRows.length, pageStart, rows.length)}
  `;
}

function renderTimelineRouteRow(row) {
  const stage = applicationStage(row.app);
  return `
    <article
      class="timeline-route-row timeline-row-link"
      role="button"
      tabindex="0"
      data-timeline-application="${escapeHtml(row.app.id)}"
      aria-label="${escapeHtml(`Open ${row.app.companyName} ${row.app.jobTitle}`)}"
    >
      <div class="timeline-row-summary">
        <h3>${escapeHtml(row.app.jobTitle)}</h3>
        <p class="timeline-row-meta">
          <span class="employer-badge">${escapeHtml(row.app.companyName)}</span>
          <span class="timeline-status-pill ${stageClass(stage)}">${escapeHtml(flowOutcomeLabel(stage))}</span>
        </p>
      </div>
      <div class="timeline-route-scroll" aria-label="${escapeHtml(`${row.app.jobTitle} application path`)}">
        <div class="timeline-route-track">
          ${row.steps.map((step, index) => `
            ${index ? `<span class="timeline-route-arrow" aria-hidden="true">→</span>` : ""}
            <span class="timeline-route-step-wrap">
              <span class="timeline-route-step timeline-route-step-${timelineRouteStepKind(step)}">${escapeHtml(step.label)}</span>
              ${step.date ? `<span class="timeline-route-step-date">${escapeHtml(formatShortDate(step.date))}</span>` : ""}
            </span>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function timelineRouteStepKind(step) {
  return step.phase === "source" ? "path" : step.phase;
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

  document.querySelector("[data-open-flow-map]")?.addEventListener("click", () => {
    state.activeView = "flow-map";
    pushHistoryState();
    render();
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
  const appIdsWithScheduledInterviewEvents = new Set(events.filter((event) => event.type === "interview_scheduled").map((event) => event.applicationId));
  const appIdsWithCompletedInterviewEvents = new Set(events.filter((event) => event.type === "interview_completed").map((event) => event.applicationId));
  const appIdsWithOfferEvents = new Set(events.filter((event) => event.type === "offer_received").map((event) => event.applicationId));
  const appIdsWithAcceptedOfferEvents = new Set(events.filter((event) => event.type === "offer_accepted").map((event) => event.applicationId));
  const appIdsWithRejectedEvents = new Set(events.filter((event) => event.type === "rejected").map((event) => event.applicationId));
  const appIdsWithAbandonedEvents = new Set(events.filter((event) => event.type === "abandoned_no_response").map((event) => event.applicationId));

  return {
    applied: applications.filter((app) => applicationStage(app) === "Applied" || appIdsWithSubmittedEvents.has(app.id)).length,
    interviewScheduled: applications.filter((app) => appIdsWithScheduledInterviewEvents.has(app.id)).length,
    interviewed: applications.filter((app) => ["Final Interview", "Offer", "Accepted"].includes(applicationStage(app)) || appIdsWithCompletedInterviewEvents.has(app.id)).length,
    offers: applications.filter((app) => ["Offer", "Accepted"].includes(applicationStage(app)) || appIdsWithOfferEvents.has(app.id) || appIdsWithAcceptedOfferEvents.has(app.id)).length,
    accepted: applications.filter((app) => applicationStage(app) === "Accepted" || appIdsWithAcceptedOfferEvents.has(app.id)).length,
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

function renderFlowChart(applications, options = {}) {
  if (!applications.length) return `<p class="empty">No application flow data yet.</p>`;

  const layout = options.layout || "embedded";
  const detailed = layout === "review";
  const fitToPage = layout === "fit";
  const flow = buildApplicationFlow(applications);
  const columns = flowColumnsFor(flow.nodes);
  const largestNodeValue = Math.max(1, ...flow.nodes.map((node) => node.value));
  const linkUnit = fitToPage
    ? Math.min(8, Math.max(0.45, 32 / largestNodeValue))
    : detailed
    ? Math.min(11, Math.max(0.5, 42 / largestNodeValue))
    : Math.min(6, Math.max(0.35, 22 / largestNodeValue));
  const baseNodeHeight = fitToPage || detailed ? 56 : 36;
  const portGap = fitToPage ? 16 : detailed ? 24 : 4;
  const nodeWidth = fitToPage ? 148 : detailed ? 160 : 104;
  const columnGap = fitToPage ? 72 : detailed ? 300 : 44;
  const nodeGap = fitToPage ? 24 : detailed ? 32 : 8;
  const nodeHeights = flowNodeHeights(flow.nodes, flow.links, linkUnit, portGap, baseNodeHeight);
  const tallestColumn = Math.max(...columns.map((column) => {
    const entries = flow.nodes.filter((node) => node.column === column.id);
    return flowColumnHeight(entries, nodeHeights, nodeGap, detailed);
  }));
  const chartWidth = Math.max(
    fitToPage ? 980 : detailed ? 2500 : 620,
    48 + columns.length * nodeWidth + Math.max(0, columns.length - 1) * columnGap
  );
  const chartHeight = Math.max(fitToPage ? 720 : detailed ? 500 : 176, 56 + tallestColumn);
  const nodes = layoutFlowNodes(flow.nodes, columns, nodeWidth, nodeHeights, nodeGap, chartHeight, columnGap, {
    detailed,
    fitToPage,
  });
  const links = layoutFlowLinks(nodes, flow.links, linkUnit, portGap);
  const caption = fitToPage
    ? "One-page view spreads each stage across the full height of the page. Use it for screenshots, printing, and sharing; switch to Scrollable review to inspect individual routes more closely."
    : "Each band follows recorded application progress. Hover a band to see the applications it represents; interview stages are numbered, while completed interviews remain in Application timelines.";

  return `
    <div class="flow-wrapper">
      <div class="flow-scroll ${fitToPage ? "flow-scroll-fit" : ""}">
        <svg class="chart-svg flow-chart ${detailed ? "flow-chart-detailed" : ""} ${fitToPage ? "flow-chart-fit" : ""}" viewBox="0 0 ${chartWidth} ${chartHeight}" style="--flow-width: ${chartWidth}px" role="img" aria-label="${fitToPage ? "Application flow Sankey chart, fit to one page" : "Application flow Sankey chart"}">
          ${links.map(renderFlowLink).join("")}
          ${nodes.map(renderFlowNode).join("")}
        </svg>
      </div>
      <p class="flow-caption">${caption}</p>
    </div>
  `;
}

const FLOW_MILESTONES = {
  in_progress: { id: "in_progress", label: "In progress", phase: "progress", order: 0 },
  offer_received: { label: "Offer received", phase: "offer", order: 0 },
  offer_accepted: { label: "Accepted", phase: "outcome", order: 0 },
  rejected: { label: "Rejected", phase: "outcome", order: 1 },
  abandoned: { label: "Abandoned", phase: "outcome", order: 2 },
  withdrawn: { label: "Withdrawn", phase: "outcome", order: 3 },
};

function buildApplicationFlow(applications) {
  const nodeById = new Map();
  const linkById = new Map();

  applications.forEach((app) => {
    const route = applicationFlowRoute(app);
    route.forEach((node) => nodeById.set(node.id, node));

    route.slice(1).forEach((target, index) => {
      const source = route[index];
      const id = `${source.id}->${target.id}`;
      const link = linkById.get(id) || {
        id,
        sourceId: source.id,
        targetId: target.id,
        value: 0,
        applications: [],
      };
      link.value += 1;
      link.applications.push(app);
      linkById.set(id, link);
    });
  });

  const links = [...linkById.values()];
  const unpositionedNodes = [...nodeById.values()];
  const maximumInterviewStep = Math.max(0, ...unpositionedNodes
    .filter((node) => node.phase === "interview")
    .map((node) => node.interviewRound));
  const nodes = unpositionedNodes.map((node) => {
    const incoming = links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.value, 0);
    const outgoing = links.filter((link) => link.sourceId === node.id).reduce((sum, link) => sum + link.value, 0);
    return {
      ...node,
      column: flowNodeColumn(node, maximumInterviewStep),
      value: Math.max(incoming, outgoing),
    };
  });

  return { nodes, links };
}

function applicationFlowRoute(app) {
  const path = applicationPathLabel(app);
  const events = visibleEvents(eventsFor(app.id));
  const eventTypes = new Set(events.map((event) => event.type));
  const submittedDate = firstFlowEventDate(events, ["application_submitted"]) || dateOnly(app.createdAt);
  const route = [
    { id: `source:${path}`, label: path, phase: "source", order: flowSourceOrder(path) },
    { id: "submitted", label: "Submitted", phase: "submitted", date: submittedDate, order: 0 },
  ];
  const stage = applicationStage(app);
  const outcome = latestFlowOutcome(app, eventTypes, stage);
  const interviews = events
    .filter((event) => event.type === "interview_scheduled")
    .sort((a, b) => `${a.scheduledFor || a.occurredAt}-${a.createdAt || ""}-${a.id || ""}`.localeCompare(`${b.scheduledFor || b.occurredAt}-${b.createdAt || ""}-${b.id || ""}`));
  const isDirectExit = Boolean(outcome) && !interviews.length;

  if (!isDirectExit) route.push({ ...FLOW_MILESTONES.in_progress, date: progressFlowDate(events, submittedDate) });
  interviews.forEach((event, index) => {
    const round = index + 1;
    route.push({
      id: `interview:${round}:${app.id}`,
      label: `Interview ${round}`,
      detail: app.companyName,
      phase: "interview",
      date: dateOnly(event.scheduledFor || event.occurredAt),
      interviewRound: round,
      order: 0,
    });
  });
  if (eventTypes.has("offer_received") || stage === "Offer") {
    route.push({ id: "offer_received", ...FLOW_MILESTONES.offer_received, date: firstFlowEventDate(events, ["offer_received"]) || dateOnly(app.updatedAt) });
  }
  if (outcome) route.push({ id: outcome, ...FLOW_MILESTONES[outcome], date: latestFlowOutcomeDate(events, outcome) || dateOnly(app.updatedAt) });

  return route;
}

function firstFlowEventDate(events, types) {
  const firstEvent = events
    .filter((event) => types.includes(event.type))
    .sort((a, b) => `${a.occurredAt}-${a.createdAt || ""}`.localeCompare(`${b.occurredAt}-${b.createdAt || ""}`))[0];
  return dateOnly(firstEvent?.occurredAt);
}

function progressFlowDate(events, fallbackDate) {
  const progressTypes = [
    "follow_up_sent",
    "recruiter_replied",
    "internal_contact_replied",
    "thank_you_sent",
    "interview_scheduled",
  ];
  return firstFlowEventDate(events, progressTypes) || fallbackDate;
}

function latestFlowOutcomeDate(events, outcome) {
  const type = {
    offer_accepted: "offer_accepted",
    rejected: "rejected",
    abandoned: "abandoned_no_response",
  }[outcome];
  if (!type) return "";

  const matching = events
    .filter((event) => event.type === type)
    .sort((a, b) => `${b.occurredAt}-${b.createdAt || ""}`.localeCompare(`${a.occurredAt}-${a.createdAt || ""}`));
  return dateOnly(matching[0]?.occurredAt);
}

function latestFlowOutcome(app, eventTypes, stage) {
  const outcomeByEvent = {
    offer_accepted: "offer_accepted",
    rejected: "rejected",
    abandoned_no_response: "abandoned",
  };
  const latestOutcomeEvent = visibleEvents(eventsFor(app.id))
    .filter((event) => outcomeByEvent[event.type])
    .sort((a, b) => `${b.occurredAt}-${b.createdAt || ""}`.localeCompare(`${a.occurredAt}-${a.createdAt || ""}`))[0];

  if (latestOutcomeEvent) return outcomeByEvent[latestOutcomeEvent.type];
  if (eventTypes.has("offer_accepted")) return "offer_accepted";

  return {
    Accepted: "offer_accepted",
    Rejected: "rejected",
    Abandoned: "abandoned",
    Withdrawn: "withdrawn",
  }[stage] || "";
}

function flowSourceOrder(path) {
  return { Direct: 0, Referral: 1, Headhunter: 2 }[path] ?? 9;
}

function flowNodeColumn(node, maximumInterviewStep) {
  if (node.phase === "source") return 0;
  if (node.phase === "submitted") return 1;
  if (node.phase === "progress") return 2;
  if (node.phase === "interview") return 2 + node.interviewRound;
  if (node.phase === "offer") return 3 + maximumInterviewStep;
  if (node.phase === "outcome") return 4 + maximumInterviewStep;
  return 0;
}

function flowColumnsFor(nodes) {
  return [...new Set(nodes.map((node) => node.column))]
    .sort((a, b) => a - b)
    .map((id) => ({ id }));
}

function flowColumnX(columnIndex, nodeWidth, columnGap) {
  return 24 + columnIndex * (nodeWidth + columnGap);
}

function flowNodeGap(entries, baseGap, detailed) {
  if (!detailed || entries.length < 2) return baseGap;
  if (entries.every((node) => node.phase === "source")) return 120;
  if (entries.every((node) => node.phase === "interview")) return 64;
  return 40;
}

function flowLinkWidth(link, linkUnit) {
  return Math.max(2, link.value * linkUnit);
}

function flowPortSpan(links, linkUnit, portGap) {
  if (!links.length) return 0;
  return links.reduce((sum, link) => sum + flowLinkWidth(link, linkUnit), 0) + (links.length - 1) * portGap;
}

function flowNodeHeights(nodes, links, linkUnit, portGap, baseNodeHeight) {
  return new Map(nodes.map((node) => {
    const incoming = links.filter((link) => link.targetId === node.id);
    const outgoing = links.filter((link) => link.sourceId === node.id);
    const portSpan = Math.max(
      flowPortSpan(incoming, linkUnit, portGap),
      flowPortSpan(outgoing, linkUnit, portGap)
    );
    return [node.id, Math.max(baseNodeHeight, Math.ceil(portSpan + 20))];
  }));
}

function flowColumnHeight(entries, nodeHeights, gap, detailed) {
  const nodeTotal = entries.reduce((sum, node) => sum + nodeHeights.get(node.id), 0);
  return nodeTotal + Math.max(0, entries.length - 1) * flowNodeGap(entries, gap, detailed);
}

function layoutFlowNodes(nodes, columns, nodeWidth, nodeHeights, gap, chartHeight, columnGap, options = {}) {
  const top = 24;
  const bottom = 30;

  return columns.flatMap((column, columnIndex) => {
    const entries = nodes
      .filter((node) => node.column === column.id)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const entryGap = flowNodeGap(entries, gap, options.detailed);
    const totalHeight = flowColumnHeight(entries, nodeHeights, gap, options.detailed);
    const availableHeight = chartHeight - top - bottom;
    const spreadColumn = options.fitToPage && flowColumnUsesFullHeight(entries);
    const spreadGap = spreadColumn
      ? Math.max(entryGap, (availableHeight - entries.reduce((sum, node) => sum + nodeHeights.get(node.id), 0)) / (entries.length - 1))
      : entryGap;
    let y = spreadColumn
      ? top
      : top + Math.max(0, (availableHeight - totalHeight) / 2);

    return entries.map((node) => {
      const nodeHeight = nodeHeights.get(node.id);
      const positioned = {
        ...node,
        x: flowColumnX(columnIndex, nodeWidth, columnGap),
        y,
        width: nodeWidth,
        height: nodeHeight,
      };
      y += nodeHeight + spreadGap;
      return positioned;
    });
  });
}

function flowColumnUsesFullHeight(entries) {
  return entries.length > 1 && entries.every((node) => (
    node.phase === "source" || node.phase === "outcome"
  ));
}

function layoutFlowLinks(nodes, links, linkUnit, portGap) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const laidOutLinks = links.map((link) => ({
    ...link,
    source: nodeById.get(link.sourceId),
    target: nodeById.get(link.targetId),
    width: flowLinkWidth(link, linkUnit),
  }));
  laidOutLinks.forEach((link) => { link.color = flowLinkColor(link); });

  nodes.forEach((node) => {
    const outgoing = laidOutLinks
      .filter((link) => link.sourceId === node.id)
      .sort((a, b) => a.target.y - b.target.y || a.target.order - b.target.order);
    const incoming = laidOutLinks
      .filter((link) => link.targetId === node.id)
      .sort((a, b) => a.source.y - b.source.y || a.source.order - b.source.order);
    positionFlowPorts(outgoing, node, "sourceY", portGap);
    positionFlowPorts(incoming, node, "targetY", portGap);
  });

  return laidOutLinks;
}

function positionFlowPorts(links, node, property, portGap) {
  const totalWidth = links.reduce((sum, link) => sum + link.width, 0) + Math.max(0, links.length - 1) * portGap;
  let cursor = node.y + (node.height - totalWidth) / 2;

  links.forEach((link) => {
    link[property] = cursor + link.width / 2;
    cursor += link.width + portGap;
  });
}

function flowLinkColor(link) {
  if (link.target.phase === "interview") return "#c7922f";
  if (link.target.phase === "outcome") {
    return {
      offer_accepted: "#2f6f5e",
      rejected: "#b95d54",
      abandoned: "#65717d",
      withdrawn: "#6f5d8c",
    }[link.target.id] || "#2f6f5e";
  }
  return {
    submitted: "#315b8f",
    progress: "#4e769d",
    offer: "#2f6f5e",
    outcome: "#2f6f5e",
  }[link.target.phase] || "#65717d";
}

function renderFlowLink(link) {
  const curve = Math.max(56, (link.target.x - (link.source.x + link.source.width)) * 0.34);
  return `
    <path
      class="flow-link"
      d="M ${link.source.x + link.source.width} ${link.sourceY} C ${link.source.x + link.source.width + curve} ${link.sourceY}, ${link.target.x - curve} ${link.targetY}, ${link.target.x} ${link.targetY}"
      fill="none"
      stroke="${link.color}"
      stroke-width="${link.width}"
    ><title>${escapeHtml(flowLinkTitle(link))}</title></path>
  `;
}

function flowLinkTitle(link) {
  const names = link.applications
    .slice(0, 4)
    .map((app) => `${app.companyName} — ${app.jobTitle}`)
    .join("\n");
  const remaining = link.applications.length - 4;
  const suffix = remaining > 0 ? "\nand more" : "";
  return `${link.source.label} → ${link.target.label}${names ? `\n${names}${suffix}` : ""}`;
}

function renderFlowNode(node) {
  const labelLines = flowNodeLabelLines(node.label);
  const labelY = node.y + (node.detail
    ? Math.round(node.height * 0.42)
    : labelLines.length === 1
      ? Math.round(node.height * 0.6)
      : Math.round(node.height * 0.35));
  const detailY = node.y + node.height - 7;

  return `
    <g>
      <rect class="flow-node" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" />
      ${labelLines.map((line, index) => `<text class="flow-node-label" x="${node.x + 10}" y="${labelY + index * 14}">${escapeHtml(line)}</text>`).join("")}
      ${node.detail ? `<text class="flow-node-detail" x="${node.x + 10}" y="${detailY}">${escapeHtml(truncateLabel(node.detail, 17))}</text>` : ""}
      <text class="flow-node-count" x="${node.x + node.width - 10}" y="${node.y + 17}" text-anchor="end">${node.value}</text>
      <title>${escapeHtml(`${node.label}${node.detail ? ` — ${node.detail}` : ""}: ${node.value}`)}</title>
    </g>
  `;
}

function flowNodeLabelLines(label) {
  return {
    "In progress": ["In", "progress"],
    "Offer received": ["Offer", "received"],
    Headhunter: ["Head", "hunter"],
  }[label] || [truncateLabel(label, 18)];
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
