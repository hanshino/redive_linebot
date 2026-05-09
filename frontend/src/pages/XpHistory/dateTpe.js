// Backend day boundary is Asia/Taipei (UTC+8); see XpHistoryService.todayDateUtc8.
const DATE_FMT_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_FMT_BADGE = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

export function todayTpe() {
  return DATE_FMT_ISO.format(new Date());
}

export function tpeDate(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT_ISO.format(d);
}

export function addDaysTpe(date, days) {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return DATE_FMT_ISO.format(d);
}

export function formatDateBadge(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return DATE_FMT_BADGE.format(d).replace("週", "");
}
