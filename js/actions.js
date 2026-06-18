// Event binding, dialogs, and mutating user actions.

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.activeView === button.dataset.view) return;
      state.activeView = button.dataset.view;
      pushHistoryState();
      render();
    });
  });

  document.getElementById("newApplicationButton").addEventListener("click", () => openApplicationDialog());
  document.getElementById("lockButton").addEventListener("click", lockTracker);
  document.getElementById("applicationForm").addEventListener("submit", saveApplication);
  document.getElementById("activityForm").addEventListener("submit", saveActivity);
  document.getElementById("taskForm").addEventListener("submit", saveTask);
  document.getElementById("taskCompletionForm").addEventListener("submit", saveTaskCompletion);
  document.getElementById("applicationPath").addEventListener("change", updateConditionalPathFields);
  document.getElementById("resumeFile").addEventListener("change", () => handleDocumentUpload("resumeFile", "resumeName", "resumePath"));
  document.getElementById("coverLetterFile").addEventListener("change", () => handleDocumentUpload("coverLetterFile", "coverLetterName", "coverLetterPath"));

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("applicationDialog").close());
  });

  document.querySelectorAll("[data-close-activity-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("activityDialog").close());
  });

  document.querySelectorAll("[data-close-task-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("taskDialog").close());
  });

  document.querySelectorAll("[data-close-task-completion-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("taskCompletionDialog").close());
  });
}

async function lockTracker() {
  try {
    await logoutAuth();
  } finally {
    window.location.reload();
  }
}


function bindCardActions() {
  document.querySelectorAll("[data-edit-application]").forEach((button) => {
    button.addEventListener("click", () => {
      const app = state.applications.find((item) => item.id === button.dataset.editApplication);
      openApplicationDialog(app);
    });
  });

  document.querySelectorAll("[data-add-activity]").forEach((button) => {
    button.addEventListener("click", () => openActivityDialog(button.dataset.addActivity));
  });

  document.querySelectorAll("[data-edit-activity]").forEach((button) => {
    button.addEventListener("click", () => {
      const activity = state.events.find((item) => item.id === button.dataset.editActivity);
      if (!activity) return;
      openActivityDialog(activity.applicationId, activity);
    });
  });

  document.querySelectorAll("[data-delete-activity]").forEach((button) => {
    button.addEventListener("click", async () => {
      const activity = state.events.find((item) => item.id === button.dataset.deleteActivity);
      if (!activity) return;
      const label = eventDisplayLabel(activity);
      if (!confirm(`Delete activity "${label}" from ${formatDate(activity.occurredAt)}?`)) return;
      await deleteActivity(activity);
    });
  });

  document.querySelectorAll("[data-add-task]").forEach((button) => {
    button.addEventListener("click", () => openTaskDialog(button.dataset.addTask));
  });

  document.querySelectorAll("[data-complete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleTaskCompletionButton(button);
    });
  });

  document.querySelectorAll("[data-delete-application]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this application and its related events/next actions?")) return;
      await deleteApplication(button.dataset.deleteApplication);
      await loadAll();
      render();
    });
  });
}

function openApplicationDialog(app = null) {
  document.getElementById("dialogTitle").textContent = app ? "Edit application" : "New application";
  document.getElementById("applicationId").value = app?.id || "";
  document.getElementById("companyName").value = app?.companyName || "";
  document.getElementById("jobTitle").value = app?.jobTitle || "";
  document.getElementById("stage").value = app ? applicationStage(app) : "Applied";
  document.getElementById("applicationPath").value = app?.applicationPath || inferApplicationPath(app);
  document.getElementById("location").value = app?.location || "";
  document.getElementById("workMode").value = app?.workMode || "Remote";
  const salary = salaryFieldsForApp(app);
  document.getElementById("salaryMin").value = salary.min || "";
  document.getElementById("salaryMax").value = salary.max || "";
  document.getElementById("jobUrl").value = app?.jobUrl || "";
  document.getElementById("resumeName").value = app?.resumeName || "";
  document.getElementById("resumePath").value = app?.resumePath || "";
  document.getElementById("resumeFile").value = "";
  document.getElementById("coverLetterName").value = app?.coverLetterName || "";
  document.getElementById("coverLetterPath").value = app?.coverLetterPath || "";
  document.getElementById("coverLetterFile").value = "";
  document.getElementById("portfolioPath").value = app?.portfolioPath || "";
  document.getElementById("tailoredDocuments").checked = Boolean(app?.tailoredDocuments);
  document.getElementById("documentNotes").value = app?.documentNotes || "";
  document.getElementById("referrerName").value = app?.referrerName || "";
  document.getElementById("referrerContact").value = app?.referrerContact || "";
  document.getElementById("headhunterName").value = app?.headhunterName || "";
  document.getElementById("headhunterContact").value = app?.headhunterContact || "";
  document.getElementById("notes").value = app?.notes || "";
  updateConditionalPathFields();
  document.getElementById("applicationDialog").showModal();
}

