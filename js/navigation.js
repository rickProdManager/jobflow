// Dashboard and application-list navigation helpers.

function bindDashboardLinks() {
  document.querySelectorAll("[data-dashboard-target]").forEach((button) => {
    button.addEventListener("click", () => navigateFromDashboard(button.dataset.dashboardTarget));
  });

  document.querySelectorAll("[data-application-link]").forEach((item) => {
    item.addEventListener("click", () => {
      const app = state.applications.find((candidate) => candidate.id === item.dataset.applicationLink);
      const label = app ? `Showing ${app.companyName}` : "Showing selected application";
      setApplicationDashboardFilter([item.dataset.applicationLink], label);
    });
  });
}

function navigateFromDashboard(target) {
  state.search = "";
  state.stageFilter = "All";
  state.applicationIdsFilter = null;
  state.applicationFilterLabel = "";

  if (target === "reminders") {
    state.activeView = "reminders";
    pushHistoryState();
    render();
    return;
  }

  if (target === "active") {
    const ids = state.applications
      .filter((app) => !isClosed(applicationStage(app)))
      .map((app) => app.id);
    setApplicationDashboardFilter(ids, "Showing active applications");
    return;
  }

  if (target === "stale") {
    const ids = state.applications
      .filter((app) => !isClosed(applicationStage(app)))
      .filter((app) => daysSince(lastActivityDate(app.id)) >= STALE_AFTER_DAYS)
      .map((app) => app.id);
    setApplicationDashboardFilter(ids, "Showing stale applications");
    return;
  }

  if (target === "interviews") {
    const ids = [...new Set(state.events
      .filter((event) => event.type.includes("interview"))
      .map((event) => event.applicationId))];
    setApplicationDashboardFilter(ids, "Showing applications with interview activity");
  }
}

function setApplicationDashboardFilter(ids, label) {
  state.applicationIdsFilter = ids;
  state.applicationFilterLabel = label;
  state.activeView = "applications";
  pushHistoryState();
  render();
}
