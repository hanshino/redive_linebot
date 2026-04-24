import { useMemo } from "react";
import useAxios from "axios-hooks";

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
