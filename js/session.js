// Client-side session guard. It mirrors the server idle timeout so the UI
// locks before the next save attempt can fail with an expired session.

let sessionLockTimer = null;
let sessionLastAuthenticatedAt = 0;
let sessionTouchInFlight = false;
let sessionEventsBound = false;
let sessionLockedDialogIds = [];

const sessionActivityEvents = [
  "pointerdown",
  "keydown",
  "input",
  "wheel",
  "touchstart",
];

function sessionTimeoutMs() {
  const seconds = Number(state.auth?.idleTimeoutSeconds) || DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS;
  return Math.max(60 * 1000, seconds * 1000);
}

function bindSessionEvents() {
  if (sessionEventsBound) return;
  sessionActivityEvents.forEach((eventName) => {
    window.addEventListener(eventName, handleSessionUserActivity, {
      capture: true,
      passive: true,
    });
  });
  window.addEventListener("focus", handleSessionWakeCheck);
  document.addEventListener("visibilitychange", handleSessionWakeCheck);
  sessionEventsBound = true;
}

function startSessionMonitor() {
  bindSessionEvents();
  markSessionAuthenticated();
}

function stopSessionMonitor() {
  if (sessionLockTimer) {
    window.clearTimeout(sessionLockTimer);
    sessionLockTimer = null;
  }
  sessionLastAuthenticatedAt = 0;
  sessionTouchInFlight = false;
}

function markSessionAuthenticated() {
  if (!state.auth?.authenticated) return;
  sessionLastAuthenticatedAt = Date.now();
  scheduleSessionLock();
}

function noteSessionActivityFromApi(path, payload) {
  if (payload && typeof payload.idleTimeoutSeconds === "number") {
    state.auth.idleTimeoutSeconds = payload.idleTimeoutSeconds;
  }

  if (path === "/auth/logout") {
    stopSessionMonitor();
    return;
  }

  if (payload?.authenticated === false && path === "/auth/status") {
    if (!state.auth?.authenticated) return;
    lockSessionUi("Your tracker locked after being idle. Unlock it to continue.");
    return;
  }

  if (payload?.authenticated === true || (state.auth?.authenticated && !path.startsWith("/auth/"))) {
    markSessionAuthenticated();
  }
}

function handleApiUnauthorized(payload) {
  state.auth = {
    ...state.auth,
    configured: Boolean(payload?.configured ?? true),
    authenticated: false,
  };
  if (typeof payload?.idleTimeoutSeconds === "number") {
    state.auth.idleTimeoutSeconds = payload.idleTimeoutSeconds;
  }
  lockSessionUi("Your tracker is locked. Please unlock it to continue.");
}

function scheduleSessionLock() {
  if (sessionLockTimer) window.clearTimeout(sessionLockTimer);
  if (!state.auth?.authenticated || !sessionLastAuthenticatedAt) return;

  const elapsed = Date.now() - sessionLastAuthenticatedAt;
  const remaining = sessionTimeoutMs() - elapsed - SESSION_LOCK_BUFFER_MS;
  sessionLockTimer = window.setTimeout(() => {
    lockSessionUi("Your tracker locked after being idle. Unlock it to continue.");
  }, Math.max(0, remaining));
}

function sessionExpiredLocally() {
  if (!sessionLastAuthenticatedAt) return false;
  return Date.now() - sessionLastAuthenticatedAt >= sessionTimeoutMs() - SESSION_LOCK_BUFFER_MS;
}

function handleSessionUserActivity() {
  if (!state.auth?.authenticated) return;
  if (sessionExpiredLocally()) {
    lockSessionUi("Your tracker locked after being idle. Unlock it to continue.");
    return;
  }
  touchSessionIfNeeded();
}

function handleSessionWakeCheck() {
  if (!state.auth?.authenticated) return;
  if (document.visibilityState === "hidden") return;
  if (sessionExpiredLocally()) {
    lockSessionUi("Your tracker locked after being idle. Unlock it to continue.");
  }
}

async function touchSessionIfNeeded() {
  if (sessionTouchInFlight || !state.auth?.authenticated) return;
  if (Date.now() - sessionLastAuthenticatedAt < SESSION_TOUCH_INTERVAL_MS) return;

  sessionTouchInFlight = true;
  try {
    const auth = await getAuthStatus();
    state.auth = { ...state.auth, ...auth };
    if (!auth.authenticated) {
      lockSessionUi("Your tracker locked after being idle. Unlock it to continue.");
    }
  } catch (error) {
    console.warn("Could not refresh the local tracker session.", error);
  } finally {
    sessionTouchInFlight = false;
  }
}

function lockSessionUi(message) {
  stopSessionMonitor();
  state.auth = {
    ...state.auth,
    authenticated: false,
  };
  closeDialogsForSessionLock();
  if (typeof renderAuthGate === "function") {
    renderAuthGate(state.auth, message);
  }
}

function closeDialogsForSessionLock() {
  const openDialogs = Array.from(document.querySelectorAll("dialog[open]"));
  if (openDialogs.length) {
    sessionLockedDialogIds = openDialogs.map((dialog) => dialog.id).filter(Boolean);
  }
  openDialogs.forEach((dialog) => dialog.close());
}

function restoreDialogsAfterSessionUnlock() {
  const dialogsToRestore = sessionLockedDialogIds;
  sessionLockedDialogIds = [];
  dialogsToRestore.forEach((dialogId) => {
    const dialog = document.getElementById(dialogId);
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
  });
}