function openActivityDialog(applicationId, activity = null) {
  document.getElementById("activityDialogTitle").textContent = activity ? "Edit activity" : "Add activity";
  document.getElementById("activitySubmitButton").textContent = activity ? "Save activity" : "Add activity";
  document.getElementById("activityId").value = activity?.id || "";
  document.getElementById("activityApplicationId").value = applicationId;
  document.getElementById("activityType").value = activity?.type || "application_submitted";
  document.getElementById("occurredAt").value = activity?.occurredAt || toDateInput(new Date());
  document.getElementById("activityDescription").value = activity?.description || "";
  document.getElementById("activityDialog").showModal();
}

function openTaskDialog(applicationId) {
  const app = state.applications.find((item) => item.id === applicationId);
  document.getElementById("taskApplicationId").value = applicationId;
  document.getElementById("taskTitle").value = app ? `Follow up with ${app.companyName}` : "";
  document.getElementById("taskDueAt").value = toDateInput(addDays(new Date(), 7));
  document.getElementById("taskPriority").value = "Normal";
  document.getElementById("taskType").value = "Follow-up";
  document.getElementById("taskNotes").value = "";
  document.getElementById("taskDialog").showModal();
}

function openTaskCompletionDialog(task) {
  if (!task) return;
  const app = state.applications.find((item) => item.id === task.applicationId);
  document.getElementById("taskCompletionTaskId").value = task.id;
  document.getElementById("taskCompletionType").value = defaultTaskCompletionType(task);
  document.getElementById("taskCompletionDate").value = toDateInput(new Date());
  document.getElementById("taskCompletionMethod").value = "email_sent";
  document.getElementById("taskCompletionNotes").value = "";
  document.getElementById("taskCompletionContext").textContent = app
    ? `${task.title} - ${app.jobTitle} at ${app.companyName}`
    : task.title;
  document.getElementById("taskCompletionDialog").showModal();
}

async function handleTaskCompletionButton(button) {
  const task = state.tasks.find((item) => item.id === button.dataset.completeTask);
  if (!task) return;

  const outcome = button.dataset.taskOutcome || "done";
  if (outcome === "done") {
    openTaskCompletionDialog(task);
    return;
  }

  await completeNextAction(task, outcome);
}

async function saveTaskCompletion(event) {
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === document.getElementById("taskCompletionTaskId").value);
  if (!task) return;

  await completeNextAction(task, "done", {
    eventType: document.getElementById("taskCompletionType").value,
    occurredAt: document.getElementById("taskCompletionDate").value,
    method: document.getElementById("taskCompletionMethod").value,
    notes: document.getElementById("taskCompletionNotes").value.trim(),
  });
  document.getElementById("taskCompletionDialog").close();
}

async function completeNextAction(task, outcome = "done", details = {}) {
  if (!task) return;
  if (outcome === "unavailable" && !confirm("Mark this follow-up as unavailable because there is no contact information?")) {
    return;
  }

  const completedAt = new Date().toISOString();
  const completedDate = details.occurredAt || toDateInput(new Date(completedAt));
  const updatedTask = {
    ...task,
    completedAt,
  };

  const isUnavailable = outcome === "unavailable";
  const eventType = isUnavailable ? "next_action_unavailable" : details.eventType || defaultTaskCompletionType(task);
  const unavailableDescription = `No contact information available for: ${task.title}`;
  const completionDescription = buildTaskCompletionDescription(task, details);
  const activity = {
    id: crypto.randomUUID(),
    applicationId: task.applicationId,
    type: eventType,
    title: eventLabels[eventType] || eventLabels.next_action_completed,
    description: isUnavailable ? unavailableDescription : completionDescription,
    occurredAt: completedDate,
    createdAt: completedAt,
    source: "next_action",
  };

  await put("tasks", updatedTask);
  await put("events", activity);

  if (!isUnavailable) {
    await loadAll();
    await maybeGenerateReminder(activity);
  }

  await loadAll();
  render();
}

