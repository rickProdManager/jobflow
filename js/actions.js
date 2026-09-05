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
  document.getElementById("activityType").addEventListener("change", updateActivityTypeFields);
  document.getElementById("interviewScheduledFor").addEventListener("input", updateActivityTypeFields);
  document.getElementById("applicationPath").addEventListener("change", updateConditionalPathFields);
  document.getElementById("resumeFile").addEventListener("change", () => handleDocumentUpload("resumeFile", "resumeName", "resumePath"));
  document.getElementById("coverLetterFile").addEventListener("change", () => handleDocumentUpload("coverLetterFile", "coverLetterName", "coverLetterPath"));

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("applicationDialog").close());
  });

  document.querySelectorAll("[data-close-activity-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("activityDialog").close());
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

  document.querySelectorAll("[data-delete-application]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this application and its related activities?")) return;
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
  document.getElementById("activityId").value = activity?.id || "";
  document.getElementById("activityApplicationId").value = applicationId;
  document.getElementById("activityType").value = activity?.type || "application_submitted";
  document.getElementById("occurredAt").value = activity?.occurredAt || toDateInput(new Date());
  document.getElementById("interviewScheduledFor").value = activity?.scheduledFor || "";
  document.getElementById("activityDescription").value = activity?.description || "";
  updateActivityTypeFields();
  document.getElementById("activityDialog").showModal();
}

function updateActivityTypeFields() {
  const isInterviewScheduled = document.getElementById("activityType").value === "interview_scheduled";
  const scheduledForField = document.getElementById("interviewScheduledForField");
  const scheduledForInput = document.getElementById("interviewScheduledFor");
  const reschedule = pendingInterviewReschedule();
  const isEditing = Boolean(document.getElementById("activityId").value);
  const dialogTitle = document.getElementById("activityDialogTitle");
  const submitButton = document.getElementById("activitySubmitButton");
  const rescheduleHint = document.getElementById("interviewRescheduleHint");

  scheduledForField.hidden = !isInterviewScheduled;
  scheduledForInput.required = isInterviewScheduled;
  document.getElementById("occurredAtLabel").textContent = isInterviewScheduled ? "Scheduled on" : "Date done";

  dialogTitle.textContent = reschedule ? "Reschedule interview" : (isEditing ? "Edit activity" : "Add activity");
  submitButton.textContent = reschedule ? "Save reschedule" : (isEditing ? "Save activity" : "Add activity");
  rescheduleHint.hidden = !reschedule;
  rescheduleHint.textContent = reschedule
    ? `Saving will record that the interview moved from ${formatDate(reschedule.previousScheduledFor)} to ${formatDate(reschedule.scheduledFor)}.`
    : "";
}

function pendingInterviewReschedule() {
  const activityId = document.getElementById("activityId").value;
  const existing = state.events.find((event) => event.id === activityId);
  const type = document.getElementById("activityType").value;
  const scheduledFor = document.getElementById("interviewScheduledFor").value;
  return interviewRescheduleFor(existing, type, scheduledFor);
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
  const scheduledFor = type === "interview_scheduled" ? document.getElementById("interviewScheduledFor").value : "";
  const description = document.getElementById("activityDescription").value.trim();
  const now = new Date().toISOString();
  const reschedule = interviewRescheduleFor(existing, type, scheduledFor);

  const duplicate = allowsMultipleActivities(type)
    ? null
    : findDuplicateActivity({ id, applicationId, type, occurredAt });
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
    scheduledFor,
    createdAt: existing?.createdAt || now,
  };

  await put("events", activity);
  if (reschedule) {
    await put("events", createInterviewRescheduleActivity({
      applicationId,
      interviewEventId: id,
      previousScheduledFor: reschedule.previousScheduledFor,
      scheduledFor,
      now,
    }));
  }
  document.getElementById("activityDialog").close();
  await loadAll();
  render();
}

async function deleteActivity(activity) {
  const relatedReschedules = activity.type === "interview_scheduled"
    ? state.events.filter((event) => event.type === "interview_rescheduled" && event.interviewEventId === activity.id)
    : [];
  await Promise.all([
    remove("events", activity.id),
    ...relatedReschedules.map((event) => remove("events", event.id)),
  ]);
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
  return ["application_submitted", "offer_received", "offer_accepted", "rejected", "abandoned_no_response"].includes(type);
}

function allowsMultipleActivities(type) {
  return ["interview_scheduled", "interview_completed", "interview_rescheduled"].includes(type);
}

function interviewRescheduleFor(existing, type, scheduledFor) {
  if (
    existing?.type !== "interview_scheduled" ||
    type !== "interview_scheduled" ||
    !existing.scheduledFor ||
    !scheduledFor ||
    existing.scheduledFor === scheduledFor
  ) return null;

  return {
    previousScheduledFor: existing.scheduledFor,
    scheduledFor,
  };
}

function createInterviewRescheduleActivity({ applicationId, interviewEventId, previousScheduledFor, scheduledFor, now }) {
  return {
    id: crypto.randomUUID(),
    applicationId,
    type: "interview_rescheduled",
    title: "Interview rescheduled",
    description: `Interview date moved from ${formatDate(previousScheduledFor)} to ${formatDate(scheduledFor)}.`,
    occurredAt: toDateInput(new Date()),
    scheduledFor,
    previousScheduledFor,
    interviewEventId,
    createdAt: now,
    source: "manual",
  };
}

async function deleteApplication(applicationId) {
  await remove("applications", applicationId);
}
