import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";
import { useAchievementRankData } from "./hooks";

export default function AchievementRankChart() {
  const { rows } = useAchievementRankData();
  return <RankingBarChart data={rows} color={RANK_COLORS.achievement} />;
}
