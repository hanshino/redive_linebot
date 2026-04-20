import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";
import { useGachaRankData } from "./hooks";

export default function GachaRankChart() {
  const { rows } = useGachaRankData();
  return <RankingBarChart data={rows} color={RANK_COLORS.gacha} />;
}
