import { useEffect, useMemo } from "react";
import useAxios from "axios-hooks";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { Box, Button, Paper, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ShoppingBasketRoundedIcon from "@mui/icons-material/ShoppingBasketRounded";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import useLiff from "../../context/useLiff";
import { STATUS } from "./_shared";
import {
  META_TEXT,
  MAX_OPEN_FALLBACK,
  NUMS,
  TAP_TARGETS,
  PAGE_WIDTH,
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
        <Typography sx={{ ...META_TEXT, mt: "3px" }} noWrap>
          {meta}
        </Typography>
        {note && (
          <Typography sx={{ ...META_TEXT, color: note.color, mt: "2px" }} noWrap>
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
// 只在有舊紀錄、或讀取失敗時才會渲染（沒有舊紀錄的人不需要看到已停用功能的空殼）。
function LegacyBlock({ trades, error, onRetry }) {
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

      {error ? (
        // 讀取失敗不能寫成「沒有舊的交易紀錄」，那是另一件事。
        <LoadError
          sx={{ py: 0 }}
          message="載入舊紀錄失敗，請檢查網路後再試一次。"
          onRetry={onRetry}
        />
      ) : (
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
              <Typography sx={{ ...META_TEXT, mt: "2px" }} noWrap>
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
  const [{ data: legacy, error: legacyError }, fetchLegacy] = useAxios(
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

  // 收購單的錢現在被鎖住，放在最上面講清楚，不然餘額變少會讓人以為被偷。
  const reserved = useMemo(
    () => open.reduce((sum, l) => (orderTypeOf(l) === "buy" ? sum + Number(l.price || 0) : sum), 0),
    [open]
  );
  const maxOpen = summary?.maxOpen ?? MAX_OPEN_FALLBACK;
  // 只有「讀取失敗且手上沒有舊資料」才算失敗；背景重抓失敗時舊資料還是真的。
  const loadFailed = Boolean(error) && !mine;

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
        ...TAP_TARGETS,
        ...PAGE_WIDTH,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
            我的掛單 / 紀錄
          </Typography>
          <Typography sx={META_TEXT}>
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

      {/* 讀取失敗時整段清單都不能顯示：空陣列會被畫成「目前沒有開放中的委託」，
          玩家會以為掛單不見了。 */}
      {loadFailed && (
        <LoadError
          sx={{ py: 0 }}
          message="載入我的掛單失敗，現在看不到你的委託。請檢查網路後再試一次。"
          onRetry={() => refetchMine().catch(() => {})}
        />
      )}

      <SectionTitle>{loadFailed ? "開放中" : `開放中 · ${open.length} / ${maxOpen}`}</SectionTitle>
      {loading && !mine ? (
        [1, 2].map(i => <Skeleton key={i} variant="rounded" height={78} animation="wave" />)
      ) : loadFailed ? null : open.length === 0 ? (
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
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            目前沒有開放中的委託。
          </Typography>
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

      <SectionTitle>{loadFailed ? "已結束" : `已結束 · ${closed.length}`}</SectionTitle>
      {loading && !mine ? (
        [1, 2].map(i => <Skeleton key={i} variant="rounded" height={78} animation="wave" />)
      ) : loadFailed ? null : closed.length === 0 ? (
        <Typography sx={{ ...META_TEXT, mx: 0.25 }}>還沒有結束的委託。</Typography>
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

      {(legacyError || legacy?.length > 0) && (
        <LegacyBlock
          trades={legacy}
          error={legacyError}
          onRetry={() => fetchLegacy().catch(() => {})}
        />
      )}
    </Box>
  );
}