function defaultTaskCompletionType(task) {
  const text = `${task.title || ""} ${task.type || ""}`.toLowerCase();
  if (text.includes("thank")) return "thank_you_sent";
  if (text.includes("follow") || text.includes("reply") || text.includes("check")) return "follow_up_sent";
  return "next_action_completed";
}

function buildTaskCompletionDescription(task, details = {}) {
  const methodLabel = taskCompletionMethodLabels[details.method] || "";
  const heading = methodLabel ? `${methodLabel} - ${task.title}` : task.title;
  const notes = details.notes || "";
  const originalNotes = task.notes ? `Next action note: ${task.notes}` : "";
  return [heading, notes, originalNotes].filter(Boolean).join("\n\n");
}

function updateConditionalPathFields() {
  const path = document.getElementById("applicationPath").value;
  document.getElementById("applicationForm").dataset.applicationPath = path;

  document.querySelectorAll("[data-path-field]").forEach((field) => {
    const isVisible = field.dataset.pathField === path;
    field.hidden = !isVisible;
  });
}

async function saveApplication(event) {
  event.preventDefault();
  const id = document.getElementById("applicationId").value || crypto.randomUUID();
  const existing = state.applications.find((app) => app.id === id);
  const now = new Date().toISOString();
  const app = {
    id,
    companyName: document.getElementById("companyName").value.trim(),
    jobTitle: document.getElementById("jobTitle").value.trim(),
    stage: document.getElementById("stage").value,
    applicationPath: document.getElementById("applicationPath").value,
    source: existing?.source || "",
    referrerName: document.getElementById("referrerName").value.trim(),
    referrerContact: document.getElementById("referrerContact").value.trim(),
    headhunterName: document.getElementById("headhunterName").value.trim(),
    headhunterContact: document.getElementById("headhunterContact").value.trim(),
    location: document.getElementById("location").value.trim(),
    workMode: document.getElementById("workMode").value,
    salaryMin: numberOrBlank(document.getElementById("salaryMin").value),
    salaryMax: numberOrBlank(document.getElementById("salaryMax").value),
    salaryRange: "",
    jobUrl: document.getElementById("jobUrl").value.trim(),
    resumeName: document.getElementById("resumeName").value.trim(),
    resumePath: document.getElementById("resumePath").value.trim(),
    coverLetterName: document.getElementById("coverLetterName").value.trim(),
    coverLetterPath: document.getElementById("coverLetterPath").value.trim(),
    portfolioPath: document.getElementById("portfolioPath").value.trim(),
    tailoredDocuments: document.getElementById("tailoredDocuments").checked,
    documentNotes: document.getElementById("documentNotes").value.trim(),
    excitement: existing?.excitement || "",
    fit: existing?.fit || "",
    notes: document.getElementById("notes").value.trim(),
    createdAt: existing?.createdAt || toDateInput(new Date()),
    updatedAt: now,
  };

  await put("applications", app);

  if (!existing) {
    await put("events", {
      id: crypto.randomUUID(),
      applicationId: id,
      type: "job_saved",
      title: eventLabels.job_saved,
      description: "Application record created.",
      occurredAt: toDateInput(new Date()),
      createdAt: now,
    });
  }

  if (!firstEventDate(id, "application_submitted")) {
    const submittedActivity = {
      id: crypto.randomUUID(),
      applicationId: id,
      type: "application_submitted",
      title: eventLabels.application_submitted,
      description: "Application marked as submitted.",
      occurredAt: toDateInput(new Date()),
      createdAt: now,
    };
    await put("events", submittedActivity);
    await maybeGenerateReminder(submittedActivity, app);
  }

  document.getElementById("applicationDialog").close();
  await loadAll();
  render();
}

async function saveActivity(event) {
  event.preventDefault();
  const id = document.getElementById("activityId").value || crypto.randomUUID();
  const existing = state.events.find((item) => item.id === id);
  const applicationId = document.getElementById("activityApplicationId").value;
  const type = document.getElementById("activityType").value;
  const occurredAt = document.getElementById("occurredAt").value;
  const description = document.getElementById("activityDescription").value.trim();
  const now = new Date().toISOString();

  const duplicate = findDuplicateActivity({ id, applicationId, type, occurredAt });
  if (duplicate) {
    const duplicateLabel = eventDisplayLabel(duplicate);
    const acknowledged = confirm(
      `This application already has "${duplicateLabel}" on ${formatDate(duplicate.occurredAt)}. ${existing ? "Save" : "Add"} it anyway?`
    );
    if (!acknowledged) return;
  }

  const activity = {
    id,
    applicationId,
    type,
    title: eventLabels[type],
    description,
    occurredAt,
    createdAt: existing?.createdAt || now,
  };

  await put("events", activity);
  if (!existing) {
    await maybeGenerateReminder(activity);
  }
  await refreshApplicationStage(applicationId);

  document.getElementById("activityDialog").close();
  await loadAll();
  render();
}

