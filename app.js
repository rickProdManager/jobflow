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
  document.getElementById("authView").hidden = true;
  document.getElementById("appShell").hidden = false;

  if (appStarted) {
    await loadAll();
    render();
    return;
  }

  await migrateLegacyIndexedDbIfNeeded();
  bindEvents();
  bindHistoryNavigation();
  await loadAll();
  syncStateFromUrl();
  replaceHistoryState();
  render();
  appStarted = true;
}
