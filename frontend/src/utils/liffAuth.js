import liff from "@line/liff";

const SIZE_KEY = "liff_size";
const DEFAULT_SIZE = "full";

export function getLiffSize() {
  const match = window.location.pathname.match(/^\/liff\/([^/]+)/);
  return match?.[1] || window.localStorage.getItem(SIZE_KEY) || DEFAULT_SIZE;
}

export function buildLiffRedirectUri(size, location = window.location) {
  const current = new URL(
    location.href || `${location.origin}${location.pathname}${location.search}${location.hash}`
  );
  const liffPath = current.pathname.match(/^\/liff\/[^/]+(\/.*)?$/);
  const childPath = liffPath ? liffPath[1] || "/" : current.pathname;
  const search = new URLSearchParams(current.search);

  ["code", "state", "liffClientId", "liffRedirectUri", "liff.state"].forEach(param =>
    search.delete(param)
  );

  const query = search.toString();
  return `${current.origin}/liff/${size}${childPath}${query ? `?${query}` : ""}${current.hash}`;
}

// LIFF error shapes we can actually rely on (@line/liff 2.29.1):
// `@liff/server-api` throws a LiffError whose `code` is either the literal
// HTTP status string ("401" is in its HTTPStatusCodes set) or an error code
// echoed from LINE's response body; a missing access token throws the
// UNAUTHORIZED const. Nothing else about the shape is documented, so we match
// only those and treat every other failure as a plain error.
const AUTH_ERROR_CODES = new Set(["401", "UNAUTHORIZED", "INVALID_ID_TOKEN"]);

export function isLiffAuthError(err) {
  if (!err) return false;

  const code = err.code;
  if (code === 401) return true;
  if (typeof code === "string" && AUTH_ERROR_CODES.has(code.toUpperCase())) return true;

  return false;
}

/**
 * Re-login only when the SDK itself says we have no LIFF session. Never call
 * this speculatively: liff.login() is a full page redirect, so firing it on a
 * generic failure (network blip, 429, user cancel) is how you get a loop.
 *
 * Throws whatever the SDK throws — notably INIT_FAILED when liff.init() never
 * ran. `runLiffAction` is what converts that into a plain failure result.
 *
 * @returns {boolean} false when a redirect was triggered — stop what you were doing.
 */
export function ensureLiffLogin() {
  if (liff.isLoggedIn()) return true;
  liff.login({ redirectUri: buildLiffRedirectUri(getLiffSize()) });
  return false;
}

/**
 * Run a LIFF action that needs a live LINE credential (sendMessages,
 * shareTargetPicker). Re-auths once, and only on an explicit auth error.
 *
 * Never throws and never leaves a pending promise: an uninitialised SDK
 * resolves to `{ ok: false, error }`, so callers like useSendMessage always
 * get to clear their loading state.
 *
 * @returns {Promise<{ ok: boolean, value?: unknown, error?: unknown, reauth?: boolean }>}
 */
export async function runLiffAction(action) {
  try {
    // liff.isLoggedIn() / liff.login() both throw INIT_FAILED when the SDK
    // was never initialised. Redirecting to login cannot fix that, so it is
    // reported as an ordinary failure.
    if (!ensureLiffLogin()) return { ok: false, reauth: true };
  } catch (err) {
    return { ok: false, error: err };
  }

  try {
    return { ok: true, value: await action() };
  } catch (err) {
    if (!isLiffAuthError(err)) return { ok: false, error: err };

    // Explicit unauthorized / expired token: one redirect, no retry loop.
    try {
      liff.login({ redirectUri: buildLiffRedirectUri(getLiffSize()) });
    } catch (loginErr) {
      return { ok: false, error: loginErr };
    }
    return { ok: false, error: err, reauth: true };
  }
}
