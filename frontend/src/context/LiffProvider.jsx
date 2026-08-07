import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import liff from "@line/liff";
import api from "../services/api";
import { FullPageLoading } from "../components/Loading";
import { debugLog } from "../utils/debugLogger";
import { LiffContext } from "./LiffContext";

const SIZE_KEY = "liff_size";
const DEFAULT_SIZE = "full";

function getLiffSize() {
  const match = window.location.pathname.match(/^\/liff\/([^/]+)/);
  if (match) return match[1];
  return window.localStorage.getItem(SIZE_KEY) || DEFAULT_SIZE;
}

/**
 * Fetch LIFF ID and call liff.init().
 */
async function initLiffSdk() {
  const { data } = await api.get(`/api/liff-ids?size=${getLiffSize()}`);
  await liff.init({ liffId: data.id });
  return data.id;
}

export default function LiffProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [liffCtx, setLiffCtx] = useState({});
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const initPromiseRef = useRef(null);
  const initStartedRef = useRef(false);

  // `loggedIn` now means "the backend holds a session for us", not "the LIFF
  // SDK has a token". The only credential in the browser is the HttpOnly
  // redive_session cookie, which JS cannot read — so /api/me is the probe.
  const applyProfile = useCallback(data => {
    setProfile(data);
    setIsAdmin(data.privilege !== undefined);
    setLoggedIn(true);
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setIsAdmin(false);
    setLoggedIn(false);
  }, []);

  /**
   * @returns {Promise<"ok"|"unauthorized"|"error">}
   */
  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/api/me");
      applyProfile(data);
      debugLog("FETCH_PROFILE_OK", {
        isAdmin: data.privilege !== undefined,
        userId: data.userId?.substring(0, 8),
      });
      return "ok";
    } catch (err) {
      const status = err.response?.status;
      debugLog("FETCH_PROFILE_FAIL", { status, message: err.message });
      if (status === 401) {
        clearProfile();
        return "unauthorized";
      }
      // 503 (Redis down) / network / 5xx are transient: the cookie may still
      // be perfectly valid, so don't tear the session down over it.
      return "error";
    }
  }, [applyProfile, clearProfile]);

  // Any 401 anywhere in the app means the cookie session is gone. Sync the
  // logged-out state and stop there: no automatic re-exchange, because the
  // bootstrap effect below owns the single exchange attempt and a second
  // trigger point is exactly how this turns into a login loop.
  //
  // Registered before the bootstrap effect so the bootstrap's own initial 401
  // is observed too — that path is harmless, it clears state that a later
  // successful exchange then restores via applyProfile.
  useEffect(() => {
    window.addEventListener("auth:unauthorized", clearProfile);
    return () => window.removeEventListener("auth:unauthorized", clearProfile);
  }, [clearProfile]);

  useEffect(() => {
    // Guard against StrictMode double-invoke — ref survives unmount/remount
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    debugLog("INIT_START", { route: window.location.pathname });

    // Always run liff.init(): LIFF's secondary redirect lands on the user's
    // intended path (e.g. /rankings) without a /liff/ prefix or liff.state
    // query, so path-based detection misses canonical LIFF URL entries.
    // Calling init unconditionally is the only reliable way to recover the
    // LIFF browser session.
    if (!initPromiseRef.current) {
      initPromiseRef.current = initLiffSdk();
    }

    initPromiseRef.current
      .then(() => {
        debugLog("LIFF_SDK_INIT", { success: true, isLoggedIn: liff.isLoggedIn() });
        try {
          setLiffCtx(liff.getContext() || {});
        } catch (err) {
          console.warn("Failed to get LIFF context:", err);
        }
        return true;
      })
      .catch(err => {
        debugLog("LIFF_SDK_INIT", { success: false, error: err.message });
        console.warn("LIFF init failed:", err);
        return false;
      })
      .then(async sdkReady => {
        // Existing cookie session first — the common case, and the only path
        // available to a browser that never went through LIFF login.
        if ((await fetchProfile()) !== "unauthorized") return;

        // Exactly one ID-token exchange attempt. Anything that fails here
        // leaves the user logged out until they press login, which is what
        // stops this from becoming a redirect loop.
        if (!sdkReady || !liff.isLoggedIn()) return;

        let idToken;
        try {
          idToken = liff.getIDToken();
        } catch (err) {
          debugLog("ID_TOKEN_FAIL", { message: err.message });
          return;
        }
        if (!idToken) {
          debugLog("ID_TOKEN_MISSING");
          return;
        }

        try {
          await api.post("/api/auth/session", { idToken });
          debugLog("SESSION_EXCHANGE_OK");
        } catch (err) {
          debugLog("SESSION_EXCHANGE_FAIL", {
            status: err.response?.status,
            message: err.message,
          });
          return;
        }

        await fetchProfile();
      })
      .catch(err => {
        // Never let bootstrap reject: `ready` must still flip or the app
        // stays stuck on the full-page spinner forever.
        debugLog("BOOTSTRAP_FAIL", { message: err.message });
        console.warn("Auth bootstrap failed:", err);
      })
      .finally(() => {
        debugLog("READY");
        setReady(true);
      });
  }, [fetchProfile]);

  const login = useCallback(async () => {
    // Reuse in-flight init or start a new one
    if (!initPromiseRef.current) {
      initPromiseRef.current = initLiffSdk();
    }
    try {
      await initPromiseRef.current;
    } catch (err) {
      console.warn("LIFF init failed:", err);
      return;
    }
    const { pathname, search } = window.location;
    const redirectUri = `${window.location.origin}/liff/${getLiffSize()}${pathname}${search}`;
    liff.login({ redirectUri });
  }, []);

  const logout = useCallback(async () => {
    // Server first: the cookie is HttpOnly, so only the backend can revoke
    // it. Bailing out on failure keeps the UI honest instead of showing a
    // logged-out shell that still carries a live session.
    try {
      await api.post("/api/auth/logout");
    } catch (err) {
      console.warn("Logout failed:", err);
      return;
    }

    clearProfile();
    try {
      liff.logout();
    } catch {
      // SDK not initialized, nothing to clean up
    }
    window.location.reload();
  }, [clearProfile]);

  const value = useMemo(
    () => ({ ready, loggedIn, isAdmin, profile, liffContext: liffCtx, login, logout }),
    [ready, loggedIn, isAdmin, profile, liffCtx, login, logout]
  );

  if (!ready) {
    return <FullPageLoading />;
  }

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}
