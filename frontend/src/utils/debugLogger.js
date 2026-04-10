const logs = [];
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

  // Also log to console for desktop debugging
  console.log(`[DEBUG ${timestamp}] ${event} ${dataStr}`);
}

export function getDebugLogs() {
  return logs;
}

export function formatDebugLogs() {
  const header = [
    `LIFF Debug Log`,
    `URL: ${window.location.href}`,
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
