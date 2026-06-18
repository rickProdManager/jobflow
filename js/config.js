// Shared app constants and mutable client state.

const STALE_AFTER_DAYS = 7;
const TIMELINE_PAGE_SIZE = 10;
const API_BASE = "/api";
const PASSWORD_MIN_LENGTH = 15;
const DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS = 4 * 60 * 60;
const SESSION_LOCK_BUFFER_MS = 5000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

const state = {
  applications: [],
  events: [],
  tasks: [],
  activeView: "dashboard",
  search: "",
  stageFilter: "All",
  applicationIdsFilter: null,
  applicationFilterLabel: "",
  analyticsSegment: "stage",
  analyticsFrom: "",
  analyticsTo: "",
  analyticsChart: "flow",
  timelineStatusFilter: "all",
  timelinePage: 0,
  auth: {
    configured: false,
    authenticated: false,
    idleTimeoutSeconds: DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS,
  },
};

const stores = ["applications", "events", "tasks"];

const stageOrder = [
  "Applied",
  "Recruiter Screen",
  "Technical Screen",
  "Final Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Abandoned",
];

const eventLabels = {
  job_saved: "Job saved",
  application_submitted: "Application submitted",
  follow_up_sent: "Follow-up sent",
  recruiter_replied: "Recruiter replied",
  internal_contact_replied: "Internal contact replied",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  thank_you_sent: "Thank-you sent",
  offer_received: "Offer received",
  rejected: "Rejected",
  abandoned_no_response: "Abandoned - no response",
  next_action_completed: "Next action completed",
  next_action_unavailable: "Follow-up unavailable",
  note_added: "Note added",
};

const taskCompletionMethodLabels = {
  email_sent: "Email sent",
  linkedin_message: "LinkedIn message",
  phone_call: "Phone call",
  application_portal: "Application portal",
  other: "Other contact",
};