async function deleteActivity(activity) {
  await remove("events", activity.id);
  await refreshApplicationStage(activity.applicationId);
  await loadAll();
  render();
}

function findDuplicateActivity(candidate) {
  return visibleEvents(eventsFor(candidate.applicationId)).find((event) => (
    event.id !== candidate.id &&
    event.type === candidate.type &&
    (isSingleInstanceActivity(candidate.type) || dateOnly(event.occurredAt) === dateOnly(candidate.occurredAt))
  ));
}

function isSingleInstanceActivity(type) {
  return ["application_submitted", "offer_received", "rejected", "abandoned_no_response"].includes(type);
}

async function saveTask(event) {
  event.preventDefault();
  const now = new Date().toISOString();
  await put("tasks", {
    id: crypto.randomUUID(),
    applicationId: document.getElementById("taskApplicationId").value,
    title: document.getElementById("taskTitle").value.trim(),
    dueAt: document.getElementById("taskDueAt").value,
    priority: document.getElementById("taskPriority").value,
    type: document.getElementById("taskType").value,
    notes: document.getElementById("taskNotes").value.trim(),
    completedAt: "",
    source: "manual",
    relatedEventId: "",
    createdAt: now,
  });

  document.getElementById("taskDialog").close();
  await loadAll();
  render();
}

async function maybeGenerateReminder(activity, appOverride = null) {
  const reminderMap = {
    application_submitted: 7,
    follow_up_sent: 7,
    recruiter_replied: 5,
    internal_contact_replied: 5,
    interview_completed: 1,
  };

  const delay = reminderMap[activity.type];
  if (!delay) return;

  const app = appOverride || state.applications.find((item) => item.id === activity.applicationId);
  if (!app || isClosed(applicationStage(app))) return;

  const titleMap = {
    application_submitted: `Follow up with ${app.companyName}`,
    follow_up_sent: `Check for reply from ${app.companyName}`,
    recruiter_replied: `Reply or prepare next step for ${app.companyName}`,
    internal_contact_replied: `Reply or prepare next step for ${app.companyName}`,
    interview_completed: `Send thank-you note to ${app.companyName}`,
  };

  if (hasOpenAutoReminder(activity.applicationId)) return;

  await put("tasks", {
    id: crypto.randomUUID(),
    applicationId: activity.applicationId,
    title: titleMap[activity.type],
    dueAt: toDateInput(addDays(new Date(activity.occurredAt), delay)),
    completedAt: "",
    source: "auto",
    relatedEventId: activity.id,
    createdAt: new Date().toISOString(),
  });
}

function hasOpenAutoReminder(applicationId) {
  return state.tasks.some((task) => (
    task.applicationId === applicationId &&
    task.source === "auto" &&
    !task.completedAt
  ));
}

async function refreshApplicationStage(applicationId) {
  const app = state.applications.find((item) => item.id === applicationId);
  if (!app) return;

  const nextStage = stageFromActivities(applicationId, app.stage);

  if (!nextStage || nextStage === app.stage) return;

  await put("applications", {
    ...app,
    stage: nextStage,
    updatedAt: new Date().toISOString(),
  });
}

function stageFromActivities(applicationId, currentStage) {
  const events = visibleEvents(eventsFor(applicationId));
  const terminalStage = latestTerminalEventStage(applicationId);
  if (terminalStage) return terminalStage;

  const normalizedCurrent = normalizeStage(currentStage);
  if (!isClosed(normalizedCurrent)) return normalizedCurrent;

  if (events.some((event) => event.type.includes("interview"))) return "Recruiter Screen";
  if (events.some((event) => event.type === "application_submitted")) return "Applied";
  return "Applied";
}

async function deleteApplication(applicationId) {
  const relatedEvents = state.events.filter((event) => event.applicationId === applicationId);
  const relatedTasks = state.tasks.filter((task) => task.applicationId === applicationId);

  await Promise.all([
    remove("applications", applicationId),
    ...relatedEvents.map((event) => remove("events", event.id)),
    ...relatedTasks.map((task) => remove("tasks", task.id)),
  ]);
}
