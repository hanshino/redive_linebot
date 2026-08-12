import { useEffect, useMemo } from "react";
import useAxios from "axios-hooks";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Paper, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ShoppingBasketRoundedIcon from "@mui/icons-material/ShoppingBasketRounded";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { STATUS } from "./_shared";
import {
  MAX_OPEN_FALLBACK,
  NUMS,
  calcNet,
  fmtShortDate,
  fmtShortDay,
  fmtStone,
  orderTypeOf,
} from "./_market";
import { CharAvatar, BaseStar, OrderTypeChip, SectionTitle, StatusChip } from "./_marketUi";

/* ---------------------------------------------------------------- 一列委託 */
function ListingItem({ listing, meta, note, strike }) {
  const orderType = orderTypeOf(listing);
  return (
    <Paper
      component={RouterLink}
      to={`/trade/listings/${listing.id}`}
      state={{ orderType }}
      elevation={0}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.375,
        p: 1.5,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <CharAvatar itemId={listing.itemId} name={listing.name} headImage={listing.headImage} />
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <OrderTypeChip orderType={orderType} />
          <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
            {listing.name}
          </Typography>
          <BaseStar star={listing.star} />
        </Box>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: "3px", ...NUMS }} noWrap>
          {meta}
        </Typography>
        {note && (
          <Typography sx={{ fontSize: 11.5, color: note.color, mt: "2px", ...NUMS }} noWrap>
            {note.text}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          textAlign: "right",
          flex: "0 0 auto",
          display: "grid",
          gap: 0.625,
          justifyItems: "end",
        }}
      >
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 700,
            textDecoration: strike ? "line-through" : "none",
            opacity: strike ? 0.6 : 1,
            ...NUMS,
          }}
        >
          {fmtStone(listing.price)}
        </Typography>
        <StatusChip status={listing.status} />
      </Box>
    </Paper>
  );
}

