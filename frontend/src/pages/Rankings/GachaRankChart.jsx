import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useGachaRankData() {
  const [{ data, loading }] = useAxios("/api/gacha/rankings/0");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      displayName: d.displayName,
      value: d.cnt,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function GachaRankChart() {
  const { rows } = useGachaRankData();
  return <RankingBarChart data={rows} color={RANK_COLORS.gacha} />;
}
