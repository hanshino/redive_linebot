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
function SummaryBanner({ balance, openCount, maxOpen, capped, loading }) {
  return (
    <GradientPanel tone="sell">
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

      <Typography sx={{ fontSize: 11, opacity: 0.85, lineHeight: 1.6, mt: 1.25 }}>
        賣單與收購單合計上限 {maxOpen} 筆，角色與碎片共用同一份額度。
      </Typography>
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

/* ---------------------------------------------------------------- 費用明細 */
/**
 * 手續費與實收一律以**總額**為基準。
 *
 * 碎片單多一行「單價 × 片數」，把總額是怎麼來的寫出來 ——
 * 掛單填的是每片單價，但真正被抽 5% 的是總額，這兩個數字不能混。
 */
function FeeBreakdown({
  price,
  quantity = 1,
  fragment = false,
  feeLabel = "手續費（5%）",
  netLabel = "實收",
  showBurnNote,
}) {
  const total = price * quantity;
  const fee = calcFee(total);
  const net = calcNet(total);
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
      {fragment && (
        <>
          {line(
            "每片單價",
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
        fragment ? "總價（單價 × 片數）" : "售價",
        <Box component="b" sx={{ fontSize: fragment ? 17 : 15, fontWeight: 600, ...NUMS }}>
          {fmtStone(total)}
        </Box>
      )}
      {line(
        feeLabel,
        <Box component="b" sx={{ fontSize: 15, fontWeight: 600, color: "error.main", ...NUMS }}>
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
        <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 600 }}>
          {netLabel}
        </Typography>
        <Box component="b" sx={{ fontSize: 22, fontWeight: 600, color: "primary.main", ...NUMS }}>
          {fmtStone(net)}
        </Box>
      </Box>
      {showBurnNote && (
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
          手續費的女神石會直接銷毀，不會進到任何人的口袋。
        </Typography>
      )}
    </Box>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function Sell() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 種類存在網址裡，跟 Market 同一個 pattern：
  // 從碎片市場或碎片庫存頁按「掛賣」過來時直接落在正確的模式。
  const itemKind = normalizeItemKind(searchParams.get("itemKind"));
  const fragment = itemKind === "fragment";

  const [selectedId, setSelectedId] = useState(null);
  const [price, setPrice] = useState("1000");
  const [quantity, setQuantity] = useState("10");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [{ data: summary, loading: summaryLoading, error: summaryError }, refetchSummary] =
    useAxios("/api/public-market/summary", { manual: true });
  const [{ data: inventoryItems = [], loading: invLoading }, fetchItems] = useAxios(
    "/api/inventory",
    { manual: true }
  );
  const [{ data: fragData, loading: fragLoading, error: fragError }, fetchFragments] = useAxios(
    "/api/character-fragments",
    { manual: true }
  );
  const [{ loading: creating }, createListing] = useAxios(
    { url: "/api/public-market/listings", method: "POST" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = fragment ? "掛碎片賣單" : "掛賣單";
  }, [fragment]);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary();
    fetchItems();
  }, [isLoggedIn, refetchSummary, fetchItems]);

  useEffect(() => {
    if (!isLoggedIn || !fragment) return;
    fetchFragments().catch(() => {});
  }, [isLoggedIn, fragment, fetchFragments]);

  // 石頭本身是背包裡的 itemId 999，不是可以掛賣的角色。
  const characters = useMemo(
    () => (Array.isArray(inventoryItems) ? inventoryItems : []).filter(i => i.itemId !== 999),
    [inventoryItems]
  );

  // 碎片清單：後端已經只回 amount > 0，這裡再擋一次，因為 picker 顯示的是「可掛賣的」。
  const fragments = useMemo(
    () =>
      (Array.isArray(fragData?.fragments) ? fragData.fragments : []).filter(
        f => Number(f.amount) > 0
      ),
    [fragData]
  );

  // 兩種標的的候選清單長得一樣（都有 itemId / name / headImage），所以 picker 共用。
  const candidates = fragment ? fragments : characters;

  const selected = useMemo(
    () => candidates.find(c => c.itemId === selectedId) || null,
    [candidates, selectedId]
  );

  // 換種類時把選擇清掉：兩邊的 itemId 空間重疊，留著會指到另一種標的上。
  const handleSwitchKind = next => {
    if (next === itemKind) return;
    setSelectedId(null);
    const params = {};
    if (next === "fragment") params.itemKind = "fragment";
    setSearchParams(params, { replace: true });
  };

  // 網址帶 itemId 進來（從碎片庫存頁的「掛賣」按鈕）時自動選好，省一次點擊。
  const queryItemId = searchParams.get("itemId");
  useEffect(() => {
    if (!queryItemId || selectedId != null) return;
    const hit = candidates.find(c => String(c.itemId) === queryItemId);
    if (hit) setSelectedId(hit.itemId);
  }, [queryItemId, selectedId, candidates]);

  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;
  const openCount = summary?.myOpenCount ?? 0;
  const capped = !summaryLoading && !summaryError && openCount >= maxOpen;

  const priceNum = Number(price);
  const priceValid = Number.isInteger(priceNum) && priceNum >= PRICE_MIN && priceNum <= PRICE_MAX;

  // 角色的 quantity 恆為 1，連輸入框都不出現（後端也會擋 quantity !== 1）。
  const qtyNum = fragment ? Number(quantity) : 1;
  const held = fragment ? Number(selected?.amount ?? 0) : 1;
  // 前端用「當下持有片數」提示上限，但這只是提示 —— 成交時後端會重驗，
  // 因為碎片賣單不 escrow，掛單後這個數字還可能被回收或兌換掉。
  const qtyInRange = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= QUANTITY_MAX;
  const qtyOverHeld = fragment && selected != null && qtyInRange && qtyNum > held;
  const qtyValid = qtyInRange && !qtyOverHeld;

  const total = priceValid && qtyValid ? priceNum * qtyNum : 0;
  const totalOver = priceValid && qtyInRange && priceNum * qtyNum > TOTAL_MAX;

  const submittable =
    !capped && selectedId != null && priceValid && qtyValid && !totalOver && !creating;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    try {
      // 送出去的 price 是**每片單價**，不是總價。後端自己乘 quantity。
      const { data } = await createListing({
        data: fragment
          ? {
              orderType: "sell",
              itemKind: "fragment",
              itemId: selectedId,
              quantity: qtyNum,
              price: priceNum,
            }
          : { itemId: selectedId, price: priceNum },
      });
      const label = `${data.name ?? selected?.name ?? "角色"}${fragment ? "碎片" : ""}`;
      handleOpen(
        fragment
          ? `已建立委託：${label} ${fmtStone(data.quantity ?? qtyNum)} 片，每片 ${fmtStone(data.price ?? priceNum)}，總價 ${fmtStone(data.total ?? total)} 女神石`
          : `已建立委託：${label} ${fmtStone(data.price ?? priceNum)} 女神石`,
        "success"
      );
      refetchSummary();
      setTimeout(() => navigate("/trade/my-listings"), 1200);
    } catch (err) {
      const { title, detail } = errorInfo(err, "掛單失敗，請稍後再試", { fragment });
      handleOpen(detail ? `${title}，${detail}` : title, "error");
      refetchSummary();
      if (fragment) fetchFragments().catch(() => {});
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  const listLoading = fragment ? fragLoading : invLoading;
  const pickerHint = listLoading
    ? fragment
      ? "載入碎片庫存中…"
      : "載入背包中…"
    : fragment && fragError
      ? "碎片庫存載入失敗"
      : candidates.length === 0
        ? fragment
          ? "你目前沒有任何碎片"
          : "沒有可掛賣的角色"
        : fragment
          ? "點此選擇碎片"
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
          掛賣單
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
          balance={summary?.balance}
          openCount={openCount}
          maxOpen={maxOpen}
          capped={capped}
          loading={summaryLoading && !summary}
        />
      )}

      {summaryError && (
        <Alert severity="error" sx={{ borderRadius: 3, mt: 1.75 }}>
          載入掛單狀態失敗，請稍後再試
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

      {fragment && fragError && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3, mt: 1.75 }}
          action={
            <Button color="inherit" size="small" onClick={() => fetchFragments().catch(() => {})}>
              重試
            </Button>
          }
        >
          讀不到你的碎片庫存，請稍後再試
        </Alert>
      )}

      <Box sx={{ opacity: capped ? 0.55 : 1, pointerEvents: capped ? "none" : "auto" }}>
        <Label>要賣的{fragment ? "碎片" : "角色"}</Label>
        <Paper
          component="button"
          type="button"
          elevation={0}
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-disabled={capped || undefined}
          disabled={capped || listLoading || candidates.length === 0}
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
                  {fragment && ` ・ 持有 ${fmtStone(held)} 片`}
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

        {fragment && !listLoading && !fragError && candidates.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 3, mt: 1.25 }}>
            你目前沒有任何碎片。抽到已持有的角色時就會拿到該角色的碎片。
          </Alert>
        )}

        {fragment && (
          <>
            <Label>片數</Label>
            <TextField
              fullWidth
              id="quantityInput"
              label="要賣幾片"
              value={quantity}
              onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
              disabled={capped}
              error={quantity !== "" && !qtyValid}
              helperText={
                qtyOverHeld
                  ? `你目前只有 ${fmtStone(held)} 片`
                  : quantity !== "" && !qtyInRange
                    ? `片數只能填 1 ～ ${fmtStone(QUANTITY_MAX)}`
                    : selected
                      ? `持有 ${fmtStone(held)} 片。掛單期間碎片仍可回收或兌換，成交時片數不足這筆單會失效。`
                      : "先選一個角色的碎片"
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
            {selected && held > 0 && (
              <Box
                role="group"
                aria-label="常用片數"
                sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.25 }}
              >
                {[10, 50, 100].map(n =>
                  n <= held ? (
                    <Chip
                      key={n}
                      label={String(n)}
                      clickable
                      disabled={capped}
                      aria-pressed={String(n) === quantity}
                      onClick={() => setQuantity(String(n))}
                      variant={String(n) === quantity ? "filled" : "outlined"}
                      color={String(n) === quantity ? "secondary" : "default"}
                      sx={{ fontWeight: 600, ...NUMS }}
                    />
                  ) : null
                )}
                <Chip
                  label={`全部 ${fmtStone(held)}`}
                  clickable
                  disabled={capped}
                  aria-pressed={String(held) === quantity}
                  onClick={() => setQuantity(String(held))}
                  variant={String(held) === quantity ? "filled" : "outlined"}
                  color={String(held) === quantity ? "secondary" : "default"}
                  sx={{ fontWeight: 600, ...NUMS }}
                />
              </Box>
            )}
          </>
        )}

        <Label>{fragment ? "每片售價" : "售價"}</Label>
        <TextField
          fullWidth
          id="priceInput"
          label={fragment ? "每片單價（女神石）" : "單價（女神石）"}
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={capped}
          error={(price !== "" && !priceValid) || totalOver}
          helperText={
            totalOver
              ? `總價超過上限 ${fmtStone(TOTAL_MAX)}，請調低單價或片數`
              : fragment
                ? "這是「每片」的價格，買家付的是單價 × 片數。可填 1 ～ 10,000,000。"
                : "可填 1 ～ 10,000,000。買家付的就是這個價。"
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

            htmlInput: { inputMode: "numeric", pattern: "[0-9]*", "aria-describedby": "priceHelp" },
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
              color={String(p) === price ? "primary" : "default"}
              sx={{ fontWeight: 600, ...NUMS }}
            />
          ))}
        </Box>

        <Label>成交後的金額</Label>
        <Paper
          elevation={0}
          sx={{ px: 1.75, py: 1.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
        >
          <FeeBreakdown
            price={priceValid ? priceNum : 0}
            quantity={qtyValid ? qtyNum : fragment ? 0 : 1}
            fragment={fragment}
            showBurnNote
          />
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
          送出掛單
        </Button>
      )}

      <CharacterPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={candidates}
        initialId={selectedId}
        onConfirm={id => setSelectedId(id)}
        title={fragment ? "選擇要賣的碎片" : "選擇角色"}
        kind={itemKind}
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="sell-confirm-title"
      >
        <DialogTitle id="sell-confirm-title" sx={{ fontWeight: 600 }}>
          確認掛單？
        </DialogTitle>
        <DialogContent>
          {/* 兩種標的的警語完全不同：
              角色是「升星不轉移」，碎片是「掛單不鎖庫存，可能自己把庫存花掉」。
              把角色那段套到碎片上會讓人以為碎片也有星等，是錯的。 */}
          {fragment ? (
            <Alert severity="info" sx={{ borderRadius: 3, mb: 1.5 }}>
              <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>
                掛單期間碎片不會被鎖住
              </AlertTitle>
              <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
                碎片還是可以拿去回收或兌換。但成交當下片數不足的話，這筆單會直接
                <strong>失效下架</strong>，買家不會被扣款。
              </Typography>
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: 3, mb: 1.5 }}>
              <AlertTitle sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>
                你的升星強化不會轉移
              </AlertTitle>
              <Typography sx={{ fontSize: 12, lineHeight: 1.7, color: "text.secondary" }}>
                賣掉後，買家拿到的是<strong>初始星數</strong>
                的角色。你之前用女神石升上去的星等會直接消失，也不會退錢。
              </Typography>
            </Alert>
          )}

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
                  {fragment && ` ・ 賣 ${fmtStone(qtyNum)} / ${fmtStone(held)} 片`}
                </Typography>
              </Box>
            </Box>
          )}

          <FeeBreakdown
            price={priceValid ? priceNum : 0}
            quantity={qtyValid ? qtyNum : fragment ? 0 : 1}
            fragment={fragment}
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
