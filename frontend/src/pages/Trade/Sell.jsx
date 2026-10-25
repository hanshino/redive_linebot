import { useEffect, useMemo, useRef, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import LoadError from "../../components/LoadError";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import CharacterPickerDrawer from "./CharacterPickerDrawer";
import { QUICK_PRICES } from "./_shared";
import {
  MAX_OPEN_FALLBACK,
  META_TEXT,
  NUMS,
  PRICE_MAX,
  PRICE_MIN,
  TAP_TARGETS,
  PAGE_WIDTH,
  TOUCH,
  calcFee,
  calcNet,
  errorInfo,
  fmtStone,
  useMarketAnchors,
} from "./_market";
import { CharAvatar, GradientPanel, MarketAnchor } from "./_marketUi";

/* ---------------------------------------------------------------- banner */
function SummaryBanner({ balance, openCount, maxOpen, capped, loading }) {
  return (
    <GradientPanel tone="sell">
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 12, opacity: 0.9, letterSpacing: ".4px" }}>
            持有女神石
          </Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, ...NUMS }}>
            {loading ? "—" : fmtStone(balance)}
          </Typography>
        </Box>
        <Box
          sx={{
            width: "1px",
            alignSelf: "stretch",
            bgcolor: theme => alpha(theme.palette.common.white, 0.28),
            my: 0.25,
            mx: 0.5,
          }}
        />
        <Box>
          <Typography sx={{ fontSize: 12, opacity: 0.9, letterSpacing: ".4px" }}>
            目前掛單
          </Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, ...NUMS }}>
            {loading ? "—" : openCount}{" "}
            <Box component="small" sx={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
              / {maxOpen} 筆
            </Box>
          </Typography>
        </Box>
        {capped && (
          <Box
            sx={{
              ml: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.625,
              px: 1.25,
              py: 0.375,
              borderRadius: 999,
              bgcolor: theme => alpha(theme.palette.common.white, 0.2),
              border: theme => `1px solid ${alpha(theme.palette.common.white, 0.3)}`,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Box component="span" aria-hidden="true">
              ●
            </Box>
            已滿
          </Box>
        )}
      </Box>
    </GradientPanel>
  );
}

function Label({ children }) {
  return (
    <Typography
      sx={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: ".4px",
        color: "text.secondary",
        mx: 0.25,
        mt: 2,
        mb: 0.875,
      }}
    >
      {children}
    </Typography>
  );
}

