import { useEffect, useMemo, useState } from "react";
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
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import CharacterPickerDrawer from "./CharacterPickerDrawer";
import { QUICK_PRICES } from "./_shared";
import {
  MAX_OPEN_FALLBACK,
  NUMS,
  PRICE_MAX,
  PRICE_MIN,
  calcFee,
  calcNet,
  errorInfo,
  fmtStone,
} from "./_market";
import { CharAvatar, GradientPanel } from "./_marketUi";

/* ---------------------------------------------------------------- banner */
/**
 * 收購單的 banner 多一格「本次預扣」：發布當下錢就離開錢包，
 * 這是跟賣單最大的差別，所以放在最顯眼的位置，不是塞在下面的明細裡。
 */
function SummaryBanner({ balance, openCount, maxOpen, capped, reserve, loading }) {
  const after = Math.max(0, Number(balance ?? 0) - Number(reserve ?? 0));

  return (
    <GradientPanel tone="buy">
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 11.5, opacity: 0.88, letterSpacing: ".4px" }}>
            持有女神石
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, ...NUMS }}>
            {loading ? "—" : fmtStone(balance)}
          </Typography>
        </Box>
        <Box
          sx={{
            width: "1px",
            alignSelf: "stretch",
            bgcolor: "rgba(255,255,255,.28)",
            my: 0.25,
            mx: 0.5,
          }}
        />
        <Box>
          <Typography sx={{ fontSize: 11.5, opacity: 0.88, letterSpacing: ".4px" }}>
            目前掛單
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, ...NUMS }}>
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
              bgcolor: "rgba(255,255,255,.20)",
              border: "1px solid rgba(255,255,255,.30)",
              fontSize: 11.5,
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

      {reserve > 0 && !capped && (
        <Box
          aria-live="polite"
          sx={{
            mt: 1.5,
            pt: 1.25,
            borderTop: "1px solid rgba(255,255,255,.24)",
            display: "flex",
            alignItems: "baseline",
            gap: 0.75,
            fontSize: 12.5,
            ...NUMS,
          }}
        >
          <Box component="span" sx={{ opacity: 0.88 }}>
            發布後預扣
          </Box>
          <Box component="b" sx={{ fontSize: 15, fontWeight: 700 }}>
            −{fmtStone(reserve)}
          </Box>
          <Box component="span" sx={{ ml: "auto", opacity: 0.88 }}>
            餘額剩 {fmtStone(after)}
          </Box>
        </Box>
      )}
    </GradientPanel>
  );
}

