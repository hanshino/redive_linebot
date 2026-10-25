import { useCallback, useEffect, useState } from "react";

/**
 * 載入 / 失敗 / 有資料 三態分開的取資料 hook。
 *
 * loading 與 error 都是從「目前這組參數有沒有回應」推出來的，不在 effect 裡同步 setState：
 * 參數（例如日期範圍）一變，舊資料立刻不算數、畫面回到 loading，舊回應晚到也會被丟掉。
 *
 *   const { data, loading, error, reload } = useApiData(fetcher, enabled, [dep1, dep2]);
 *
 * enabled 為 false 時什麼都不做（例如尚未登入），loading 也是 false。
 */
export default function useApiData(fetcher, enabled, deps = []) {
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
    // fetcher 每次 render 都是新函式；實際的觸發條件已經完整編進 key。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const settled = result.key === key;

  return {
    data: settled && !result.failed ? result.data : null,
    loading: Boolean(key) && !settled,
    error: settled && result.failed,
    reload,
  };
}
