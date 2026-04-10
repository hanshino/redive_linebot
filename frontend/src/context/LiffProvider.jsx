import { createContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import liff from "@line/liff";
import api, { setAuthToken, clearAuthToken } from "../services/api";
import { FullPageLoading } from "../components/Loading";

const TOKEN_KEY = "liff_access_token";
const SIZE_KEY = "liff_size";
const DEFAULT_SIZE = "full";

export const LiffContext = createContext({
  ready: false,
  loggedIn: false,
  isAdmin: false,
  profile: null,
  liffContext: {},
  login: () => {},
  logout: () => {},
});

function getLiffSize() {
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

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/api/me");
      setProfile(data);
      setIsAdmin(data.privilege !== undefined);
    } catch {
      // Token invalid or network error — treat as not logged in
      window.localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      setLoggedIn(false);
      setProfile(null);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    const isLiffRoute = window.location.pathname.startsWith("/liff/");
    const storedToken = window.localStorage.getItem(TOKEN_KEY);

    // Fast path: not a LIFF route and we have a stored token
    if (!isLiffRoute && storedToken) {
      setAuthToken(storedToken);
      setLoggedIn(true);
      fetchProfile().finally(() => setReady(true));
      return;
    }

    // LIFF route: full SDK init to process OAuth code
    if (isLiffRoute) {
      initPromiseRef.current = initLiffSdk()
        .then(async () => {
          if (liff.isLoggedIn()) {
            const token = liff.getAccessToken();
            window.localStorage.setItem(TOKEN_KEY, token);
            setAuthToken(token);
            setLoggedIn(true);
            try {
              setLiffCtx(liff.getContext() || {});
            } catch (err) {
              console.warn("Failed to get LIFF context:", err);
            }
            await fetchProfile();
          }
        })
        .catch(err => console.warn("LIFF init failed:", err))
        .finally(() => setReady(true));
      return;
    }

    // Non-LIFF route, no stored token: just mark ready (not logged in)
    setReady(true);
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
