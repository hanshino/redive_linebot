import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useChatLevelData() {
  const [{ data, loading }] = useAxios("/api/chat-levels/rankings");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d, i) => ({
      displayName: d.displayName,
      value: d.experience,
      level: d.level,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function ChatLevelChart() {
  const { rows } = useChatLevelData();
  return <RankingBarChart data={rows} color={RANK_COLORS.level} />;
}
