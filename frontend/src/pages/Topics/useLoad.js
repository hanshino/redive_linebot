import { useCallback, useEffect, useState } from "react";

/**
 * loading / error / data 三態分開的取資料 hook（與 XpHistory/useApiData 同一套寫法）。
 * loading、error 由「目前這組參數有沒有回應」推出來，不在 effect 裡同步 setState；
 * 參數一變舊資料立刻失效，晚到的舊回應會被丟掉。enabled 為 false 時什麼都不做。
 */
export default function useLoad(fetcher, enabled, deps = []) {
  const [result, setResult] = useState({ key: null, data: null, failed: false });
  const [nonce, setNonce] = useState(0);

  const key = enabled ? JSON.stringify([...deps, nonce]) : null;

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetcher()
      .then(data => active && setResult({ key, data, failed: false }))
      .catch(() => active && setResult({ key, data: null, failed: true }));
    return () => {
      active = false;
    };
    // fetcher 每次 render 都是新函式；實際觸發條件已完整編進 key。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setNonce(n => n + 1), []);
  const settled = result.key === key;

  return {
    data: settled && !result.failed ? result.data : null,
    loading: Boolean(key) && !settled,
    error: settled && result.failed,
    retry,
  };
}
