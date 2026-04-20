import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";
import { useChatLevelData } from "./hooks";

export default function ChatLevelChart() {
  const { rows } = useChatLevelData();
  return <RankingBarChart data={rows} color={RANK_COLORS.level} />;
}
