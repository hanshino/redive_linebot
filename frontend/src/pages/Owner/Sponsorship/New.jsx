import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Alert,
  AlertTitle,
  Divider,
  Chip,
  CircularProgress,
  Autocomplete,
  Collapse,
  Link,
} from "@mui/material";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LockIcon from "@mui/icons-material/Lock";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import PaymentsIcon from "@mui/icons-material/Payments";
import * as svc from "../../../services/sponsorship";
import PlayerSearch, { PlayerRow } from "./PlayerSearch";
import { Hero, Field, CopyButton, TypeChip } from "./_shared";
import { fmtAmount, fmtDate, toLocalInput, errorMessage } from "./_format";

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;
const MAX_CARD_COUNT = 100;
const PAYMENT_OPTIONS = ["銀行轉帳", "LINE Pay", "街口支付", "現金", "其他"];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const emptyForm = () => ({
  type: "new",
  mode: "pure", // pure | issue，只在 type=new 有意義
  player: null,
  amount: "",
  receivedAt: toLocalInput(),
  paymentMethod: "",
  externalRef: "",
  note: "",
  cardKey: "",
  cardCount: 1,
});

const orNull = v => (v && v.trim() ? v.trim() : null);

function toPayload(f) {
  const issuing = f.type === "new" && f.mode === "issue";
  return {
    type: f.type,
    user_id: f.player ? f.player.id : null,
    currency: "TWD",
    amount: f.amount.trim(),
    received_at: new Date(f.receivedAt).toISOString(),
    payment_method: orNull(f.paymentMethod),
    external_ref: orNull(f.externalRef),
    note: orNull(f.note),
    card_key: issuing ? f.cardKey : null,
    card_count: issuing ? Number(f.cardCount) : 0,
  };
}

function validate(f) {
  const e = {};
  if (f.type === "new" && !f.player) e.player = "新贊助必須選定既有玩家";
  const amt = f.amount.trim();
  if (!amt) e.amount = "必填";
  else if (!AMOUNT_RE.test(amt)) e.amount = "請輸入正數，最多兩位小數（例：1500 或 1500.50）";
  else if (Number(amt) <= 0) e.amount = "金額必須大於 0";
  if (!f.receivedAt || Number.isNaN(new Date(f.receivedAt).getTime())) e.receivedAt = "必填";
  if (f.type === "new" && f.mode === "issue") {
    if (!f.cardKey) e.cardKey = "請選擇卡種";
    const n = Number(f.cardCount);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CARD_COUNT)
      e.cardCount = `1 ~ ${MAX_CARD_COUNT} 張`;
  }
  return e;
}

const segSx = {
  width: "100%",
  "& .MuiToggleButton-root": {
    flex: 1,
    py: 1.25,
    textTransform: "none",
    flexDirection: "column",
    gap: 0.25,
    lineHeight: 1.2,
  },
};

