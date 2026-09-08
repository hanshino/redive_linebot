import { useCallback, useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import DiamondIcon from "@mui/icons-material/Diamond";
import AutoAwesomeMosaicRoundedIcon from "@mui/icons-material/AutoAwesomeMosaicRounded";
import RecyclingRoundedIcon from "@mui/icons-material/RecyclingRounded";
import RedeemRoundedIcon from "@mui/icons-material/RedeemRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import { NUMS, REDEEM_COST_FALLBACK, errorInfo, fmtStone } from "../Trade/_market";
import { BaseStar, CharAvatar, GradientPanel, Row, SectionTitle } from "../Trade/_marketUi";

/* ================================================================ 篩選 */
/**
 * 四個視角，順序照「玩家現在想做什麼」排，不是照資料欄位排：
 *   all       —— 全部，預設
 *   redeem    —— 可兌換（canRedeem），唯一能立刻換到新角色的一批，所以擺第二
 *   owned     —— 已持有角色的碎片，這是「可以放心賣掉」的庫存
 *   short     —— 還不夠 150 片，看還差多少
 *
 * 刻意「沒有」隱藏已持有角色的選項：老玩家持續累積碎片再賣出，是整個市場的供給來源，
 * 把那批藏起來等於把系統的心臟藏起來。owned 是一個獨立視角，不是一個排除條件。
 */
const FILTERS = [
  { key: "all", label: "全部" },
  { key: "redeem", label: "可兌換" },
  { key: "owned", label: "已持有" },
  { key: "short", label: "不足" },
];

const matchesFilter = (row, key, cost) => {
  if (key === "redeem") return Boolean(row.canRedeem);
  if (key === "owned") return Boolean(row.owned);
  if (key === "short") return Number(row.amount) < cost;
  return true;
};

/* ================================================================ 頂部總覽 */
function Overview({ rows, cost, loading }) {
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const redeemable = rows.filter(r => r.canRedeem).length;
  const kinds = rows.length;

  const stat = (label, value, suffix) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, opacity: 0.88, letterSpacing: ".4px" }}>{label}</Typography>
      <Typography sx={{ fontSize: 21, fontWeight: 700, lineHeight: 1.15, ...NUMS }}>
        {loading ? "—" : value}
        {suffix && (
          <Box component="small" sx={{ fontSize: 11.5, fontWeight: 600, opacity: 0.9, ml: 0.375 }}>
            {suffix}
          </Box>
        )}
      </Typography>
    </Box>
  );

  const divider = (
    <Box
      sx={{
        width: "1px",
        alignSelf: "stretch",
        bgcolor: "rgba(255,255,255,.28)",
        my: 0.25,
      }}
    />
  );

  return (
    <GradientPanel tone="buy">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <AutoAwesomeMosaicRoundedIcon sx={{ fontSize: 20, opacity: 0.9 }} />
        <Typography sx={{ fontSize: 15.5, fontWeight: 700 }}>角色碎片</Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.75 }}>
        {stat("持有碎片", fmtStone(total), "片")}
        {divider}
        {stat("角色種類", kinds, "種")}
        {divider}
        {stat("可兌換", redeemable, "種")}
      </Box>

      <Box
        component="ul"
        sx={{ m: 0, mt: 1.5, pl: 2, fontSize: 11.5, lineHeight: 1.75, opacity: 0.92 }}
      >
        <li>抽到重複角色會轉成該角色的碎片</li>
        <li>1 碎片可回收成 1 女神石，數量隨你</li>
        <li>{cost} 片可兌換該角色，兌換取得的角色固定 1★</li>
      </Box>
    </GradientPanel>
  );
}

/* ================================================================ 一列碎片 */
/**
 * 一列固定四塊：頭像、名字與進度、片數、兩顆操作鍵。
 *
 * 已持有的角色列**不會被隱藏也不會被摺疊**，只有「兌換」那顆停用並換字。
 * 回收與掛賣照常，因為那正是這批碎片的正確出路。
 */
