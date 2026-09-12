import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  AlertTitle,
  Divider,
  Chip,
  Skeleton,
  CircularProgress,
} from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkIcon from "@mui/icons-material/Link";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
import * as svc from "../../../services/sponsorship";
import PlayerSearch, { PlayerRow } from "./PlayerSearch";
import HintSnackBar from "../../../components/HintSnackBar";
import useHintBar from "../../../hooks/useHintBar";
import { Hero, Field, CopyButton, TypeChip } from "./_shared";
import { COUPON_STATUS, fmtAmount, fmtDate, errorMessage } from "./_format";

export default function SponsorshipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState(null);
  const [hint, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setItem(await svc.fetchSponsorship(id));
    } catch (e) {
      setError(e?.response?.status === 404 ? "找不到此贊助紀錄" : errorMessage(e, "載入失敗"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = `贊助 #${id}`;
    load();
  }, [id, load]);

  const canBind = item && item.type === "history" && item.userId === null;

  const doBind = async () => {
    if (!target || binding) return;
    setBinding(true);
    setBindError(null);
    try {
      const data = await svc.bindSponsorship(item.id, target.id);
      setItem(prev => ({ ...prev, ...data.sponsorship }));
      setTarget(null);
      setConfirming(false);
      showHint(data.bound ? "已補綁玩家" : "此紀錄先前已綁定同一位玩家", "success");
    } catch (e) {
      setBindError(e);
      // 已被綁到別人 / 狀態改變 → 重抓現況
      if (e?.response?.status === 409) load();
    } finally {
      setBinding(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 760, mx: "auto" }}>
      <Hero
        icon={<ReceiptLongIcon />}
        title={`贊助 #${id}`}
        subtitle={item ? `建立於 ${fmtDate(item.createdAt)}` : undefined}
      >
        <Button
          component={RouterLink}
          to="/owner/sponsorships"
          startIcon={<ArrowBackIcon />}
          sx={{ color: "#fff" }}
        >
          回列表
        </Button>
      </Hero>

      {loading ? (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Skeleton height={32} width="40%" />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </Paper>
      ) : error ? (
        <Alert severity="error" action={<Button onClick={load}>重試</Button>}>
          {error}
        </Alert>
      ) : (
        <>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Stack spacing={2.5}>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ alignItems: "baseline", flexWrap: "wrap" }}
              >
                <Typography variant="h4" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  NT$ {fmtAmount(item.amount)}
                </Typography>
                <TypeChip type={item.type} size="medium" />
                <Chip
                  icon={<LockIcon sx={{ fontSize: "14px !important" }} />}
                  label="不可修改"
                  size="small"
                  variant="outlined"
                />
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                  gap: 2,
                }}
              >
                <Field label="入帳時間">{fmtDate(item.receivedAt)}</Field>
                <Field label="付款方式">{item.paymentMethod}</Field>
                <Field label="外部參考號" mono>
                  {item.externalRef}
                </Field>
                <Field label="發卡">
                  {item.cardCount > 0 ? `${item.cardKey} × ${item.cardCount} 張` : "不發卡"}
                </Field>
                <Field label="操作者" mono>
                  {item.operatorUserId}
                </Field>
                <Field label="識別碼" mono>
                  {item.requestId}
                </Field>
              </Box>
              {item.note && <Field label="備註">{item.note}</Field>}

              <Divider />

              <Box>
                <Typography variant="caption" color="text.secondary">
                  綁定玩家
                </Typography>
                {item.userId === null ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Chip label="未綁定" color="warning" variant="outlined" />
                  </Box>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
                    <Button
                      size="small"
                      startIcon={<PersonIcon />}
                      onClick={() => navigate(`/owner/sponsorships/players/${item.userId}`)}
                    >
                      玩家 #{item.userId}
                    </Button>
                    {item.boundAt && (
                      <Typography variant="caption" color="text.secondary">
                        補綁於 {fmtDate(item.boundAt)}
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Paper>

          {canBind && (
            <Paper
              sx={{
                p: { xs: 2, sm: 3 },
                borderRadius: 3,
                borderLeft: 4,
                borderColor: "warning.main",
              }}
            >
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    補綁玩家
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    核對付款人身分後再綁定。綁定後金額會計入該玩家的累積贊助，且不能再換人。
                  </Typography>
                </Box>
                <PlayerSearch
                  value={target}
                  onSelect={p => {
                    setTarget(p);
                    setConfirming(false);
                    setBindError(null);
                  }}
                  disabled={binding}
                  helperText="請核對頭像、名稱與 ID，避免同名誤綁"
                />
                {target && (
                  <Paper
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}
                  >
                    <PlayerRow player={target} />
                  </Paper>
                )}
                {bindError && (
                  <Alert severity="error">
                    <AlertTitle>補綁失敗</AlertTitle>
                    {errorMessage(bindError)}
                    {bindError.response?.data?.code ? `（${bindError.response.data.code}）` : ""}
                  </Alert>
                )}
                {!confirming ? (
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<LinkIcon />}
                    disabled={!target}
                    onClick={() => setConfirming(true)}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    綁定此玩家
                  </Button>
                ) : (
                  <Alert
                    severity="warning"
                    icon={<LockIcon />}
                    action={
                      <Stack direction="row" spacing={1}>
                        <Button
                          color="inherit"
                          size="small"
                          onClick={() => setConfirming(false)}
                          disabled={binding}
                        >
                          取消
                        </Button>
                        <Button
                          color="inherit"
                          size="small"
                          variant="outlined"
                          onClick={doBind}
                          disabled={binding}
                          startIcon={
                            binding ? <CircularProgress size={14} color="inherit" /> : null
                          }
                        >
                          確定綁定
                        </Button>
                      </Stack>
                    }
                  >
                    確定將 NT$ {fmtAmount(item.amount)} 綁到「{target?.displayName || "未設定名稱"}{" "}
                    #{target?.id}」？綁定後不可更換。
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}

          {item.coupons?.length > 0 && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  序號（{item.coupons.length} 張）
                </Typography>
                <Button
                  size="small"
                  onClick={() =>
                    navigator.clipboard?.writeText(item.coupons.map(c => c.serialNumber).join("\n"))
                  }
                >
                  全部複製
                </Button>
              </Stack>
              <Paper variant="outlined" sx={{ mt: 1.5, borderRadius: 2 }}>
                {item.coupons.map((c, i) => {
                  const st = COUPON_STATUS[c.status] || {
                    label: String(c.status),
                    color: "default",
                  };
                  return (
                    <Box key={c.serialNumber}>
                      {i > 0 && <Divider />}
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ px: 1.5, py: 1, flexWrap: "wrap", alignItems: "center" }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            flex: 1,
                            minWidth: 180,
                            wordBreak: "break-all",
                          }}
                        >
                          {c.serialNumber}
                        </Typography>
                        <Chip label={st.label} color={st.color} size="small" variant="outlined" />
                        {c.status === 1 && (
                          <Typography variant="caption" color="text.secondary">
                            {fmtDate(c.usedAt)}
                            {c.usedBy ? ` · ${c.usedBy.slice(0, 8)}…` : ""}
                          </Typography>
                        )}
                        <CopyButton text={c.serialNumber} label="複製序號" />
                      </Stack>
                    </Box>
                  );
                })}
              </Paper>
            </Paper>
          )}
        </>
      )}

      <HintSnackBar
        open={hint.open}
        message={hint.message}
        severity={hint.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
