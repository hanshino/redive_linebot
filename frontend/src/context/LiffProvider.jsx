import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import liff from "@line/liff";
import api, { setAuthToken, clearAuthToken } from "../services/api";
import { FullPageLoading } from "../components/Loading";
import { debugLog } from "../utils/debugLogger";
import { LiffContext } from "./LiffContext";

const TOKEN_KEY = "liff_access_token";
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

  const fetchProfile = useCallback(async () => {
    debugLog("FETCH_PROFILE_START");
    try {
      const { data } = await api.get("/api/me");
      setProfile(data);
      const admin = data.privilege !== undefined;
      setIsAdmin(admin);
      debugLog("FETCH_PROFILE_OK", { isAdmin: admin, userId: data.userId?.substring(0, 8) });
    } catch (err) {
      const status = err.response?.status;
      debugLog("FETCH_PROFILE_FAIL", { status, message: err.message });
      // Only the 401 path means "token is dead" — the axios interceptor
      // (services/api.js) already cleared storage and redirected; just sync
      // local state. Network errors / 5xx are transient: keep the token so
      // the next request can succeed without forcing a fresh LIFF login.
      if (status === 401) {
        setLoggedIn(false);
        setProfile(null);
        setIsAdmin(false);
      }
    }
  }, []);

  useEffect(() => {
    // Guard against StrictMode double-invoke — ref survives unmount/remount
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const storedToken = window.localStorage.getItem(TOKEN_KEY);
    debugLog("INIT_START", {
      route: window.location.pathname,
      hasStoredToken: !!storedToken,
    });

    // Always run liff.init(): LIFF's secondary redirect lands on the user's
    // intended path (e.g. /rankings) without a /liff/ prefix or liff.state
    // query, so path-based detection misses canonical LIFF URL entries.
    // Calling init unconditionally is the only reliable way to recover the
    // LIFF browser session.
    if (!initPromiseRef.current) {
      initPromiseRef.current = initLiffSdk();
    }
    initPromiseRef.current
      .then(async () => {
        const isLoggedIn = liff.isLoggedIn();
        debugLog("LIFF_SDK_INIT", { success: true, isLoggedIn });
        if (isLoggedIn) {
          const token = liff.getAccessToken();
          debugLog("LIFF_LOGGED_IN", { tokenPrefix: token?.substring(0, 8) });
          window.localStorage.setItem(TOKEN_KEY, token);
          setAuthToken(token);
          setLoggedIn(true);
          try {
            setLiffCtx(liff.getContext() || {});
          } catch (err) {
            console.warn("Failed to get LIFF context:", err);
          }
          await fetchProfile();
        } else if (storedToken) {
          // SDK initialized but says not logged in (typical for external
          // browsers that haven't gone through liff.login yet). Try the
          // stored token; the API will tell us via 401 if it's stale.
          debugLog("FALLBACK_STORED_TOKEN", { tokenPrefix: storedToken.substring(0, 8) });
          setAuthToken(storedToken);
          setLoggedIn(true);
          await fetchProfile();
        } else {
          debugLog("LIFF_NOT_LOGGED_IN");
        }
      })
      .catch(err => {
        debugLog("LIFF_SDK_INIT", { success: false, error: err.message });
        console.warn("LIFF init failed:", err);
        // Init failed (LIFF ID fetch died, page outside LIFF endpoint, etc).
        // Stored token is the last lifeline.
        if (storedToken) {
          debugLog("FALLBACK_STORED_TOKEN", { tokenPrefix: storedToken.substring(0, 8) });
          setAuthToken(storedToken);
          setLoggedIn(true);
          return fetchProfile();
        }
      })
      .finally(() => {
        debugLog("READY");
        setReady(true);
      });
  }, []);

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

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    clearAuthToken();
    setProfile(null);
    setIsAdmin(false);
    try {
      liff.logout();
    } catch {
      // SDK not initialized, nothing to clean up
    }
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ ready, loggedIn, isAdmin, profile, liffContext: liffCtx, login, logout }),
    [ready, loggedIn, isAdmin, profile, liffCtx, login, logout]
  );

  if (!ready) {
    return <FullPageLoading />;
  }

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}