function FragmentCard({ row, cost, onRecycle, onRedeem, onSell }) {
  const amount = Number(row.amount || 0);
  const pct = Math.min(100, Math.round((amount / cost) * 100));
  const short = Math.max(0, cost - amount);
  const canRedeem = Boolean(row.canRedeem);
  const owned = Boolean(row.owned);

  return (
    <Paper
      component="li"
      elevation={0}
      sx={theme => ({
        p: 1.5,
        borderRadius: 3,
        border: "1px solid",
        borderColor: canRedeem ? alpha(theme.palette.success.main, 0.5) : "divider",
        bgcolor: canRedeem ? alpha(theme.palette.success.main, 0.05) : "background.paper",
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[3],
        },
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CharAvatar
          itemId={row.itemId}
          name={row.name || ""}
          headImage={row.headImage}
          kind="fragment"
          size={46}
        />

        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flexWrap: "wrap",
              fontSize: 14.5,
              fontWeight: 600,
            }}
          >
            <Box component="span" sx={{ minWidth: 0 }}>
              {row.name || `角色 ${row.itemId}`}
              <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
                碎片
              </Box>
            </Box>
            <BaseStar star={row.baseStar} kind="fragment" />
            {owned && (
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.25,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "success.main",
                }}
              >
                <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 13 }} />
                已持有角色
              </Box>
            )}
          </Box>

          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: "2px", ...NUMS }}>
            {row.itemId}
          </Typography>

          {/* 進度條寫的是「湊 150 片」的進度，不是角色的強度。
              滿了就轉綠，跟卡片邊框同一個訊號。 */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.875 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              aria-label={`兌換進度 ${amount} / ${cost} 片`}
              sx={theme => ({
                flex: "1 1 auto",
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.text.primary, 0.1),
                "& .MuiLinearProgress-bar": {
                  borderRadius: 3,
                  bgcolor:
                    amount >= cost ? theme.palette.success.main : theme.palette.secondary.main,
                },
              })}
            />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                color: amount >= cost ? "success.main" : "text.secondary",
                ...NUMS,
              }}
            >
              {fmtStone(amount)} / {cost}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5, ...NUMS }}>
            {amount >= cost
              ? owned
                ? "片數已足夠，但你已持有這隻角色，無法兌換"
                : `可兌換 ${Math.floor(amount / cost)} 隻（固定 1★）`
              : `還差 ${fmtStone(short)} 片可兌換`}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mt: 1.375, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RecyclingRoundedIcon />}
          onClick={() => onRecycle(row)}
          sx={{ flex: "1 1 30%" }}
        >
          回收
        </Button>
        {canRedeem ? (
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<RedeemRoundedIcon />}
            onClick={() => onRedeem(row)}
            sx={{ flex: "1 1 30%" }}
          >
            兌換
          </Button>
        ) : (
          // 依既有頁面的做法：不能操作時保留按鈕但停用，並用 aria-disabled
          // 讓讀屏唸出理由；不掛 onClick，按下去真的不會發生任何事。
          <Button
            size="small"
            variant="outlined"
            component="span"
            role="button"
            tabIndex={0}
            aria-disabled="true"
            aria-label={
              owned
                ? `你已持有${row.name || "這隻角色"}，無法兌換，碎片可以回收或賣出`
                : `碎片不足，還差 ${short} 片才能兌換`
            }
            startIcon={<RedeemRoundedIcon />}
            sx={{
              flex: "1 1 30%",
              color: "text.secondary",
              borderColor: "divider",
              bgcolor: theme => alpha(theme.palette.text.primary, 0.04),
              cursor: "not-allowed",
              "&:hover": {
                borderColor: "divider",
                bgcolor: theme => alpha(theme.palette.text.primary, 0.04),
              },
            }}
          >
            {owned ? "已持有" : "兌換"}
          </Button>
        )}
        <Button
          size="small"
          variant="text"
          color="secondary"
          startIcon={<StorefrontRoundedIcon />}
          onClick={() => onSell(row)}
          sx={{ flex: "1 1 30%" }}
        >
          掛賣
        </Button>
      </Box>
    </Paper>
  );
}

