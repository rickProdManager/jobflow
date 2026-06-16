// URL and browser history synchronization.

const views = ["dashboard", "applications", "reminders", "analytics", "settings"];

function bindHistoryNavigation() {
  window.addEventListener("popstate", () => {
    syncStateFromUrl();
    render();
  });
}

function syncStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  state.activeView = views.includes(view) ? view : "dashboard";

  state.search = params.get("search") || "";
  state.stageFilter = validStageFilter(params.get("stage"));

  const appIds = parseApplicationIds(params.get("apps"));
  state.applicationIdsFilter = appIds.length ? appIds : null;
  state.applicationFilterLabel = params.get("label") || labelForApplicationIds(appIds);

  state.analyticsSegment = validAnalyticsSegment(params.get("segment"));
  state.analyticsFrom = params.get("from") || "";
  state.analyticsTo = params.get("to") || "";
  state.analyticsChart = validAnalyticsChart(params.get("chart"));
  state.timelineStatusFilter = validTimelineStatus(params.get("timelineStatus"));
  state.timelinePage = validTimelinePage(params.get("timelinePage"));
}

function pushHistoryState() {
  writeHistoryState("push");
}

function replaceHistoryState() {
  writeHistoryState("replace");
}

function writeHistoryState(mode) {
  const nextUrl = appUrlFromState();
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl && mode === "push") return;

  const method = mode === "push" ? "pushState" : "replaceState";
  window.history[method](routePayload(), "", nextUrl);
}

function appUrlFromState() {
  const params = new URLSearchParams();

  if (state.activeView !== "dashboard") params.set("view", state.activeView);

  if (state.activeView === "applications") {
    if (state.search) params.set("search", state.search);
    if (state.stageFilter !== "All") params.set("stage", state.stageFilter);
    if (state.applicationIdsFilter?.length) {
      params.set("apps", state.applicationIdsFilter.join(","));
      if (state.applicationFilterLabel) params.set("label", state.applicationFilterLabel);
    }
  }

  if (state.activeView === "analytics") {
    if (state.analyticsSegment !== "stage") params.set("segment", state.analyticsSegment);
    if (state.analyticsFrom) params.set("from", state.analyticsFrom);
    if (state.analyticsTo) params.set("to", state.analyticsTo);
    if (state.analyticsChart !== "flow") params.set("chart", state.analyticsChart);
    if (state.timelineStatusFilter !== "all") params.set("timelineStatus", state.timelineStatusFilter);
    if (state.timelinePage > 0) params.set("timelinePage", String(state.timelinePage));
  }

  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

function routePayload() {
  return {
    activeView: state.activeView,
    search: state.search,
    stageFilter: state.stageFilter,
    applicationIdsFilter: state.applicationIdsFilter,
    applicationFilterLabel: state.applicationFilterLabel,
    analyticsSegment: state.analyticsSegment,
    analyticsFrom: state.analyticsFrom,
    analyticsTo: state.analyticsTo,
    analyticsChart: state.analyticsChart,
    timelineStatusFilter: state.timelineStatusFilter,
    timelinePage: state.timelinePage,
  };
}

function parseApplicationIds(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelForApplicationIds(ids) {
  if (!ids.length) return "";
  if (ids.length === 1) {
    const app = state.applications.find((candidate) => candidate.id === ids[0]);
    return app ? `Showing ${app.companyName}` : "Showing selected application";
  }
  return `Showing ${ids.length} selected applications`;
}

function validStageFilter(value) {
  if (!value || value === "All") return "All";
  return stageOrder.includes(value) ? value : "All";
}

function validAnalyticsSegment(value) {
  return ["stage", "path", "workMode", "tailored"].includes(value) ? value : "stage";
}

function validAnalyticsChart(value) {
  return ["bars", "donut", "flow"].includes(value) ? value : "flow";
}

function validTimelineStatus(value) {
  return ["all", "in-progress", "rejected", "abandoned"].includes(value) ? value : "all";
}

function validTimelinePage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 ? page : 0;
}