function Label({ children }) {
  return (
    <Typography
      sx={{
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: ".6px",
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

/* ---------------------------------------------------------------- 金流明細 */
/**
 * 收購單有兩條線：你付出的全額，跟賣家真正拿到的數字。
 * 兩個都要寫出來，不然賣家會以為出價 1000 就能拿滿 1000。
 */
function BuyBreakdown({ price }) {
  const fee = calcFee(price);
  const net = calcNet(price);

  const line = (label, value, hint) => (
    <Box sx={{ py: 0.75 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
          {label}
        </Typography>
        {value}
      </Box>
      {hint && (
        <Typography sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.6, mt: 0.25 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );

  return (
    <Box aria-live="polite">
      {line(
        "你的出價",
        <Box component="b" sx={{ fontSize: 15, fontWeight: 600, ...NUMS }}>
          {fmtStone(price)}
        </Box>
      )}
      {line(
        "發布時預扣",
        <Box component="b" sx={{ fontSize: 15, fontWeight: 600, color: "error.main", ...NUMS }}>
          −{fmtStone(price)}
        </Box>,
        "全額先從錢包扣起來鎖住，成交前不能動用。"
      )}
      <Divider sx={{ my: 1 }} />
      {line(
        "手續費（5%，銷毀）",
        <Box component="b" sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary", ...NUMS }}>
          {fmtStone(fee)}
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          py: 0.75,
        }}
      >
        <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 600 }}>
          成交時賣家實收
        </Typography>
        <Box component="b" sx={{ fontSize: 22, fontWeight: 600, color: "secondary.main", ...NUMS }}>
          {fmtStone(net)}
        </Box>
      </Box>
      <Typography
        sx={{
          mt: 1.25,
          pt: 1.25,
          borderTop: "1px dashed",
          borderColor: "divider",
          fontSize: 11.5,
          color: "text.secondary",
          lineHeight: 1.65,
        }}
      >
        取消或失效時，預扣的 {fmtStone(price)} 女神石會原數退回，不收任何費用。
      </Typography>
    </Box>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function Buy() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState(null);
  const [price, setPrice] = useState("1000");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [{ data: summary, loading: summaryLoading, error: summaryError }, refetchSummary] =
    useAxios("/api/public-market/summary", { manual: true });
  const [{ data: pool, loading: poolLoading, error: poolError }, fetchPool] = useAxios(
    "/api/inventory/pool",
    { manual: true }
  );
  const [{ data: inventoryItems, loading: invLoading, error: invError }, fetchItems] = useAxios(
    "/api/inventory",
    { manual: true }
  );
  const [{ loading: creating }, createListing] = useAxios(
    { url: "/api/public-market/listings", method: "POST" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "發布收購單";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary();
    fetchPool().catch(() => {});
    fetchItems().catch(() => {});
  }, [isLoggedIn, refetchSummary, fetchPool, fetchItems]);

  // 背包裡的 itemId 999 是女神石本身，不是角色。
  const ownedIds = useMemo(
    () =>
      new Set(
        (Array.isArray(inventoryItems) ? inventoryItems : [])
          .filter(i => i.itemId !== 999)
          .map(i => String(i.itemId))
      ),
    [inventoryItems]
  );

  // 收購單只能掛「自己沒有的」角色：角色一人一隻，收到手也不會生效。
  // 背包還沒回來就不能過濾，否則會把已持有的角色一起放進選單。
  const ownedKnown = Array.isArray(inventoryItems) && !invError;
  const candidates = useMemo(() => {
    if (!Array.isArray(pool) || !ownedKnown) return [];
    return pool.filter(c => !ownedIds.has(String(c.itemId)));
  }, [pool, ownedIds, ownedKnown]);

  // selected 只從 candidates 裡查。背包晚一步回來、或使用者中途自己抽到同一隻角色時，
  // 那位角色會直接從 candidates 消失，selected 自然變回 null —— 不用另外寫一個
  // effect 去清 state，也就不會有「畫面還顯示著、送出卻被拒」的空窗。
  const selected = useMemo(
    () => candidates.find(c => c.itemId === selectedId) || null,
    [candidates, selectedId]
  );

  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;
  const openCount = summary?.myOpenCount ?? 0;
  const capped = !summaryLoading && !summaryError && openCount >= maxOpen;

  const priceNum = Number(price);
  const priceValid = Number.isInteger(priceNum) && priceNum >= PRICE_MIN && priceNum <= PRICE_MAX;

  const balance = summary?.balance;
  // 餘額還沒讀到就不預先擋人：真正的判斷在後端，前端先擋只是省一次來回。
  const balanceKnown = Number.isFinite(Number(balance));
  const short = priceValid && balanceKnown && Number(balance) < priceNum;

  const listLoading = poolLoading || invLoading;
  const listBroken = Boolean(poolError) || Boolean(invError);

  const submittable =
    !capped && !short && !listBroken && selected != null && priceValid && !creating;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    if (!selected) return;
    try {
      const { data } = await createListing({
        data: { orderType: "buy", itemId: selected.itemId, price: priceNum },
      });
      handleOpen(
        `已發布收購單：${data.name ?? selected?.name ?? "角色"} ${fmtStone(data.price ?? priceNum)} 女神石（已預扣）`,
        "success"
      );
      refetchSummary();
      setTimeout(() => navigate("/trade/my-listings"), 1200);
    } catch (err) {
      const { title, detail } = errorInfo(err, "發布收購單失敗，請稍後再試");
      handleOpen(detail ? `${title}，${detail}` : title, "error");
      refetchSummary();
      fetchItems().catch(() => {});
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  const pickerHint = listLoading
    ? "載入角色清單中…"
    : listBroken
      ? "角色清單載入失敗"
      : candidates.length === 0
        ? "沒有可收購的角色"
        : "點此選擇角色";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.75 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: "1 1 auto" }}>
          發布收購單
        </Typography>
        <IconButton aria-label="我的掛單" onClick={() => navigate("/trade/my-listings")}>
          <ReceiptLongIcon />
        </IconButton>
      </Box>

      {summaryLoading && !summary ? (
        <Skeleton variant="rounded" height={92} animation="wave" />
      ) : (
        <SummaryBanner
          balance={balance}
          openCount={openCount}
          maxOpen={maxOpen}
          capped={capped}
          reserve={priceValid ? priceNum : 0}
          loading={summaryLoading && !summary}
        />
      )}

      {summaryError && (
        <Alert severity="error" sx={{ borderRadius: 3, mt: 1.75 }}>
          載入掛單狀態失敗，請稍後再試
        </Alert>
      )}

      {listBroken && (
        <Alert severity="error" sx={{ borderRadius: 3, mt: 1.75 }}>
          <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.25 }}>讀不到角色清單</AlertTitle>
          <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
            沒辦法確認你已經擁有哪些角色，先不開放發布，以免掛到已持有的角色。
          </Typography>
          <Button
            size="small"
            sx={{ mt: 0.75 }}
            onClick={() => {
              fetchPool().catch(() => {});
              fetchItems().catch(() => {});
            }}
          >
            重試
          </Button>
        </Alert>
      )}

      {capped && (
        <Alert severity="error" sx={{ borderRadius: 3, mt: 1.75 }}>
          <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.25 }}>
            最多只能同時掛 {maxOpen} 筆
          </AlertTitle>
          <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
            賣單和收購單合計算。先去「我的掛單」取消一筆，或等現有的單成交，才能再掛新的。
          </Typography>
        </Alert>
      )}

      <Box sx={{ opacity: capped ? 0.55 : 1, pointerEvents: capped ? "none" : "auto" }}>
        <Label>想收購的角色</Label>
        <Paper
          component="button"
          type="button"
          elevation={0}
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-disabled={capped || undefined}
          disabled={capped || listLoading || listBroken || candidates.length === 0}
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
              borderColor: "secondary.light",
              bgcolor: alpha(theme.palette.secondary.main, 0.06),
            },
            "&:disabled": { cursor: "default" },
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
                <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                  {selected.name}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
                  {selected.itemId}
                </Typography>
              </Box>
            </>
          ) : (
            <Typography sx={{ fontSize: 15, color: "text.secondary", py: 0.75 }}>
              {pickerHint}
            </Typography>
          )}
          <ChevronRightIcon sx={{ ml: "auto", color: "text.secondary" }} />
        </Paper>
        <Typography
          sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.6, mt: 0.75, mx: 0.25 }}
        >
          只列出你還沒有的角色。角色一人一隻，已持有的收到也不會生效。
        </Typography>

        {!listLoading && !listBroken && candidates.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 3, mt: 1.25 }}>
            你已經蒐集完所有角色了，沒有可以收購的對象。
          </Alert>
        )}

        <Label>收購價</Label>
        <TextField
          fullWidth
          id="buyPriceInput"
          label="出價（女神石）"
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={capped}
          color="secondary"
          error={(price !== "" && !priceValid) || short}
          helperText={
            short
              ? `女神石不足，餘額 ${fmtStone(balance)}，還差 ${fmtStone(priceNum - Number(balance))}`
              : "可填 1 ～ 10,000,000。發布時就會先預扣這個金額。"
          }
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 600 }}>
                    女神石
                  </Typography>
                </InputAdornment>
              ),
              sx: { "& input": { fontSize: 19, fontWeight: 600, ...NUMS } },
            },
            htmlInput: { inputMode: "numeric", pattern: "[0-9]*" },
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
              label={String(p)}
              clickable
              disabled={capped}
              aria-pressed={String(p) === price}
              onClick={() => setPrice(String(p))}
              variant={String(p) === price ? "filled" : "outlined"}
              color={String(p) === price ? "secondary" : "default"}
              sx={{ fontWeight: 600, ...NUMS }}
            />
          ))}
        </Box>

        <Label>金額怎麼走</Label>
        <Paper
          elevation={0}
          sx={{ px: 1.75, py: 1.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
        >
          <BuyBreakdown price={priceValid ? priceNum : 0} />
        </Paper>
      </Box>

      {capped ? (
        <>
          <Button variant="contained" color="secondary" disabled sx={{ mt: 2, py: 1.625 }}>
            掛單數已達上限
          </Button>
          <Button variant="text" onClick={() => navigate("/trade/my-listings")} sx={{ mt: 0.75 }}>
            前往我的掛單
          </Button>
        </>
      ) : (
        <Button
          variant="contained"
          color="secondary"
          disabled={!submittable}
          onClick={() => setConfirmOpen(true)}
          sx={{ mt: 2, py: 1.625 }}
        >
          {short ? "女神石不足" : "發布收購單"}
        </Button>
      )}

      <CharacterPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={candidates}
        initialId={selectedId}
        onConfirm={id => setSelectedId(id)}
        title="選擇想收購的角色"
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="buy-order-confirm-title"
      >
        <DialogTitle id="buy-order-confirm-title" sx={{ fontWeight: 600 }}>
          確認發布收購單？
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 3, mb: 1.5 }}>
            <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>
              發布當下就會預扣全額
            </AlertTitle>
            <Box
              component="ul"
              sx={{
                m: 0,
                pl: 2.25,
                fontSize: 12,
                lineHeight: 1.8,
                color: "text.secondary",
              }}
            >
              <li>
                現在扣 <strong>{fmtStone(priceValid ? priceNum : 0)}</strong>{" "}
                女神石，掛單期間這筆錢不能動用。
              </li>
              <li>取消或失效時，全額退還，不收任何費用。</li>
              <li>
                成交時賣家實收 <strong>{fmtStone(calcNet(priceValid ? priceNum : 0))}</strong>
                ，手續費 5%（{fmtStone(calcFee(priceValid ? priceNum : 0))}）銷毀。
              </li>
            </Box>
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
                <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                  {selected.name}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
                  {selected.itemId}
                </Typography>
              </Box>
            </Box>
          )}

          <BuyBreakdown price={priceValid ? priceNum : 0} />

          {balanceKnown && priceValid && (
            <Typography
              sx={{ mt: 1.25, fontSize: 11.5, color: "text.secondary", lineHeight: 1.6, ...NUMS }}
            >
              餘額 {fmtStone(balance)} → {fmtStone(Number(balance) - priceNum)} 女神石。
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmOpen(false)} disabled={creating}>
            取消
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleSubmit}
            disabled={creating}
            autoFocus
          >
            確認發布
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