/* ================================================================ 主頁面 */
export default function Fragments() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();

  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  // 回收與兌換各自的 dialog 目標。分兩個 state 而不是一個 mode+target，
  // 因為回收多帶一個輸入值，混在一起反而要多寫判斷。
  const [recycleTarget, setRecycleTarget] = useState(null);
  const [recycleQty, setRecycleQty] = useState("1");
  const [redeemTarget, setRedeemTarget] = useState(null);

  const [{ data, loading, error }, refetch] = useAxios("/api/character-fragments", {
    manual: true,
  });
  // 女神石餘額不在碎片 API 裡（後端刻意省掉以避開 gap lock），要另外打 summary。
  const [{ data: summary }, refetchSummary] = useAxios("/api/public-market/summary", {
    manual: true,
  });
  const [{ loading: acting }, submit] = useAxios({ method: "POST" }, { manual: true });
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "角色碎片";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetch().catch(() => {});
    refetchSummary().catch(() => {});
  }, [isLoggedIn, refetch, refetchSummary]);

  const cost = Number(data?.redeemCost) > 0 ? Number(data.redeemCost) : REDEEM_COST_FALLBACK;
  const rows = useMemo(() => (Array.isArray(data?.fragments) ? data.fragments : []), [data]);

  const counts = useMemo(
    () =>
      FILTERS.reduce(
        (acc, f) => ({ ...acc, [f.key]: rows.filter(r => matchesFilter(r, f.key, cost)).length }),
        {}
      ),
    [rows, cost]
  );

  const visible = useMemo(() => {
    const base = rows.filter(r => matchesFilter(r, filter, cost));
    const q = keyword.trim().toLowerCase();
    const hits = q
      ? base.filter(r => r.name?.toLowerCase().includes(q) || String(r.itemId).includes(q))
      : base;
    // 可兌換的排最前面，其次片數多的：畫面第一眼就該是「你現在能做的事」。
    return [...hits].sort((a, b) => {
      if (a.canRedeem !== b.canRedeem) return a.canRedeem ? -1 : 1;
      return Number(b.amount) - Number(a.amount);
    });
  }, [rows, filter, cost, keyword]);

  /* ---- 操作 ---------------------------------------------------------- */

  const reload = useCallback(() => {
    refetch().catch(() => {});
    // 回收會發女神石、兌換會花碎片，餘額都得重讀一次。
    refetchSummary().catch(() => {});
  }, [refetch, refetchSummary]);

  const openRecycle = row => {
    setRecycleTarget(row);
    setRecycleQty("1");
  };

  const qtyNum = Number(recycleQty);
  const recycleMax = Number(recycleTarget?.amount ?? 0);
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= recycleMax;

  const handleRecycle = async () => {
    if (!recycleTarget || !qtyValid) return;
    const target = recycleTarget;
    try {
      const { data: res } = await submit({
        url: `/api/character-fragments/${target.itemId}/recycle`,
        data: { quantity: qtyNum },
      });
      setRecycleTarget(null);
      handleOpen(
        `已回收 ${target.name || "角色"}碎片 ${fmtStone(res.quantity)} 片，獲得 ${fmtStone(
          res.godStoneGained
        )} 女神石（剩 ${fmtStone(res.fragmentBalanceAfter)} 片）`,
        "success"
      );
      reload();
    } catch (err) {
      setRecycleTarget(null);
      const {
        code,
        title,
        detail,
        data: body,
      } = errorInfo(err, "回收失敗，請稍後再試", {
        fragment: true,
      });
      if (code === "INSUFFICIENT_FRAGMENTS" && body) {
        handleOpen(
          `${title}｜目前 ${fmtStone(body.balance)} 片 / 需要 ${fmtStone(body.required)} 片 / 還差 ${fmtStone(body.shortfall)} 片`,
          "error"
        );
      } else {
        handleOpen(detail ? `${title}，${detail}` : title, "error");
      }
      reload();
    }
  };

  const handleRedeem = async () => {
    if (!redeemTarget) return;
    const target = redeemTarget;
    try {
      const { data: res } = await submit({
        url: `/api/character-fragments/${target.itemId}/redeem`,
      });
      setRedeemTarget(null);
      handleOpen(
        `已兌換 ${res.name ?? target.name ?? "角色"}（${res.star ?? 1}★），花費 ${fmtStone(
          res.cost ?? cost
        )} 片，剩 ${fmtStone(res.fragmentBalanceAfter)} 片`,
        "success"
      );
      reload();
    } catch (err) {
      setRedeemTarget(null);
      const {
        code,
        title,
        detail,
        data: body,
      } = errorInfo(err, "兌換失敗，請稍後再試", {
        fragment: true,
      });
      if (code === "INSUFFICIENT_FRAGMENTS" && body) {
        handleOpen(
          `${title}｜目前 ${fmtStone(body.balance)} 片 / 需要 ${fmtStone(body.required)} 片 / 還差 ${fmtStone(body.shortfall)} 片`,
          "error"
        );
      } else {
        handleOpen(detail ? `${title}，${detail}` : title, "error");
      }
      reload();
    }
  };

  const handleSell = row => navigate(`/trade/sell?itemKind=fragment&itemId=${row.itemId}`);

  if (!isLoggedIn) return <AlertLogin />;

  const empty = !loading && !error && rows.length === 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.75,
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      {loading && !data ? (
        <Skeleton variant="rounded" height={188} animation="wave" />
      ) : (
        <Overview rows={rows} cost={cost} loading={loading && !data} />
      )}

      {/* 女神石餘額放在總覽下面一行：回收會讓它變多，看得到才知道回收有效。 */}
      <Box
        sx={theme => ({
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1.125,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          fontSize: 13,
        })}
      >
        <DiamondIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography component="span" sx={{ fontSize: 13 }}>
          你的女神石
        </Typography>
        <Typography component="span" sx={{ ml: "auto", fontWeight: 700, ...NUMS }}>
          {summary ? fmtStone(summary.balance) : "—"}
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3 }}
          action={
            <Button color="inherit" size="small" onClick={reload}>
              重試
            </Button>
          }
        >
          載入碎片清單失敗，請稍後再試
        </Alert>
      )}

      {!empty && (
        <>
          <ToggleButtonGroup
            value={filter}
            exclusive
            size="small"
            fullWidth
            onChange={(_, v) => v !== null && setFilter(v)}
            aria-label="碎片篩選"
            sx={{
              "& .MuiToggleButton-root": {
                py: 0.5,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "none",
                borderRadius: "999px !important",
              },
            }}
          >
            {FILTERS.map(f => (
              <ToggleButton
                key={f.key}
                value={f.key}
                aria-label={
                  f.key === "owned"
                    ? "只看已持有角色的碎片，這些可以回收或賣出"
                    : f.key === "redeem"
                      ? `只看已滿 ${cost} 片且還沒持有的角色`
                      : f.key === "short"
                        ? `只看還不到 ${cost} 片的角色`
                        : "看全部碎片"
                }
              >
                {f.label}
                {loading && !data ? "" : ` ${counts[f.key] ?? 0}`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            type="search"
            size="small"
            fullWidth
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜尋角色名稱或編號"
            aria-label="搜尋角色名稱或編號"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </>
      )}

      {loading && !data ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }} aria-busy="true">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={148} animation="wave" />
          ))}
        </Box>
      ) : empty ? (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            textAlign: "center",
            py: 5,
            px: 2.5,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.25,
          }}
        >
          <Box
            aria-hidden="true"
            sx={theme => ({
              width: 72,
              height: 72,
              borderRadius: 3,
              border: "2px dashed",
              borderColor: alpha(theme.palette.secondary.main, 0.45),
              display: "grid",
              placeItems: "center",
              color: "secondary.main",
            })}
          >
            <AutoAwesomeMosaicRoundedIcon sx={{ fontSize: 30 }} />
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
            你還沒有任何碎片
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            抽到已經持有的角色時，就會轉成該角色的碎片。
            <br />
            也可以到市場上向其他玩家買碎片。
          </Typography>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => navigate("/trade/market?itemKind=fragment")}
            sx={{ mt: 0.75 }}
          >
            去碎片市場看看
          </Button>
        </Paper>
      ) : (
        <>
          <SectionTitle>
            {FILTERS.find(f => f.key === filter)?.label} · {visible.length} 種
          </SectionTitle>

          {visible.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25, py: 0.75 }}>
              {keyword.trim()
                ? `「${keyword.trim()}」在這個篩選下沒有符合的碎片。`
                : filter === "redeem"
                  ? `目前沒有已滿 ${cost} 片又還沒持有的角色。`
                  : filter === "owned"
                    ? "目前沒有已持有角色的碎片。"
                    : "這個篩選下沒有碎片。"}
            </Typography>
          ) : (
            <Box
              component="ul"
              sx={{
                listStyle: "none",
                m: 0,
                p: 0,
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
              }}
            >
              {visible.map(row => (
                <FragmentCard
                  key={row.itemId}
                  row={row}
                  cost={cost}
                  onRecycle={openRecycle}
                  onRedeem={setRedeemTarget}
                  onSell={handleSell}
                />
              ))}
            </Box>
          )}
        </>
      )}

      {rows.length > 0 && (
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<StorefrontRoundedIcon />}
          onClick={() => navigate("/trade/market?itemKind=fragment")}
        >
          前往碎片市場
        </Button>
      )}

      {/* ---------------------------------------------------------- 回收 */}
      <Dialog
        open={Boolean(recycleTarget)}
        onClose={() => setRecycleTarget(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="recycle-title"
      >
        <DialogTitle id="recycle-title" sx={{ fontWeight: 700 }}>
          回收{recycleTarget?.name ?? "角色"}碎片
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ borderRadius: 3, mb: 1.75 }}>
            <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.25 }}>
              1 碎片 = 1 女神石
            </AlertTitle>
            <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
              回收後碎片就消失了，無法還原。想留著湊 {cost} 片兌換角色的話，先別回收。
            </Typography>
          </Alert>

          <TextField
            fullWidth
            label="回收片數"
            value={recycleQty}
            onChange={e => setRecycleQty(e.target.value.replace(/[^0-9]/g, ""))}
            error={recycleQty !== "" && !qtyValid}
            helperText={
              recycleQty !== "" && !qtyValid
                ? `只能填 1 ～ ${fmtStone(recycleMax)} 的整數`
                : `目前持有 ${fmtStone(recycleMax)} 片`
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end" sx={{ flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 600 }}>
                      片
                    </Typography>
                  </InputAdornment>
                ),
                sx: { "& input": { fontSize: 19, fontWeight: 600, ...NUMS } },
              },
              htmlInput: { inputMode: "numeric", pattern: "[0-9]*" },
            }}
          />

          <Box sx={{ display: "flex", gap: 1, mt: 1.25, flexWrap: "wrap" }}>
            {/* 快捷鍵只出現真的按得下去的：上限本身、以及不會動到兌換庫存的「多的部分」。 */}
            {[10, 50, 100].map(n =>
              n <= recycleMax ? (
                <Button
                  key={n}
                  size="small"
                  variant={String(n) === recycleQty ? "contained" : "outlined"}
                  onClick={() => setRecycleQty(String(n))}
                  sx={{ minWidth: 56, ...NUMS }}
                >
                  {n}
                </Button>
              ) : null
            )}
            <Button
              size="small"
              variant={String(recycleMax) === recycleQty ? "contained" : "outlined"}
              onClick={() => setRecycleQty(String(recycleMax))}
              sx={{ ...NUMS }}
            >
              全部 {fmtStone(recycleMax)}
            </Button>
            {recycleMax > cost && (
              <Button
                size="small"
                variant={String(recycleMax - cost) === recycleQty ? "contained" : "outlined"}
                onClick={() => setRecycleQty(String(recycleMax - cost))}
                sx={{ ...NUMS }}
              >
                留 {cost} 片
              </Button>
            )}
          </Box>

          <Box sx={{ mt: 1.75 }}>
            <Row label="回收片數" value={`${fmtStone(qtyValid ? qtyNum : 0)} 片`} />
            <Row
              label="可得女神石"
              value={`${fmtStone(qtyValid ? qtyNum : 0)} 女神石`}
              valueColor="primary.main"
            />
            <Row
              label="回收後剩下"
              value={`${fmtStone(qtyValid ? recycleMax - qtyNum : recycleMax)} 片`}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRecycleTarget(null)} disabled={acting}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleRecycle}
            disabled={!qtyValid || acting}
            autoFocus
          >
            確認回收
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------------- 兌換 */}
      <Dialog
        open={Boolean(redeemTarget)}
        onClose={() => setRedeemTarget(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="redeem-title"
      >
        <DialogTitle id="redeem-title" sx={{ fontWeight: 700 }}>
          兌換{redeemTarget?.name ?? "角色"}？
        </DialogTitle>
        <DialogContent>
          {/* 這段是整頁最容易被誤解的地方，所以用 warning 而不是 info：
              碎片列上顯示的是「角色原生星數」，但兌換出來固定 1★。
              把兩個數字並排寫出來，不讓人自己推。 */}
          <Alert severity="warning" sx={{ borderRadius: 3, mb: 1.5 }}>
            <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>
              兌換取得的角色固定 1★
            </AlertTitle>
            <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
              {redeemTarget?.baseStar >= 1 ? (
                <>
                  {redeemTarget.name} 的原生星數是 <strong>{redeemTarget.baseStar}★</strong>
                  ，但用碎片兌換拿到的是 <strong>1★</strong>，不是 {redeemTarget.baseStar}★。
                  想要更高星等得自己用女神石升星。
                </>
              ) : (
                <>
                  用碎片兌換拿到的角色一律是 <strong>1★</strong>，不是該角色的原生星數。
                  想要更高星等得自己用女神石升星。
                </>
              )}
            </Typography>
          </Alert>

          {redeemTarget && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.375,
                pt: 0.5,
                pb: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                mb: 0.75,
              }}
            >
              <CharAvatar
                itemId={redeemTarget.itemId}
                name={redeemTarget.name || ""}
                headImage={redeemTarget.headImage}
                kind="fragment"
                size={40}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                  {redeemTarget.name || `角色 ${redeemTarget.itemId}`}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
                  {redeemTarget.itemId}
                </Typography>
              </Box>
            </Box>
          )}

          {redeemTarget && (
            <Box>
              <Row label="消耗碎片" value={`${fmtStone(cost)} 片`} />
              <Row label="你會取得" value="1★ 角色" valueColor="success.main" />
              {Number(redeemTarget.baseStar) >= 1 && (
                <Row
                  label="角色原生星數"
                  value={`${Number(redeemTarget.baseStar)}★（不是你取得的星數）`}
                  valueColor="text.secondary"
                />
              )}
              <Row
                label="兌換後剩下"
                value={`${fmtStone(Math.max(0, Number(redeemTarget.amount) - cost))} 片`}
              />
            </Box>
          )}

          <Typography sx={{ mt: 1.5, fontSize: 11.5, color: "text.secondary", lineHeight: 1.65 }}>
            兌換是不可逆的，碎片消耗後不會退還。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRedeemTarget(null)} disabled={acting}>
            取消
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRedeem}
            disabled={acting}
            autoFocus
          >
            確認兌換 1★
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
