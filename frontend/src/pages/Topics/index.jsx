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
  CircularProgress,
} from "@mui/material";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import { fetchGroupSummarys } from "../../services/group";
import { fetchMyTopics, fetchGroupTopics } from "../../services/topic";
import WordCloudCanvas from "./WordCloudCanvas";

const PERIODS = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
];

// One quiet empty/loading panel reused by both clouds, so the cloud card is the
// only thing that ever changes shape.
function CloudState({ loading, isEmpty, emptyText, children }) {
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={28} thickness={5} />
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
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
          {emptyText}
        </Typography>
      </Box>
    );
  }
  return children;
}

// Fetch a cloud's data when `enabled`, drop a stale resolve if deps change
// mid-flight, and clear when disabled. Shared by the personal and group clouds.
function useTopicCloud(fetcher, enabled, deps) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    fetcher()
      .then(data => active && setItems(Array.isArray(data) ? data : []))
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { items, loading };
}

export default function Topics() {
  const { loggedIn } = useLiff();

  const [tab, setTab] = useState(0); // 0 = 個人, 1 = 群組
  const [days, setDays] = useState(30);

  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    document.title = "聊天文字雲";
  }, []);

  // 使用者的群組清單（群組文字雲的選單來源）
  useEffect(() => {
    if (!loggedIn) return;
    fetchGroupSummarys()
      .then(list => {
        const arr = (Array.isArray(list) ? list : []).filter(g => g?.groupId);
        setGroups(arr);
        setGroupId(prev => prev || arr[0]?.groupId || "");
      })
      .catch(() => setGroups([]));
  }, [loggedIn]);

  const { items: myItems, loading: myLoading } = useTopicCloud(
    () => fetchMyTopics(days),
    loggedIn,
    [loggedIn, days]
  );
  const { items: groupItems, loading: groupLoading } = useTopicCloud(
    () => fetchGroupTopics(groupId, days),
    loggedIn && Boolean(groupId),
    [loggedIn, groupId, days]
  );

  const periodLabel = PERIODS.find(p => p.value === days)?.label ?? "近 30 天";

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
        sx={{ mb: 1.5 }}
      >
        <Stack>
          <Typography variant="h6">聊天文字雲</Typography>
          <Typography variant="caption" color="text.secondary">
            你平常都在聊什麼 — 字越大、講得越多
          </Typography>
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_, v) => v && setDays(v)}
          aria-label="期間"
        >
          {PERIODS.map(p => (
            <ToggleButton key={p.value} value={p.value} sx={{ px: 1.75 }}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {!loggedIn && <AlertLogin />}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="我的文字雲" />
        <Tab label="群組文字雲" />
      </Tabs>

      {tab === 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              {periodLabel}・只有你看得到
            </Typography>
            <CloudState
              loading={myLoading}
              isEmpty={!myItems.length}
              emptyText={`${periodLabel}還沒有足夠的發言用字，多聊聊天再回來看看吧！`}
            >
              <WordCloudCanvas items={myItems} />
            </CloudState>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Stack gap={1.5}>
          <TextField
            select
            size="small"
            label="選擇群組"
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            disabled={!groups.length}
            helperText={groups.length ? "聚合結果，不會顯示是誰說的" : "目前沒有可顯示的群組"}
          >
            {groups.map(g => (
              <MenuItem key={g.groupId} value={g.groupId}>
                {g.groupName || g.groupId}
              </MenuItem>
            ))}
          </TextField>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                {periodLabel}・全群熱門用字
              </Typography>
              <CloudState
                loading={groupLoading}
                isEmpty={!groupItems.length}
                emptyText={`${periodLabel}這個群組還沒有足夠的話題，多聊聊天再回來看看吧！`}
              >
                <WordCloudCanvas items={groupItems} />
              </CloudState>
            </CardContent>
          </Card>
        </Stack>
      )}
    </Container>
  );
}
