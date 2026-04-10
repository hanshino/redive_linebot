const STORAGE_KEY = "liff_debug_logs";
const startTime = Date.now();

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "1") {
    window.localStorage.setItem("liff_debug", "1");
    return true;
  }
  return window.localStorage.getItem("liff_debug") === "1";
}

const debugEnabled = isDebugEnabled();

// Load existing logs from sessionStorage (survives redirects)
function loadLogs() {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // sessionStorage full or unavailable
  }
}

const logs = loadLogs();

// Mark each page load so we can see redirects in the log
if (debugEnabled) {
  const entry = {
    timestamp: "---",
    event: "PAGE_LOAD",
    dataStr: `url=${window.location.href}`,
    raw: { url: window.location.href },
  };
  logs.push(entry);
  saveLogs(logs);
}

export function debugLog(event, data = {}) {
  if (!debugEnabled) return;
  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const ms = elapsed % 1000;
  const timestamp = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;

  const dataStr = Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const entry = { timestamp, event, dataStr, raw: data };
  logs.push(entry);
  saveLogs(logs);

  // Also log to console for desktop debugging
  console.log(`[DEBUG ${timestamp}] ${event} ${dataStr}`);
}

export function getDebugLogs() {
  return logs;
}

export function formatDebugLogs() {
  const header = [
    `LIFF Debug Log`,
    `UA: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
    `---`,
  ].join("\n");

  const body = logs.map(l => `[${l.timestamp}] ${l.event} ${l.dataStr}`).join("\n");

  return `${header}\n${body}`;
}

export function isDebugMode() {
  return debugEnabled;
}

export function clearDebugLogs() {
  logs.length = 0;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
