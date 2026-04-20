import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";
import { useGodStoneData } from "./hooks";

export default function GodStoneChart() {
  const { rows } = useGodStoneData();
  return <RankingBarChart data={rows} color={RANK_COLORS.godStone} />;
}
