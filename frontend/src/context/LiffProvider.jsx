import { createContext, useEffect, useState, useMemo, useCallback } from "react";
import liff from "@line/liff";
import api from "../services/api";
import { FullPageLoading } from "../components/Loading";

export const LiffContext = createContext({
  ready: false,
  initialized: false,
  loggedIn: false,
  liffContext: {},
  login: () => {},
  logout: () => {},
});

export default function LiffProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [liffCtx, setLiffCtx] = useState({});

  useEffect(() => {
    const size = window.localStorage.getItem("liff_size") || "full";

    api
      .get(`/api/liff-ids?size=${size}`)
      .then((res) => res.data)
      .then((data) => liff.init({ liffId: data.id }))
      .then(() => {
        setInitialized(true);
        if (liff.isLoggedIn()) {
          const token = liff.getAccessToken();
          api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          setLoggedIn(true);
          try {
            setLiffCtx(liff.getContext() || {});
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err) => {
        console.warn("LIFF init failed:", err);
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  const login = useCallback(() => {
    if (initialized) {
      liff.login();
    }
  }, [initialized]);

  const logout = useCallback(() => {
    if (initialized) {
      liff.logout();
      window.location.reload();
    }
  }, [initialized]);

  const value = useMemo(
    () => ({ ready, initialized, loggedIn, liffContext: liffCtx, login, logout }),
    [ready, initialized, loggedIn, liffCtx, login, logout]
  );

  if (!ready) {
    return <FullPageLoading />;
  }

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}