function Segment({ value, onChange, options, ariaLabel, color = "primary" }) {
  return (
    <ToggleButtonGroup
      exclusive
      color={color}
      value={value}
      onChange={(e, v) => v && onChange(v)}
      sx={segSx}
      aria-label={ariaLabel}
    >
      {options.map(o => (
        <ToggleButton key={o.value} value={o.value} aria-label={o.title}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            {o.icon}
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {o.title}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {o.sub}
          </Typography>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default function SponsorshipNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [cards, setCards] = useState([]);
  const [step, setStep] = useState("form"); // form | confirm | done
  // 提交快照：{ requestId, payload } 單份只存記憶體，進確認步驟時凍結。
  // confirm / retry 一律讀這份，不重算 payload；只有「還沒送出過」或後端明確回 400
  // （確定沒寫入）才允許丟掉快照回去改。送出過但結果未知（逾時/斷線）→ 只能同 key 同 body 重試
  // 或去列表核對，禁止換 key。
  const [snapshot, setSnapshot] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  // 最近幾筆核對：{ status: "loading" | "error" | "ok", items }
  const [recent, setRecent] = useState({ status: "loading", items: [] });

  useEffect(() => {
    document.title = "新增贊助登記";
    svc
      .fetchCards()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const setEv = k => e => set(k)(e.target.value);

  const issuing = form.type === "new" && form.mode === "issue";
  const selectedCard = useMemo(
    () => cards.find(c => c.key === form.cardKey) || null,
    [cards, form.cardKey]
  );

  const loadRecent = async () => {
    setRecent({ status: "loading", items: [] });
    try {
      const data = await svc.fetchSponsorships({ page: 1, perPage: 5 });
      setRecent({ status: "ok", items: data.items || [] });
    } catch {
      setRecent({ status: "error", items: [] });
    }
  };

  const goConfirm = () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitError(null);
    setAttempted(false);
    setSnapshot({ requestId: uid(), payload: toPayload(form), player: form.player });
    setStep("confirm");
    loadRecent();
  };

  // 只在「尚未送出」或「後端明確回 400（沒寫入）」時可用；送出過結果未知一律不開放。
  const canBackToEdit = !attempted || submitError?.response?.status === 400;

  const backToEdit = () => {
    if (!canBackToEdit) return;
    setSnapshot(null);
    setAttempted(false);
    setSubmitError(null);
    setStep("form");
  };

  const submit = async () => {
    if (!snapshot || submitting || recent.status !== "ok") return;
    setSubmitting(true);
    setSubmitError(null);
    setAttempted(true);
    try {
      const data = await svc.createSponsorship(snapshot.payload, snapshot.requestId);
      setResult(data);
      setStep("done");
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    setForm(emptyForm());
    setErrors({});
    setSnapshot(null);
    setAttempted(false);
    setResult(null);
    setSubmitError(null);
    setStep("form");
  };

  const payload = snapshot?.payload || null;
  const errStatus = submitError?.response?.status;
  const conflictCode = submitError?.response?.data?.code;
  const isConflict = errStatus === 409;
  const isValidation = errStatus === 400;
  // 非 400/409 的失敗（逾時、斷線、5xx）：後端可能已寫入，只能同 key 重試或去核對。
  const isUnknown = submitError && !isConflict && !isValidation;
  const recentReady = recent.status === "ok";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 760, mx: "auto" }}>
      <Hero
        icon={<VolunteerActivismIcon />}
        title={step === "done" ? "登記完成" : step === "confirm" ? "確認送出" : "新增贊助登記"}
        subtitle={
          step === "form"
            ? "先選類型，再填金額與入帳資訊。"
            : step === "confirm"
              ? "送出後不可修改，請逐項核對。"
              : "此筆紀錄已建立，內容不可再更動。"
        }
      >
        {step !== "done" && (
          <Button
            component={RouterLink}
            to="/owner/sponsorships"
            startIcon={<ArrowBackIcon />}
            sx={{ color: "#fff" }}
          >
            回列表
          </Button>
        )}
      </Hero>

      {step === "form" && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                1. 這是哪一種登記？
              </Typography>
              <Segment
                ariaLabel="登記類型"
                value={form.type}
                onChange={v =>
                  setForm(f => ({
                    ...f,
                    type: v,
                    mode: v === "history" ? "pure" : f.mode,
                  }))
                }
                options={[
                  {
                    value: "new",
                    title: "新贊助",
                    sub: "必須綁定既有玩家，可選擇發卡",
                    icon: <PaymentsIcon fontSize="small" />,
                  },
                  {
                    value: "history",
                    title: "歷史補登",
                    sub: "只記帳，可暫不綁玩家，不發卡",
                    icon: <HistoryEduIcon fontSize="small" />,
                  },
                ]}
              />
            </Box>

            <Collapse in={form.type === "new"} unmountOnExit>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                2. 要發序號嗎？
              </Typography>
              <Segment
                ariaLabel="贊助方式"
                color="secondary"
                value={form.mode}
                onChange={set("mode")}
                options={[
                  {
                    value: "pure",
                    title: "純贊助",
                    sub: "只登記金額，不產生序號",
                    icon: <VolunteerActivismIcon fontSize="small" />,
                  },
                  {
                    value: "issue",
                    title: "發卡贊助",
                    sub: "產生序號，由兌換者自行啟用",
                    icon: <CardGiftcardIcon fontSize="small" />,
                  },
                ]}
              />
            </Collapse>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {form.type === "new" ? "3. 贊助玩家" : "2. 綁定玩家（選填）"}
              </Typography>
              <PlayerSearch
                value={form.player}
                onSelect={p => {
                  set("player")(p);
                  setErrors(er => ({ ...er, player: undefined }));
                }}
                error={!!errors.player}
                helperText={
                  errors.player ||
                  (form.type === "history"
                    ? "先留空也可以，之後在詳情頁補綁。已綁定就不能換人。"
                    : "只能選既有 LINE 玩家；請核對頭像、名稱與 ID 避免同名誤選。")
                }
              />
              {form.player && (
                <Paper
                  variant="outlined"
                  sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}
                >
                  <PlayerRow player={form.player} />
                </Paper>
              )}
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {form.type === "new" ? "4. 金額與入帳" : "3. 金額與入帳"}
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="金額（TWD）"
                  value={form.amount}
                  onChange={setEv("amount")}
                  error={!!errors.amount}
                  helperText={errors.amount || "正數，最多兩位小數；不做幣別換算"}
                  required
                  fullWidth
                  autoComplete="off"
                  slotProps={{
                    htmlInput: { inputMode: "decimal", pattern: "[0-9.]*" },
                    input: {
                      startAdornment: (
                        <Typography color="text.secondary" sx={{ mr: 1 }}>
                          NT$
                        </Typography>
                      ),
                    },
                  }}
                />
                <TextField
                  label="入帳時間"
                  type="datetime-local"
                  value={form.receivedAt}
                  onChange={setEv("receivedAt")}
                  error={!!errors.receivedAt}
                  helperText={errors.receivedAt}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Autocomplete
                    freeSolo
                    fullWidth
                    options={PAYMENT_OPTIONS}
                    inputValue={form.paymentMethod}
                    onInputChange={(e, v) => set("paymentMethod")(v || "")}
                    renderInput={params => (
                      <TextField
                        {...params}
                        label="付款方式（選填）"
                        slotProps={{
                          ...params.slotProps,
                          htmlInput: { ...params.slotProps.htmlInput, maxLength: 50 },
                        }}
                      />
                    )}
                  />
                  <TextField
                    label="外部參考號（選填）"
                    value={form.externalRef}
                    onChange={setEv("externalRef")}
                    helperText="轉帳末五碼、訂單編號等，僅供對帳"
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                  />
                </Stack>
                <TextField
                  label="備註（選填）"
                  value={form.note}
                  onChange={setEv("note")}
                  multiline
                  minRows={2}
                  fullWidth
                />
              </Stack>
            </Box>

            <Collapse in={issuing} unmountOnExit>
              <Divider sx={{ mb: 3 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                5. 發卡內容
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="卡種"
                  value={form.cardKey}
                  onChange={setEv("cardKey")}
                  error={!!errors.cardKey}
                  helperText={
                    errors.cardKey ||
                    (selectedCard ? `每張 ${selectedCard.duration} 天` : "從既有卡種選擇")
                  }
                  fullWidth
                >
                  {cards.length === 0 && <MenuItem disabled>載入卡種中…</MenuItem>}
                  {cards.map(c => (
                    <MenuItem key={c.key} value={c.key}>
                      {c.name}（{c.key}）
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="張數"
                  type="number"
                  value={form.cardCount}
                  onChange={setEv("cardCount")}
                  error={!!errors.cardCount}
                  helperText={errors.cardCount || `最多 ${MAX_CARD_COUNT} 張`}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: MAX_CARD_COUNT, step: 1 } }}
                />
              </Stack>
              <Alert severity="info" sx={{ mt: 2 }}>
                序號只是產生出來，不會直接啟用訂閱；由拿到序號的人自行兌換。
              </Alert>
            </Collapse>

            <Button variant="contained" size="large" onClick={goConfirm}>
              下一步：確認內容
            </Button>
          </Stack>
        </Paper>
      )}

      {step === "confirm" && payload && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Stack spacing={2.5}>
            <Alert severity="warning" icon={<LockIcon />}>
              <AlertTitle>送出後不可修改</AlertTitle>
              沒有退款、更正、刪除或作廢功能。只有「未綁定的歷史補登」可以事後補綁玩家。
            </Alert>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                gap: 2,
              }}
            >
              <Field label="類型">
                <TypeChip type={payload.type} />
              </Field>
              <Field label="金額">NT$ {fmtAmount(payload.amount)}</Field>
              <Field label="入帳時間">{fmtDate(payload.received_at)}</Field>
              <Field label="付款方式">{payload.payment_method}</Field>
              <Field label="外部參考號" mono>
                {payload.external_ref}
              </Field>
              <Field label="發卡">
                {payload.card_count > 0
                  ? `${selectedCard?.name || payload.card_key} × ${payload.card_count} 張`
                  : "不發卡"}
              </Field>
            </Box>
            <Field label="備註">{payload.note}</Field>

            <Box>
              <Typography variant="caption" color="text.secondary">
                玩家
              </Typography>
              {snapshot.player ? (
                <Paper variant="outlined" sx={{ mt: 0.5, p: 1.5, borderRadius: 2 }}>
                  <PlayerRow player={snapshot.player} />
                </Paper>
              ) : (
                <Chip label="未綁定（可事後補綁）" color="warning" variant="outlined" />
              )}
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                送出前核對：最近 5 筆（依入帳時間排序）
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                這裡只列入帳時間最近的 5 筆，不代表沒出現就一定沒登記過。如果剛才已送出但沒看到結果
                （例如頁面重新整理過），請先到
                <Link component={RouterLink} to="/owner/sponsorships">
                  列表
                </Link>
                依金額、入帳時間、參考號人工核對，確認沒有再按送出。
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {recent.status === "loading" ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">
                      載入中…
                    </Typography>
                  </Stack>
                ) : recent.status === "error" ? (
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" size="small" onClick={loadRecent}>
                        重新載入
                      </Button>
                    }
                  >
                    無法載入最近紀錄，核對未完成前不能送出。
                  </Alert>
                ) : recent.items.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    查詢成功，目前沒有任何登記紀錄。
                  </Typography>
                ) : (
                  recent.items.map(s => (
                    <Typography
                      key={s.id}
                      variant="body2"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      <Link component={RouterLink} to={`/owner/sponsorships/${s.id}`}>
                        #{s.id}
                      </Link>{" "}
                      · NT$ {fmtAmount(s.amount)} · 入帳 {fmtDate(s.receivedAt)} ·{" "}
                      {s.userId === null ? "未綁定" : `玩家 #${s.userId}`}
                      {s.externalRef ? ` · ${s.externalRef}` : ""}
                    </Typography>
                  ))
                )}
              </Stack>
            </Box>

            {submitError && (
              <Alert
                severity={isValidation ? "warning" : "error"}
                action={
                  isUnknown && (
                    <Button color="inherit" size="small" onClick={submit} disabled={submitting}>
                      重試這一筆
                    </Button>
                  )
                }
              >
                <AlertTitle>
                  {isConflict ? "識別碼已被使用" : isValidation ? "資料未通過檢查" : "送出結果不明"}
                </AlertTitle>
                {isUnknown ? "沒有收到後端回應。" : errorMessage(submitError)}
                {conflictCode ? `（${conflictCode}）` : ""}
                {isConflict &&
                  " 這個識別碼先前已送出過不同內容。請不要重新送出，先到列表或詳情核對是否已入帳。"}
                {isValidation && " 後端未寫入任何資料，可返回修改後重新確認。"}
                {isUnknown &&
                  " 後端可能已經入帳。請只用「重試這一筆」（同識別碼、同內容，不會重複入帳），或到列表核對；不要重新填一筆。"}
              </Alert>
            )}

            <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1.5}>
              {canBackToEdit ? (
                <Button onClick={backToEdit} disabled={submitting} startIcon={<ArrowBackIcon />}>
                  返回修改
                </Button>
              ) : (
                <Button component={RouterLink} to="/owner/sponsorships" disabled={submitting}>
                  到列表核對
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              {!isConflict && !isValidation && (
                <Button
                  variant="contained"
                  size="large"
                  color="secondary"
                  onClick={submit}
                  disabled={submitting || !recentReady}
                  startIcon={
                    submitting ? <CircularProgress size={16} color="inherit" /> : <LockIcon />
                  }
                >
                  {submitting
                    ? "送出中…"
                    : attempted
                      ? "重試這一筆（同識別碼）"
                      : "確認送出（不可修改）"}
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      )}

      {step === "done" && result && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Stack spacing={2.5}>
            <Alert severity={result.created ? "success" : "info"}>
              {result.created
                ? `已建立贊助紀錄 #${result.sponsorship.id}`
                : `這筆先前已建立（#${result.sponsorship.id}），以下為原本結果，未重複入帳。`}
            </Alert>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                gap: 2,
              }}
            >
              <Field label="金額">NT$ {fmtAmount(result.sponsorship.amount)}</Field>
              <Field label="類型">
                <TypeChip type={result.sponsorship.type} />
              </Field>
              <Field label="入帳時間">{fmtDate(result.sponsorship.receivedAt)}</Field>
            </Box>

            {result.serialNumbers?.length > 0 && (
              <Box>
                <Stack
                  direction="row"
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    序號（{result.serialNumbers.length} 張）
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => navigator.clipboard?.writeText(result.serialNumbers.join("\n"))}
                  >
                    全部複製
                  </Button>
                </Stack>
                <Paper variant="outlined" sx={{ mt: 1, borderRadius: 2 }}>
                  {result.serialNumbers.map((sn, i) => (
                    <Box key={sn}>
                      {i > 0 && <Divider />}
                      <Stack direction="row" sx={{ alignItems: "center", px: 1.5, py: 0.75 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}
                        >
                          {sn}
                        </Typography>
                        <CopyButton text={sn} label="複製序號" />
                      </Stack>
                    </Box>
                  ))}
                </Paper>
                <Typography variant="caption" color="text.secondary">
                  序號之後也能在詳情頁查到，這裡不會存到瀏覽器。
                </Typography>
              </Box>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="contained"
                onClick={() => navigate(`/owner/sponsorships/${result.sponsorship.id}`)}
              >
                查看詳情
              </Button>
              <Button onClick={startAnother}>再登記一筆</Button>
              <Button component={RouterLink} to="/owner/sponsorships">
                回列表
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
