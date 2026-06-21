import { useEffect, useState, useCallback } from "react";
import {
  Container,
  Box,
  Typography,
  LinearProgress,
  Stack,
  Button,
  Card,
  CardContent,
  Divider,
  Alert,
  Chip,
} from "@mui/material";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import useWorldBossSocket from "./useWorldBossSocket";
import {
  getMe,
  getReport,
  postAttack,
  postBlock,
  postRevive,
  postShield,
} from "../../services/worldBoss";

const ROLE_ACTIONS = {
  dps: [{ label: "攻擊", fn: () => postAttack("normal") }],
  tank: [{ label: "格擋", fn: postBlock }],
  healer: [
    { label: "復活", fn: postRevive },
    { label: "護盾", fn: postShield },
  ],
};

function Board({ title, rows, valueKey }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        {rows.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            尚無資料
          </Typography>
        )}
        {rows.map((r, i) => (
          <Box key={i} display="flex" justifyContent="space-between" alignItems="center" py={0.25}>
            <Typography variant="body2" color="text.secondary">
              #{i + 1} {r.platform_id}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {r[valueKey] ?? 0}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

function WorldBossInner() {
  const { snapshot, enrageBatch, connected } = useWorldBossSocket();
  const [me, setMe] = useState(null);
  const [report, setReport] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  useEffect(() => {
    document.title = "世界王";
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
    getReport()
      .then(r => {
        if (r && r.hasReport) setReport(r);
      })
      .catch(() => {});
  }, []);

  const runAction = useCallback(async fn => {
    setActionMsg(null);
    try {
      const result = await fn();
      if (result && result.rejected) {
        setActionMsg({ severity: "warning", text: `無法行動：${result.reason}` });
      } else {
        setActionMsg({ severity: "success", text: "行動成功" });
      }
    } catch (e) {
      const reason = e.response?.data?.reason || e.response?.data?.message || "錯誤";
      setActionMsg({ severity: "error", text: `行動失敗：${reason}` });
    }
  }, []);

  const hpPct = snapshot?.hpPct ?? 100;
  const phase = snapshot?.phase ?? "calm";
  const enraged = phase === "enrage";
  const boards = snapshot?.boards ?? { dps: [], healer: [], tank: [] };
  const feed = snapshot?.feed ?? [];
  const role = me?.role;
  const actions = role ? ROLE_ACTIONS[role] || [] : [];

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      {!connected && (
        <Alert severity="info" sx={{ mb: 1 }}>
          連線中…
        </Alert>
      )}

      {enrageBatch && enrageBatch.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          世界王暴怒！{enrageBatch.length} 名玩家被擊倒
        </Alert>
      )}

      {report && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setReport(null)}>
          上一場戰報已送達：素材 x{report.reward?.materials ?? 0}
          {report.reward?.stones ? `、女神石 x${report.reward.stones}` : ""}
        </Alert>
      )}

      {/* Title */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          世界王
        </Typography>
        <Chip
          size="small"
          color={enraged ? "error" : "success"}
          label={enraged ? "暴怒" : "平穩"}
        />
      </Stack>

      {/* HP bar */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography variant="body2" color="text.secondary">
              HP
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {hpPct}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, hpPct))}
            color={enraged ? "error" : "success"}
            sx={{ height: 18, borderRadius: 1 }}
          />
        </CardContent>
      </Card>

      {/* Action feedback */}
      {actionMsg && (
        <Alert severity={actionMsg.severity} sx={{ mb: 1 }} onClose={() => setActionMsg(null)}>
          {actionMsg.text}
        </Alert>
      )}

      {/* Role-aware action buttons */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Typography variant="subtitle2" gutterBottom>
            行動
          </Typography>
          {actions.length === 0 ? (
            <Alert severity="info" sx={{ mt: 0.5 }}>
              請先在 LINE 以 #職業 選擇職業
            </Alert>
          ) : (
            <Stack direction="row" spacing={1}>
              {actions.map(a => (
                <Button key={a.label} variant="contained" onClick={() => runAction(a.fn)} fullWidth>
                  {a.label}
                </Button>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Contribution boards */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
        <Board title="輸出榜" rows={boards.dps ?? []} valueKey="total_damage" />
        <Board title="治療榜" rows={boards.healer ?? []} valueKey="total_contribution" />
        <Board title="格擋榜" rows={boards.tank ?? []} valueKey="total_contribution" />
      </Stack>

      {/* Recent feed */}
      <Divider sx={{ mb: 1 }} />
      <Typography variant="subtitle2" gutterBottom>
        最近動態
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ pb: "12px !important" }}>
          {feed.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              尚無動態
            </Typography>
          )}
          <Stack spacing={0.5}>
            {feed.map((f, i) => (
              <Typography key={i} variant="caption" color="text.secondary">
                {f.message || `${f.platform_id ?? "玩家"} 對世界王發動了攻擊`}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

export default function WorldBoss() {
  const { loggedIn } = useLiff();

  if (!loggedIn) {
    return (
      <Container maxWidth="md" sx={{ py: 2 }}>
        <AlertLogin />
      </Container>
    );
  }

  return <WorldBossInner />;
}
