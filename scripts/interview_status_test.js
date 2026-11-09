#!/usr/bin/env node
// Verifies derived interview completion and cancellation behavior.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const state = { applications: [], events: [] };
const sandbox = { console, state };

vm.createContext(sandbox);
["js/config.js", "js/utils.js", "js/models.js", "js/analytics.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
});
sandbox.visibleEvents = (events) => events.filter((event) => event.type !== "job_saved");

const application = {
  id: "example-application",
  companyName: "Example Company",
  jobTitle: "Example Role",
  applicationPath: "direct",
  stage: "Applied",
  createdAt: "2026-11-01",
};
const scheduledInterview = {
  id: "scheduled-interview",
  applicationId: application.id,
  type: "interview_scheduled",
  occurredAt: "2026-11-01",
  scheduledFor: "2026-11-07",
  createdAt: "2026-11-01T12:00:00Z",
};

assert.equal(
  sandbox.interviewCompletionStatus(scheduledInterview, [scheduledInterview], "2026-11-07"),
  "scheduled",
  "a date-only interview must remain scheduled throughout its planned day",
);
assert.equal(
  sandbox.interviewCompletionStatus(scheduledInterview, [scheduledInterview], "2026-11-08"),
  "completed",
  "an interview must complete automatically on the following local day",
);
assert.equal(
  sandbox.interviewStatusSuffix(scheduledInterview, [scheduledInterview], "2026-11-08"),
  " · Completed automatically",
);

const rescheduledInterview = { ...scheduledInterview, scheduledFor: "2026-11-10" };
assert.equal(
  sandbox.interviewCompletionStatus(rescheduledInterview, [rescheduledInterview], "2026-11-08"),
  "scheduled",
  "a later rescheduled date must remain scheduled",
);

const cancellation = {
  id: "cancelled-interview",
  applicationId: application.id,
  type: "interview_cancelled",
  scheduledEventId: scheduledInterview.id,
  occurredAt: "2026-11-06",
  scheduledFor: scheduledInterview.scheduledFor,
};
assert.equal(
  sandbox.interviewCompletionStatus(scheduledInterview, [scheduledInterview, cancellation], "2026-11-08"),
  "cancelled",
  "a linked cancellation must override automatic completion",
);

function setApplicationState(events) {
  sandbox.__testApplication = application;
  sandbox.__testEvents = events;
  vm.runInContext("state.applications = [__testApplication]; state.events = __testEvents;", sandbox);
}

setApplicationState([scheduledInterview]);
assert.equal(
  sandbox.isCompletedScheduledInterview(scheduledInterview),
  true,
  "a past scheduled interview must be recognized as complete",
);
assert.equal(
  sandbox.eventDisplayLabel(scheduledInterview),
  "Interview completed",
  "a completed scheduled interview must use the completed display label",
);
const laterInterview = {
  ...scheduledInterview,
  id: "later-interview",
  scheduledFor: "2026-11-12",
  createdAt: "2026-11-02T12:00:00Z",
};
const interveningActivity = {
  id: "intervening-activity",
  applicationId: application.id,
  type: "follow_up_sent",
  occurredAt: "2026-11-10",
  createdAt: "2026-11-10T12:00:00Z",
};
assert.deepEqual(
  [scheduledInterview, interveningActivity, laterInterview]
    .sort((left, right) => sandbox.activityTimelineSortKey(right).localeCompare(sandbox.activityTimelineSortKey(left)))
    .map((event) => event.id),
  ["later-interview", "intervening-activity", "scheduled-interview"],
  "application timelines must sort interviews by planned date, newest first",
);
assert.equal(
  sandbox.conversionMetrics([application], [scheduledInterview]).interviewed,
  1,
  "automatic completion must count as interviewed in analytics",
);
setApplicationState([scheduledInterview, cancellation]);
assert.equal(
  sandbox.conversionMetrics([application], [scheduledInterview, cancellation]).interviewed,
  0,
  "cancelled interviews must not count as interviewed",
);
assert.equal(
  sandbox.applicationFlowRoute(application).some((step) => step.phase === "interview"),
  false,
  "cancelled interviews must not create Flow map interview steps",
);

console.log("Interview status test passed");
