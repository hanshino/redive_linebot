import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useGodStoneData() {
  const [{ data, loading }] = useAxios("/api/God-Stone/Rank");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      displayName: d.displayName,
      value: d.amount,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function GodStoneChart() {
  const { rows } = useGodStoneData();
  return <RankingBarChart data={rows} color={RANK_COLORS.godStone} />;
}