/* ---------------------------------------------------------------- 費用明細 */
function FeeBreakdown({ price, feeLabel = "手續費（5%）", netLabel = "實收" }) {
  const fee = calcFee(price);
  const net = calcNet(price);
  const line = (label, value, sx) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        py: 0.75,
        ...sx,
      }}
    >
      <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
        {label}
      </Typography>
      {value}
    </Box>
  );

  return (
    <Box aria-live="polite">
      {line(
        "售價",
        <Box component="b" sx={{ fontSize: 16, fontWeight: 600, ...NUMS }}>
          {fmtStone(price)}
        </Box>
      )}
      {line(
        feeLabel,
        <Box component="b" sx={{ fontSize: 16, fontWeight: 600, color: "error.main", ...NUMS }}>
          −{fmtStone(fee)}
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          py: 0.75,
        }}
      >
        <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
          {netLabel}
        </Typography>
        <Box component="b" sx={{ fontSize: 24, fontWeight: 600, color: "primary.main", ...NUMS }}>
          {fmtStone(net)}
        </Box>
      </Box>
    </Box>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function Sell() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState(null);
  const [price, setPrice] = useState("1000");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 成功之後到換頁之前的空窗：CTA 維持停用（已送出），不能再按一次重複建立。
  const [done, setDone] = useState(false);
  const navTimer = useRef(null);

  const [{ data: summary, loading: summaryLoading, error: summaryError }, refetchSummary] =
    useAxios("/api/public-market/summary", { manual: true });
  const [{ data: inventoryItems, loading: invLoading, error: invError }, fetchItems] = useAxios(
    "/api/inventory",
    { manual: true }
  );
  const [{ loading: creating }, createListing] = useAxios(
    { url: "/api/public-market/listings", method: "POST" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();
  const anchors = useMarketAnchors(isLoggedIn);

  useEffect(() => {
    document.title = "掛賣單";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary().catch(() => {});
    fetchItems().catch(() => {});
  }, [isLoggedIn, refetchSummary, fetchItems]);

  // 石頭本身是背包裡的 itemId 999，不是可以掛賣的角色。
  const characters = useMemo(
    () => (Array.isArray(inventoryItems) ? inventoryItems : []).filter(i => i.itemId !== 999),
    [inventoryItems]
  );

  const selected = useMemo(
    () => characters.find(c => c.itemId === selectedId) || null,
    [characters, selectedId]
  );

  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;
  const openCount = summary?.myOpenCount ?? 0;
  // 送出成功後 summary 會重抓，剛好掛滿時 capped 會翻成 true：done 之後一律不顯示額滿，
  // 免得「已送出」的 1 秒內冒出紅色上限警告。
  const capped = !done && !summaryLoading && !summaryError && openCount >= maxOpen;

  // 離開頁面時清掉等待換頁的計時器，避免在別的頁面突然被導走。
  useEffect(() => () => clearTimeout(navTimer.current), []);

  const priceNum = Number(price);
  const priceValid = Number.isInteger(priceNum) && priceNum >= PRICE_MIN && priceNum <= PRICE_MAX;
  const submittable = !capped && !done && selectedId != null && priceValid && !creating;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    try {
      const { data } = await createListing({ data: { itemId: selectedId, price: priceNum } });
      handleOpen(
        `已建立委託：${data.name ?? selected?.name ?? "角色"} ${fmtStone(data.price ?? priceNum)} 女神石`,
        "success"
      );
      refetchSummary().catch(() => {});
      setDone(true);
      navTimer.current = setTimeout(() => navigate("/trade/my-listings"), 1200);
    } catch (err) {
      const { title, detail } = errorInfo(err, "掛單失敗，請稍後再試");
      handleOpen(detail ? `${title}，${detail}` : title, "error");
      refetchSummary().catch(() => {});
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
        ...TAP_TARGETS,
        ...PAGE_WIDTH,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.75 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: "1 1 auto" }}>
          掛賣單
        </Typography>
        <IconButton
          aria-label="我的掛單"
          onClick={() => navigate("/trade/my-listings")}
          sx={{ width: TOUCH, height: TOUCH }}
        >
          <ReceiptLongIcon />
        </IconButton>
      </Box>

      {summaryLoading && !summary ? (
        <Skeleton variant="rounded" height={92} animation="wave" />
      ) : (
        <SummaryBanner
          balance={summary?.balance}
          openCount={openCount}
          maxOpen={maxOpen}
          capped={capped}
          loading={summaryLoading && !summary}
        />
      )}

      {summaryError && (
        <LoadError
          sx={{ py: 0, mt: 1.75 }}
          message="載入掛單狀態失敗，目前看不到你已掛幾筆。請檢查網路後再試一次。"
          onRetry={() => refetchSummary().catch(() => {})}
        />
      )}

      {invError && (
        <LoadError
          sx={{ py: 0, mt: 1.75 }}
          message="背包載入失敗，現在選不到要賣的角色。請檢查網路後再試一次。"
          onRetry={() => fetchItems().catch(() => {})}
        />
      )}

      {capped && (
        <Alert severity="error" sx={{ borderRadius: 3, mt: 1.75 }}>
          <AlertTitle sx={{ fontSize: 14, fontWeight: 700, mb: 0.25 }}>
            最多只能同時掛 {maxOpen} 筆
          </AlertTitle>
          <Typography sx={{ fontSize: 13, lineHeight: 1.7, color: "text.secondary" }}>
            賣單和收購單合計算。取消一筆或等成交後再掛。
          </Typography>
        </Alert>
      )}

      <Box sx={{ opacity: capped ? 0.55 : 1, pointerEvents: capped ? "none" : "auto" }}>
        <Label>要賣的角色</Label>
        <Paper
          component="button"
          type="button"
          elevation={0}
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-disabled={capped || undefined}
          disabled={capped || done || invLoading || Boolean(invError)}
          sx={theme => ({
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            textAlign: "left",
            px: 1.5,
            py: 1.375,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            color: "text.primary",
            font: "inherit",
            "&:hover": {
              borderColor: "primary.light",
              bgcolor: alpha(theme.palette.primary.main, 0.06),
            },
          })}
        >
          {selected ? (
            <>
              <CharAvatar
                itemId={selected.itemId}
                name={selected.name}
                headImage={selected.headImage}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600 }} noWrap>
                  {selected.name}
                </Typography>
                <Typography sx={META_TEXT}>{selected.itemId}</Typography>
              </Box>
            </>
          ) : (
            <Typography sx={{ fontSize: 16, color: "text.secondary", py: 0.75 }}>
              {invLoading ? "載入背包中…" : invError ? "背包載入失敗" : "點此選擇角色"}
            </Typography>
          )}
          <ChevronRightIcon sx={{ ml: "auto", color: "text.secondary" }} />
        </Paper>

        <Label>售價</Label>
        <TextField
          fullWidth
          id="priceInput"
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={capped || done}
          error={price !== "" && !priceValid}
          helperText={price !== "" && !priceValid ? "請填 1 ～ 10,000,000" : undefined}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 14, color: "text.secondary", fontWeight: 600 }}>
                    女神石
                  </Typography>
                </InputAdornment>
              ),
              sx: { "& input": { fontSize: 20, fontWeight: 600, ...NUMS } },
            },

            // helperText 會由 TextField 依 id 自動接上 aria-describedby，不要另外指定。
            htmlInput: { inputMode: "numeric", pattern: "[0-9]*", "aria-label": "單價（女神石）" },
          }}
        />
        <Box
          role="group"
          aria-label="常用價格"
          sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.25 }}
        >
          {QUICK_PRICES.map(p => (
            <Chip
              key={p}
              label={fmtStone(p)}
              clickable
              disabled={capped || done}
              aria-pressed={String(p) === price}
              onClick={() => setPrice(String(p))}
              variant={String(p) === price ? "filled" : "outlined"}
              color={String(p) === price ? "primary" : "default"}
              sx={{ fontWeight: 600, height: TOUCH, borderRadius: 999, px: 0.75, ...NUMS }}
            />
          ))}
        </Box>
        <MarketAnchor anchors={anchors} itemId={selectedId} />

        <Label>成交後的金額</Label>
        <Paper
          elevation={0}
          sx={{ px: 1.75, py: 1.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
        >
          <FeeBreakdown price={priceValid ? priceNum : 0} />
        </Paper>
      </Box>

      {capped ? (
        <>
          <Button variant="contained" disabled sx={{ mt: 2, py: 1.625 }}>
            掛單數已達上限
          </Button>
          <Button variant="text" onClick={() => navigate("/trade/my-listings")} sx={{ mt: 0.75 }}>
            前往我的掛單
          </Button>
        </>
      ) : (
        <Button
          variant="contained"
          disabled={!submittable}
          onClick={() => setConfirmOpen(true)}
          sx={{ mt: 2, py: 1.625 }}
        >
          {done ? "已送出" : "送出掛單"}
        </Button>
      )}

      <CharacterPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={characters}
        initialId={selectedId}
        onConfirm={id => setSelectedId(id)}
        title="選擇角色"
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="sell-confirm-title"
        slotProps={{ paper: { sx: TAP_TARGETS } }}
      >
        <DialogTitle id="sell-confirm-title" sx={{ fontWeight: 600 }}>
          確認掛單？
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 3, mb: 1.5 }}>
            <AlertTitle sx={{ fontSize: 14, fontWeight: 700, mb: 0.5 }}>
              你的升星強化不會轉移
            </AlertTitle>
            <Typography sx={{ fontSize: 13, lineHeight: 1.7, color: "text.secondary" }}>
              買家拿到的是<strong>初始星數</strong>，升星花掉的女神石不會退。
            </Typography>
          </Alert>

          {selected && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.375,
                pt: 1.25,
                pb: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                mb: 0.75,
              }}
            >
              <CharAvatar
                itemId={selected.itemId}
                name={selected.name}
                headImage={selected.headImage}
                size={38}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600 }} noWrap>
                  {selected.name}
                </Typography>
                <Typography sx={META_TEXT}>{selected.itemId}</Typography>
              </Box>
            </Box>
          )}

          <FeeBreakdown
            price={priceValid ? priceNum : 0}
            feeLabel="手續費（5%，銷毀）"
            netLabel="成交後實收"
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmOpen(false)} disabled={creating}>
            取消
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={creating} autoFocus>
            確認掛單
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
