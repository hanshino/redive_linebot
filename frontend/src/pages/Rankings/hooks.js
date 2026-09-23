import { useCallback, useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import useLiff from "../../context/useLiff";
import {
  fetchSupportRankings,
  fetchMySupport,
  setSupportHidden,
} from "../../services/supportRanking";

export function useChatLevelData() {
  const [{ data, loading }] = useAxios("/api/chat-levels/rankings");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map(d => ({
      displayName: d.displayName,
      value: d.experience,
      level: d.level,
      prestigeCount: d.prestigeCount ?? 0,
      awakened: d.awakened ?? false,
      blessingIds: d.blessingIds ?? [],
      buildTag: d.buildTag ?? null,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export function useGachaRankData() {
  const [{ data, loading }] = useAxios("/api/gacha/rankings/0");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map(d => ({
      displayName: d.displayName,
      value: d.cnt,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export function useGodStoneData() {
  const [{ data, loading }] = useAxios("/api/god-stone/rankings");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map(d => ({
      displayName: d.displayName,
      value: d.amount,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export function useAchievementRankData() {
  const [{ data, loading }] = useAxios("/api/achievements/rankings");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map(d => ({
      displayName: d.displayName,
      value: d.cnt,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

const NO_SUPPORT = { has_support: false, hidden: false, months: 0, rank: null };

// 支持榜：名單公開；/me 只在已登入時查，任何錯誤都視為沒有支持紀錄（不顯示開關）。
export function useSupportRanking() {
  const { loggedIn } = useLiff();
  const [list, setList] = useState({ items: [], total: 0 });
  const [me, setMe] = useState(NO_SUPPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(
    () =>
      fetchSupportRankings()
        .then(d => {
          setList({ items: d.items ?? [], total: d.total ?? 0 });
          setError(false);
        })
        .catch(() => setError(true)),
    []
  );

  useEffect(() => {
    let alive = true;
    const mePromise = loggedIn ? fetchMySupport().catch(() => NO_SUPPORT) : NO_SUPPORT;
    Promise.all([loadList(), mePromise]).then(([, m]) => {
      if (!alive) return;
      setMe(m);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loggedIn, loadList]);

  // 先切畫面、存檔期間鎖住開關；失敗就還原並回傳 HTTP status 讓畫面決定提示。
  const setHidden = useCallback(
    async hidden => {
      const prev = me;
      setMe({ ...prev, hidden });
      setSaving(true);
      try {
        setMe(await setSupportHidden(hidden));
        await loadList();
        return { ok: true };
      } catch (err) {
        setMe(prev);
        return { ok: false, status: err.response?.status };
      } finally {
        setSaving(false);
      }
    },
    [me, loadList]
  );

  return { ...list, me, loading, error, saving, setHidden };
}
