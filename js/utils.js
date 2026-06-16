// General formatting, date, and UI utility helpers.

function stageClass(stage) {
  return `stage-${stage.split(" ")[0]}`;
}

function isClosed(stage) {
  return ["Offer", "Rejected", "Withdrawn", "Abandoned", "Ghosted"].includes(stage);
}

function daysAgo(count) {
  return addDays(new Date(), -count);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function daysSince(dateString) {
  const date = new Date(`${dateOnly(dateString)}T00:00:00`);
  const today = startOfToday();
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function daysBetween(startDateString, endDateString) {
  const start = new Date(`${dateOnly(startDateString)}T00:00:00`);
  const end = new Date(`${dateOnly(endDateString)}T00:00:00`);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function endOfToday() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${dateString}T00:00:00`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
