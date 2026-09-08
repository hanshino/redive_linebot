import { useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  QUANTITY_MAX,
  TOTAL_MAX,
  calcFee,
  calcNet,
  errorInfo,
  fmtStone,
  normalizeItemKind,
} from "./_market";
import { CharAvatar, GradientPanel, ItemKindSwitch } from "./_marketUi";

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
 *
 * 碎片單的「全額」是單價 × 片數。預扣、退款、手續費全部以總額計，
 * 所以這裡先把總額算出來再往下走，不能拿每片單價去算 5%。
 */
function BuyBreakdown({ price, quantity = 1, fragment = false }) {
  const total = price * quantity;
  const fee = calcFee(total);
  const net = calcNet(total);

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
      {fragment && (
        <>
          {line(
            "每片出價",
            <Box component="b" sx={{ fontSize: 15, fontWeight: 600, ...NUMS }}>
              {fmtStone(price)}
            </Box>
          )}
          {line(
            "片數",
            <Box component="b" sx={{ fontSize: 15, fontWeight: 600, ...NUMS }}>
              {fmtStone(quantity)} 片
            </Box>
          )}
        </>
      )}
      {line(
        fragment ? "總出價（單價 × 片數）" : "你的出價",
        <Box component="b" sx={{ fontSize: fragment ? 17 : 15, fontWeight: 600, ...NUMS }}>
          {fmtStone(total)}
        </Box>
      )}
      {line(
        "發布時預扣",
        <Box component="b" sx={{ fontSize: 15, fontWeight: 600, color: "error.main", ...NUMS }}>
          −{fmtStone(total)}
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
        取消或失效時，預扣的 {fmtStone(total)} 女神石會原數退回，不收任何費用。
      </Typography>
    </Box>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function Buy() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const itemKind = normalizeItemKind(searchParams.get("itemKind"));
  const fragment = itemKind === "fragment";

  const [selectedId, setSelectedId] = useState(null);
  const [price, setPrice] = useState("1000");
  const [quantity, setQuantity] = useState("10");
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
    document.title = fragment ? "發布碎片收購單" : "發布收購單";
  }, [fragment]);

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

  const ownedKnown = Array.isArray(inventoryItems) && !invError;

  /**
   * 候選清單。這是角色與碎片差最多的一格：
   *
   *   角色 —— 只能收「自己沒有的」。角色一人一隻，收到已持有的也不會生效，
   *           所以背包還沒回來時整份清單留空，寧可不開放也不要掛錯。
   *   碎片 —— **全部角色都能收，包含已經持有的**。碎片可以無限累積，
   *           已持有角色的碎片照樣有價值（回收成女神石），所以完全不過濾，
   *           也不需要等背包回來。
   */
  const candidates = useMemo(() => {
    if (!Array.isArray(pool)) return [];
    if (fragment) return pool;
    if (!ownedKnown) return [];
    return pool.filter(c => !ownedIds.has(String(c.itemId)));
  }, [pool, ownedIds, ownedKnown, fragment]);

  // selected 只從 candidates 裡查。背包晚一步回來、或使用者中途自己抽到同一隻角色時，
  // 那位角色會直接從 candidates 消失，selected 自然變回 null —— 不用另外寫一個
  // effect 去清 state，也就不會有「畫面還顯示著、送出卻被拒」的空窗。
  const selected = useMemo(
    () => candidates.find(c => c.itemId === selectedId) || null,
    [candidates, selectedId]
  );

  const handleSwitchKind = next => {
    if (next === itemKind) return;
    setSelectedId(null);
    const params = {};
    if (next === "fragment") params.itemKind = "fragment";
    setSearchParams(params, { replace: true });
  };

  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;
  const openCount = summary?.myOpenCount ?? 0;
  const capped = !summaryLoading && !summaryError && openCount >= maxOpen;

  const priceNum = Number(price);
  const priceValid = Number.isInteger(priceNum) && priceNum >= PRICE_MIN && priceNum <= PRICE_MAX;

  // 碎片的片數是必填；角色恆為 1。
  const qtyNum = fragment ? Number(quantity) : 1;
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= QUANTITY_MAX;

  // 預扣的是**總額**，不是每片單價。餘額比對、按鈕文案全部看這個數字。
  const total = priceValid && qtyValid ? priceNum * qtyNum : 0;
  const totalOver = priceValid && qtyValid && total > TOTAL_MAX;

  const balance = summary?.balance;
  // 餘額還沒讀到就不預先擋人：真正的判斷在後端，前端先擋只是省一次來回。
  const balanceKnown = Number.isFinite(Number(balance));
  const short = total > 0 && balanceKnown && Number(balance) < total;

  const listLoading = poolLoading || invLoading;
  // 碎片不需要背包（不過濾已持有），所以背包壞掉不該擋住碎片收購單。
  const listBroken = Boolean(poolError) || (!fragment && Boolean(invError));

  const submittable =
    !capped &&
    !short &&
    !totalOver &&
    !listBroken &&
    selected != null &&
    priceValid &&
    qtyValid &&
    !creating;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    if (!selected) return;
    try {
      // price 一律是每片／每隻單價。碎片的總額由後端用 quantity 算，前端不送 total。
      const { data } = await createListing({
        data: fragment
          ? {
              orderType: "buy",
              itemKind: "fragment",
              itemId: selected.itemId,
              quantity: qtyNum,
              price: priceNum,
            }
          : { orderType: "buy", itemId: selected.itemId, price: priceNum },
      });
      const label = `${data.name ?? selected?.name ?? "角色"}${fragment ? "碎片" : ""}`;
      handleOpen(
        fragment
          ? `已發布收購單：${label} ${fmtStone(data.quantity ?? qtyNum)} 片，每片 ${fmtStone(data.price ?? priceNum)}，已預扣 ${fmtStone(data.total ?? total)} 女神石`
          : `已發布收購單：${label} ${fmtStone(data.price ?? priceNum)} 女神石（已預扣）`,
        "success"
      );
      refetchSummary();
      setTimeout(() => navigate("/trade/my-listings"), 1200);
    } catch (err) {
      const { title, detail } = errorInfo(err, "發布收購單失敗，請稍後再試", { fragment });
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
        ? fragment
          ? "沒有可收購的碎片"
          : "沒有可收購的角色"
        : fragment
          ? "點此選擇要收的碎片"
          : "點此選擇角色";

  // 碎片收購單可以指到已持有的角色，這時候要主動說明「這是正常的」，
  // 不然玩家會以為自己選錯了（角色收購單在同樣情境是被禁止的）。
  const selectedOwned = selected != null && ownedIds.has(String(selected.itemId));

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

      <Box sx={{ mb: 1.75 }}>
        <ItemKindSwitch value={itemKind} onChange={handleSwitchKind} disabled={creating} />
      </Box>

      {summaryLoading && !summary ? (
        <Skeleton variant="rounded" height={92} animation="wave" />
      ) : (
        <SummaryBanner
          balance={balance}
          openCount={openCount}
          maxOpen={maxOpen}
          capped={capped}
          reserve={total}
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
            {fragment
              ? "沒辦法載入角色清單，請稍後再試。"
              : "沒辦法確認你已經擁有哪些角色，先不開放發布，以免掛到已持有的角色。"}
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
            賣單和收購單合計算，角色與碎片也一起算。先去「我的掛單」取消一筆，或等現有的單成交，才能再掛新的。
          </Typography>
        </Alert>
      )}

      <Box sx={{ opacity: capped ? 0.55 : 1, pointerEvents: capped ? "none" : "auto" }}>
        <Label>想收購的{fragment ? "碎片" : "角色"}</Label>
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
                kind={itemKind}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                  {selected.name}
                  {fragment && (
                    <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
                      碎片
                    </Box>
                  )}
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
          {fragment
            ? "所有角色都能收，包含你已經擁有的。碎片沒有持有上限，可以一直累積。"
            : "只列出你還沒有的角色。角色一人一隻，已持有的收到也不會生效。"}
        </Typography>

        {fragment && selectedOwned && (
          <Alert severity="info" sx={{ borderRadius: 3, mt: 1.25 }}>
            你已經有 {selected.name} 了，但碎片照樣可以收 —— 收來的碎片能回收成女神石。
          </Alert>
        )}

        {!listLoading && !listBroken && candidates.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 3, mt: 1.25 }}>
            {fragment
              ? "目前沒有可以收購的角色碎片。"
              : "你已經蒐集完所有角色了，沒有可以收購的對象。"}
          </Alert>
        )}

        {fragment && (
          <>
            <Label>片數</Label>
            <TextField
              fullWidth
              id="buyQuantityInput"
              label="要收幾片"
              value={quantity}
              onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
              disabled={capped}
              color="secondary"
              error={quantity !== "" && !qtyValid}
              helperText={
                quantity !== "" && !qtyValid
                  ? `片數只能填 1 ～ ${fmtStone(QUANTITY_MAX)}`
                  : "賣方要一次湊足這個片數才能成交。"
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
            <Box
              role="group"
              aria-label="常用片數"
              sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.25 }}
            >
              {[10, 50, 100, 150].map(n => (
                <Chip
                  key={n}
                  label={n === 150 ? "150（可兌換）" : String(n)}
                  clickable
                  disabled={capped}
                  aria-pressed={String(n) === quantity}
                  onClick={() => setQuantity(String(n))}
                  variant={String(n) === quantity ? "filled" : "outlined"}
                  color={String(n) === quantity ? "secondary" : "default"}
                  sx={{ fontWeight: 600, ...NUMS }}
                />
              ))}
            </Box>
          </>
        )}

        <Label>{fragment ? "每片收購價" : "收購價"}</Label>
        <TextField
          fullWidth
          id="buyPriceInput"
          label={fragment ? "每片出價（女神石）" : "出價（女神石）"}
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={capped}
          color="secondary"
          error={(price !== "" && !priceValid) || short || totalOver}
          helperText={
            totalOver
              ? `總額超過上限 ${fmtStone(TOTAL_MAX)}，請調低單價或片數`
              : short
                ? `女神石不足，餘額 ${fmtStone(balance)}，還差 ${fmtStone(total - Number(balance))}`
                : fragment
                  ? "這是「每片」的價格。發布時會預扣單價 × 片數的總額。"
                  : "可填 1 ～ 10,000,000。發布時就會先預扣這個金額。"
          }
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 600 }}>
                    女神石{fragment ? " / 片" : ""}
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
          <BuyBreakdown
            price={priceValid ? priceNum : 0}
            quantity={qtyValid ? qtyNum : fragment ? 0 : 1}
            fragment={fragment}
          />
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
        title={fragment ? "選擇想收購的碎片" : "選擇想收購的角色"}
        kind={itemKind}
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
              {fragment && (
                <li>
                  每片 <strong>{fmtStone(priceValid ? priceNum : 0)}</strong> ×{" "}
                  <strong>{fmtStone(qtyValid ? qtyNum : 0)}</strong> 片 = 總額{" "}
                  <strong>{fmtStone(total)}</strong> 女神石。
                </li>
              )}
              <li>
                現在扣 <strong>{fmtStone(total)}</strong> 女神石，掛單期間這筆錢不能動用。
              </li>
              <li>取消或失效時，全額退還，不收任何費用。</li>
              <li>
                成交時賣家實收 <strong>{fmtStone(calcNet(total))}</strong>，手續費 5%（
                {fmtStone(calcFee(total))}）銷毀。
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
                kind={itemKind}
                size={38}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                  {selected.name}
                  {fragment && (
                    <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
                      碎片
                    </Box>
                  )}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
                  {selected.itemId}
                  {fragment && ` ・ 收 ${fmtStone(qtyValid ? qtyNum : 0)} 片`}
                </Typography>
              </Box>
            </Box>
          )}

          <BuyBreakdown
            price={priceValid ? priceNum : 0}
            quantity={qtyValid ? qtyNum : fragment ? 0 : 1}
            fragment={fragment}
          />

          {balanceKnown && total > 0 && (
            <Typography
              sx={{ mt: 1.25, fontSize: 11.5, color: "text.secondary", lineHeight: 1.6, ...NUMS }}
            >
              餘額 {fmtStone(balance)} → {fmtStone(Number(balance) - total)} 女神石。
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
