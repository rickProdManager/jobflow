// Browser entry point. Feature code is split by concern under js/.

let appStarted = false;

document.addEventListener("DOMContentLoaded", async () => {
  state.auth = await getAuthStatus();
  if (!state.auth.authenticated) {
    renderAuthGate(state.auth);
    return;
  }

  await startAuthenticatedApp();
});

async function startAuthenticatedApp() {
  document.body.classList.remove("tracker-locked");
  document.getElementById("authView").hidden = true;
  document.getElementById("appShell").hidden = false;
  startSessionMonitor();

  if (appStarted) {
    await loadAll();
    render();
    restoreDialogsAfterSessionUnlock();
    return;
  }

  await migrateLegacyIndexedDbIfNeeded();
  bindEvents();
  bindHistoryNavigation();
  await loadAll();
  syncStateFromUrl();
  replaceHistoryState();
  render();
  restoreDialogsAfterSessionUnlock();
  appStarted = true;
}
