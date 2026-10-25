import { useEffect, useState } from "react";
import {
  Container,
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Skeleton,
} from "@mui/material";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import { fetchGroupSummarys } from "../../services/group";
import { fetchMyTopics, fetchGroupTopics } from "../../services/topic";
import WordCloudCanvas from "./WordCloudCanvas";
import useLoad from "./useLoad";

const PERIODS = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
];

// One quiet loading / error / empty panel reused by both clouds, so the cloud card is the
// only thing that ever changes shape. 失敗與「還沒有資料」要分開：失敗給重試，不能叫人多聊天。
function CloudState({ loading, error, onRetry, isEmpty, emptyText, children }) {
  if (loading) {
    return <Skeleton variant="rounded" height={320} animation="wave" sx={{ mt: 1 }} />;
  }
  if (error) {
    return (
      <Box sx={{ minHeight: 320, display: "flex", alignItems: "center" }}>
        <Box sx={{ width: "100%" }}>
          <LoadError message="文字雲載入失敗，請檢查網路後再試一次。" onRetry={onRetry} />
        </Box>
      </Box>
    );
  }
  if (isEmpty) {
    return (
      <Box
        sx={{
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          px: 3,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
          {emptyText}
        </Typography>
      </Box>
    );
  }
  return children;
}

const asArray = data => (Array.isArray(data) ? data : []);

export default function Topics() {
  const { loggedIn } = useLiff();

  const [tab, setTab] = useState(0); // 0 = 個人, 1 = 群組
  const [days, setDays] = useState(30);

  const [pickedGroupId, setPickedGroupId] = useState("");

  useEffect(() => {
    document.title = "聊天文字雲";
  }, []);

  // 使用者的群組清單（群組文字雲的選單來源）
  const {
    data: groupList,
    loading: groupsLoading,
    error: groupsError,
    retry: retryGroups,
  } = useLoad(
    () => fetchGroupSummarys().then(list => asArray(list).filter(g => g?.groupId)),
    loggedIn,
    [loggedIn]
  );
  const groups = groupList ?? [];
  // 沒選過就用第一個群組（衍生值，不在 effect 裡 setState）
  const groupId = pickedGroupId || groups[0]?.groupId || "";

  const my = useLoad(() => fetchMyTopics(days).then(asArray), loggedIn, [loggedIn, days]);
  const group = useLoad(
    () => fetchGroupTopics(groupId, days).then(asArray),
    loggedIn && Boolean(groupId),
    [loggedIn, groupId, days]
  );
  const myItems = my.data ?? [];
  const groupItems = group.data ?? [];

  const periodLabel = PERIODS.find(p => p.value === days)?.label ?? "近 30 天";

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Typography variant="h6">聊天文字雲</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_, v) => v && setDays(v)}
          aria-label="期間"
        >
          {PERIODS.map(p => (
            <ToggleButton key={p.value} value={p.value} sx={{ px: 1.75, minHeight: 44 }}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {!loggedIn && <AlertLogin />}

      {/* 沒登入就沒有資料可談：不渲染雲與分頁，否則會顯示「還沒有發言」誤導人 */}
      {loggedIn && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="我的文字雲" />
          <Tab label="群組文字雲" />
        </Tabs>
      )}

      {loggedIn && tab === 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
              {periodLabel}・只有你看得到
            </Typography>
            <CloudState
              loading={my.loading}
              error={my.error}
              onRetry={my.retry}
              isEmpty={!myItems.length}
              emptyText={`${periodLabel}還沒有足夠的發言用字，多聊聊天再回來看看吧！`}
            >
              <WordCloudCanvas items={myItems} />
            </CloudState>
          </CardContent>
        </Card>
      )}

      {loggedIn && tab === 1 && (
        <Stack sx={{ gap: 1.5 }}>
          {groupsError ? (
            <LoadError message="群組清單載入失敗，請檢查網路後再試一次。" onRetry={retryGroups} />
          ) : (
            <TextField
              select
              size="small"
              label="選擇群組"
              value={groupId}
              onChange={e => setPickedGroupId(e.target.value)}
              disabled={!groups.length}
              helperText={
                groupsLoading
                  ? "載入群組中…"
                  : groups.length
                    ? "聚合結果，不會顯示是誰說的"
                    : "目前沒有可顯示的群組"
              }
            >
              {groups.map(g => (
                <MenuItem key={g.groupId} value={g.groupId}>
                  {g.groupName || g.groupId}
                </MenuItem>
              ))}
            </TextField>
          )}
          {!groupsError && groupId && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                  {periodLabel}・全群熱門用字
                </Typography>
                <CloudState
                  loading={group.loading}
                  error={group.error}
                  onRetry={group.retry}
                  isEmpty={!groupItems.length}
                  emptyText={`${periodLabel}這個群組還沒有足夠的話題，多聊聊天再回來看看吧！`}
                >
                  <WordCloudCanvas items={groupItems} />
                </CloudState>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Container>
  );
}
