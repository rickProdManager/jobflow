// SQLite API client, legacy migration, backups, and document uploads.

async function api(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...fetchOptions,
    headers: { "Content-Type": "application/json", ...headers },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/") && typeof renderAuthGate === "function") {
      handleApiUnauthorized(payload);
    }
    throw new Error(payload?.error || `API request failed: ${response.status}`);
  }

  if (typeof noteSessionActivityFromApi === "function") {
    noteSessionActivityFromApi(path, payload);
  }

  return payload;
}

async function getAuthStatus() {
  return api("/auth/status");
}

async function setupAuth(password) {
  return api("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function loginAuth(password) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function logoutAuth() {
  return api("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function getAll(storeName) {
  return api(`/${storeName}`);
}

async function put(storeName, record) {
  return api(`/${storeName}`, {
    method: "PUT",
    body: JSON.stringify(record),
  });
}

async function remove(storeName, id) {
  return api(`/${storeName}/${id}`, { method: "DELETE" });
}

async function migrateLegacyIndexedDbIfNeeded() {
  const existingSqliteApplications = await getAll("applications");
  if (existingSqliteApplications.length) return;

  const legacyData = await readLegacyIndexedDb();
  if (!legacyData || !legacyData.applications.length) return;

  await api("/import", {
    method: "POST",
    body: JSON.stringify(legacyData),
  });
}

function readLegacyIndexedDb() {
  return new Promise((resolve) => {
    const request = indexedDB.open("job-application-tracker");

    request.onerror = () => resolve(null);

    request.onupgradeneeded = () => {
      request.transaction.abort();
      resolve(null);
    };

    request.onsuccess = async () => {
      const legacyDb = request.result;
      const hasStores = stores.every((storeName) => legacyDb.objectStoreNames.contains(storeName));
      if (!hasStores) {
        legacyDb.close();
        resolve(null);
        return;
      }

      const transaction = legacyDb.transaction(stores, "readonly");
      const reads = stores.map((storeName) => legacyRequestToPromise(transaction.objectStore(storeName).getAll()));
      const [applications, events, tasks] = await Promise.all(reads);
      legacyDb.close();
      resolve({ applications, events, tasks });
    };
  });
}

function legacyRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadAll() {
  const [applications, events, tasks] = await Promise.all([
    getAll("applications"),
    getAll("events"),
    getAll("tasks"),
  ]);

  state.events = events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  state.tasks = tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  state.applications = applications.sort(compareApplicationsForList);
}

async function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    applications: state.applications,
    events: state.events,
    tasks: state.tasks,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-tracker-backup-${toDateInput(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    alert("That file is not valid JSON.");
    return;
  }

  if (!Array.isArray(payload.applications) || !Array.isArray(payload.events) || !Array.isArray(payload.tasks)) {
    alert("This JSON file does not look like a tracker backup.");
    return;
  }

  if (!confirm("Importing will replace the current local tracker data.")) return;

  await api("/import", {
    method: "POST",
    body: JSON.stringify({
      applications: payload.applications,
      events: payload.events,
      tasks: payload.tasks,
    }),
  });

  await loadAll();
  render();
}

async function handleDocumentUpload(fileInputId, nameInputId, pathInputId) {
  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];
  if (!file) return;

  const nameInput = document.getElementById(nameInputId);
  const pathInput = document.getElementById(pathInputId);
  const originalPlaceholder = pathInput.placeholder;
  pathInput.placeholder = "Saving selected file...";

  try {
    const uploaded = await uploadFile(file);
    if (!nameInput.value.trim()) {
      nameInput.value = file.name.replace(/\.[^.]+$/, "");
    }
    pathInput.value = uploaded.storedPath;
  } catch (error) {
    alert("The file could not be saved. Please try again.");
    console.error(error);
  } finally {
    pathInput.placeholder = originalPlaceholder;
  }
}

async function uploadFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return api("/files", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      data: btoa(binary),
    }),
  });
}