/* ---------------------------------------------------------------- 舊紀錄 */
function LegacyBlock({ trades, loading, error }) {
  return (
    <Box
      sx={theme => ({
        mt: 1.25,
        p: 1.5,
        borderRadius: 3,
        border: "1px dashed",
        borderColor: "divider",
        bgcolor: alpha(theme.palette.text.primary, 0.04),
        display: "flex",
        flexDirection: "column",
        gap: 1.125,
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography component="h3" sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>
          舊私人交易紀錄
        </Typography>
        <Box
          component="span"
          sx={{
            fontSize: 12,
            fontWeight: 600,
            px: 1.25,
            py: 0.25,
            borderRadius: 999,
            border: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          唯讀
        </Box>
      </Box>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.6 }}>
        舊的一對一私下交易已停用，這裡只保留過往紀錄，不能再新增或操作。
      </Typography>

      {error && (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          載入舊紀錄失敗，請稍後再試
        </Alert>
      )}

      {loading && !trades ? (
        [1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={56} animation="wave" />)
      ) : trades?.length ? (
        trades.map(t => (
          <Box
            key={t.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.375,
              p: 1.375,
              borderRadius: 3,
              border: "1px dashed",
              borderColor: "divider",
              opacity: 0.72,
            }}
          >
            <CharAvatar itemId={t.item_id} name={t.name || ""} headImage={t.image} size={34} />
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }} noWrap>
                {t.name || `商品 #${t.item_id}`}
              </Typography>
              <Typography
                sx={{ fontSize: 11.5, color: "text.secondary", mt: "2px", ...NUMS }}
                noWrap
              >
                {t.item_id} · {fmtShortDay(t.created_at)} ·{" "}
                {t.status === STATUS.COMPLETED
                  ? "已交易"
                  : t.status === STATUS.CANCELLED
                    ? "已取消"
                    : "未交易"}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.secondary", ...NUMS }}>
              {fmtStone(t.price)}
            </Typography>
          </Box>
        ))
      ) : (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>沒有舊的交易紀錄。</Typography>
      )}

      {trades?.length > 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
          共 {trades.length} 筆
        </Typography>
      )}
    </Box>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function MyListings() {
  const { loggedIn: isLoggedIn, profile } = useLiff();
  const navigate = useNavigate();
  const viewerId = profile?.userId;

  const [{ data: summary }, refetchSummary] = useAxios("/api/public-market/summary", {
    manual: true,
  });
  const [{ data: mine, loading, error }, refetchMine] = useAxios("/api/public-market/my-listings", {
    manual: true,
  });
  const [{ data: legacy, loading: legacyLoading, error: legacyError }, fetchLegacy] = useAxios(
    { url: "/api/trades", params: { page: 1, per_page: 20 } },
    { manual: true }
  );

  useEffect(() => {
    document.title = "我的掛單 / 紀錄";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary().catch(() => {});
    refetchMine().catch(() => {});
    fetchLegacy().catch(() => {});
  }, [isLoggedIn, refetchSummary, refetchMine, fetchLegacy]);

  const open = useMemo(() => (Array.isArray(mine?.open) ? mine.open : []), [mine]);
  const closed = useMemo(() => (Array.isArray(mine?.closed) ? mine.closed : []), [mine]);

  // 額度是兩種單合計。這裡自己數一次，數字才會跟上面那排 chip 對得起來。
  const openBuyCount = useMemo(() => open.filter(l => orderTypeOf(l) === "buy").length, [open]);
  const openSellCount = open.length - openBuyCount;
  // 收購單的錢現在被鎖住，放在最上面講清楚，不然餘額變少會讓人以為被偷。
  const reserved = useMemo(
    () => open.reduce((sum, l) => (orderTypeOf(l) === "buy" ? sum + Number(l.price || 0) : sum), 0),
    [open]
  );
  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }}>
            我的掛單 / 紀錄
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
            女神石餘額 {fmtStone(summary?.balance)}
            {reserved > 0 && ` ・ 收購單預扣中 ${fmtStone(reserved)}`}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1.25 }}>
        <Button
          variant="outlined"
          startIcon={<SellRoundedIcon />}
          onClick={() => navigate("/trade/sell")}
          sx={{ flex: "1 1 0" }}
        >
          新增賣單
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<ShoppingBasketRoundedIcon />}
          onClick={() => navigate("/trade/buy")}
          sx={{ flex: "1 1 0" }}
        >
          新增收購單
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          載入我的掛單失敗，請稍後再試
        </Alert>
      )}

      <SectionTitle>
        開放中 · {open.length} / {maxOpen}
      </SectionTitle>
      {!loading && open.length > 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mx: 0.25, mt: -0.75 }}>
          賣單 {openSellCount} 筆 ・ 收購單 {openBuyCount} 筆，兩種合計共用 {maxOpen} 筆額度。
        </Typography>
      )}
      {loading && !mine ? (
        [1, 2].map(i => <Skeleton key={i} variant="rounded" height={78} animation="wave" />)
      ) : open.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            目前沒有開放中的委託。
          </Typography>
          <Box
            sx={{ display: "flex", gap: 1.25, justifyContent: "center", mt: 1.5, flexWrap: "wrap" }}
          >
            <Button variant="outlined" onClick={() => navigate("/trade/sell")}>
              我要掛賣單
            </Button>
            <Button variant="outlined" color="secondary" onClick={() => navigate("/trade/buy")}>
              我要發收購單
            </Button>
          </Box>
        </Paper>
      ) : (
        open.map(l => {
          const buy = orderTypeOf(l) === "buy";
          return (
            <ListingItem
              key={l.id}
              listing={l}
              meta={`${l.itemId} · ${fmtShortDate(l.createdAt)}`}
              note={
                buy
                  ? { text: `已預扣 ${fmtStone(l.price)}，取消可全額退回`, color: "warning.main" }
                  : {
                      text: `成交可得 ${fmtStone(l.netProceeds ?? calcNet(l.price))}`,
                      color: "text.secondary",
                    }
              }
            />
          );
        })
      )}

      <SectionTitle>已結束 · {closed.length}</SectionTitle>
      {loading && !mine ? (
        [1, 2].map(i => <Skeleton key={i} variant="rounded" height={78} animation="wave" />)
      ) : closed.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary", mx: 0.25 }}>
          還沒有結束的委託。
        </Typography>
      ) : (
        closed.map(l => {
          const buy = orderTypeOf(l) === "buy";
          const sold = l.status === "sold";
          // 後端已標好 role；沒帶到時退回比對 sellerId。
          // 這一格決定畫面寫「買入」還是「賣出」，兩者的金流方向相反，不能猜錯。
          const bought = sold && (l.role ? l.role === "buyer" : l.sellerId !== viewerId);
          const net = fmtStone(l.netProceeds ?? calcNet(l.price));

          const meta = sold
            ? `${l.itemId} · ${fmtShortDate(l.soldAt)}`
            : `${l.itemId} · ${fmtShortDate(l.closedAt)} · ${
                l.status === "invalid" ? "已失效自動下架" : "自行取消"
              }`;

          const note = sold
            ? bought
              ? {
                  text: buy
                    ? `收購成交，支付 ${fmtStone(l.price)}`
                    : `買入，支付 ${fmtStone(l.price)}`,
                  color: "text.secondary",
                }
              : {
                  text: buy ? `履約賣出，實收 ${net}` : `賣出，實收 ${net}`,
                  color: "success.main",
                }
            : buy
              ? { text: `已退還 ${fmtStone(l.refundedAmount ?? l.price)}`, color: "success.main" }
              : null;

          return <ListingItem key={l.id} listing={l} meta={meta} note={note} strike={!sold} />;
        })
      )}

      <LegacyBlock trades={legacy} loading={legacyLoading} error={legacyError} />
    </Box>
  );
}
