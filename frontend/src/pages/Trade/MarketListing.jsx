import { useCallback, useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import {
  NUMS,
  ORDER_COPY,
  calcFee,
  calcNet,
  displayName,
  errorInfo,
  fmtShortDate,
  fmtStone,
  isFragment as isFragmentListing,
  itemKindOf,
  itemLabel,
  nativeStarOf,
  normalizeItemKind,
  orderTypeOf,
  posterNameOf,
  quantityOf,
  totalOf,
} from "./_market";
import {
  CharAvatar,
  BaseStarBadge,
  GradientPanel,
  ItemKindChip,
  OrderTypeChip,
  QuantityBadge,
  Row,
  SectionTitle,
  StatusChip,
  Tag,
} from "./_marketUi";

/* ---------------------------------------------------------------- 零件 */
function PageSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={180} animation="wave" />
      <Skeleton variant="rounded" height={120} animation="wave" />
      <Skeleton variant="rounded" height={48} animation="wave" />
    </Box>
  );
}

function Card({ children, sx }) {
  return (
    <Paper
      elevation={0}
      sx={{ p: 1.75, borderRadius: 3, border: "1px solid", borderColor: "divider", ...sx }}
    >
      {children}
    </Paper>
  );
}

/**
 * 回市場一律帶著角色「和方向、和種類」，讓人回到剛才在看的那一本簿子。
 * 少帶 orderType 的話，從收購簿點進來的人會被丟回賣單簿，看到完全不同的價格；
 * 少帶 itemKind 則會從碎片簿掉回角色簿，價格數量級差 100 倍以上。
 */
const marketPathFor = (listing, orderType, itemKind) => {
  const params = new URLSearchParams();
  if (orderType === "buy") params.set("orderType", "buy");
  if (normalizeItemKind(itemKind) === "fragment") params.set("itemKind", "fragment");
  if (listing?.itemId != null) params.set("characterId", String(listing.itemId));
  const qs = params.toString();
  return qs ? `/trade/market?${qs}` : "/trade/market";
};

function AppHeader({ listing, orderType, orderNo, mineLabel, onBack, onRefresh, refreshing }) {
  const noun = ORDER_COPY[orderType].noun;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 0.5 }}>
      <IconButton
        aria-label={listing?.name ? `返回${listing.name}的${noun}列表` : "返回市場列表"}
        size="small"
        onClick={onBack}
      >
        <ArrowBackIosNewIcon fontSize="small" />
      </IconButton>
      <Box>
        <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }}>委託詳情</Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
          {orderNo}
          {mineLabel ? ` · ${mineLabel}` : ""}
        </Typography>
      </Box>
      <Box sx={{ flex: "1 1 auto" }} />
      <IconButton aria-label="重新整理" size="small" onClick={onRefresh} disabled={refreshing}>
        <RefreshIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

/**
 * 開放中用漸層 banner；終態 / 失效用平的卡片，跟設計稿一致。
 *
 * 碎片單的大數字是**總價**，底下補一行「每片 × 片數」。
 * 這一頁是掏錢的地方，主數字寫成單價會直接造成付錯錢。
 */
function HeroBanner({ listing, orderType, kicker }) {
  const kind = itemKindOf(listing);
  const fragment = isFragmentListing(listing);
  const quantity = quantityOf(listing);
  const total = totalOf(listing);

  return (
    <GradientPanel tone={orderType}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CharAvatar
          itemId={listing.itemId}
          name={listing.name}
          headImage={listing.headImage}
          kind={kind}
          size={62}
        />
        <Box>
          <Typography sx={{ fontSize: 11, letterSpacing: "1.4px", opacity: 0.82 }}>
            {kicker}
          </Typography>
          <Typography sx={{ fontSize: 21, fontWeight: 700, lineHeight: 1.2, mt: "2px" }}>
            {itemLabel(listing)}
          </Typography>
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.875, mt: "3px", flexWrap: "wrap" }}
          >
            <Typography sx={{ fontSize: 11.5, opacity: 0.82, ...NUMS }}>
              ID {listing.itemId}
            </Typography>
            {/* 碎片讀 baseStar、角色讀 star，而且 badge 的字也不同。 */}
            <BaseStarBadge star={nativeStarOf(listing)} kind={kind} onGradient />
          </Box>
        </Box>
      </Box>
      <Box sx={{ mt: 1.75, display: "flex", alignItems: "baseline", gap: 0.875, flexWrap: "wrap" }}>
        <Box component="b" sx={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.5px", ...NUMS }}>
          {fmtStone(total)}
        </Box>
        <Box component="span" sx={{ fontSize: 13, opacity: 0.9 }}>
          女神石{fragment ? "（總價）" : ""}
        </Box>
      </Box>
      {fragment && (
        <Typography sx={{ fontSize: 12, opacity: 0.9, mt: "2px", ...NUMS }}>
          每片 {fmtStone(listing.price)} × {fmtStone(quantity)} 片
        </Typography>
      )}
    </GradientPanel>
  );
}

function HeroFlat({ listing, orderType, status, dimmed }) {
  const kind = itemKindOf(listing);
  const fragment = isFragmentListing(listing);

  return (
    <Card sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
      <CharAvatar
        itemId={listing.itemId}
        name={listing.name}
        headImage={listing.headImage}
        kind={kind}
        size={62}
        dimmed={dimmed}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 19, fontWeight: 700 }} noWrap>
          {itemLabel(listing)}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
          ID {listing.itemId}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.875, flexWrap: "wrap" }}>
          <StatusChip status={status} />
          <OrderTypeChip orderType={orderType} />
          {fragment && <ItemKindChip itemKind={kind} />}
          {fragment && <QuantityBadge quantity={quantityOf(listing)} />}
          <BaseStarBadge star={nativeStarOf(listing)} kind={kind} />
        </Box>
      </Box>
    </Card>
  );
}

function WalletStrip({ balance, short }) {
  return (
    <Card
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        fontSize: 13,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 24,
          height: 24,
          borderRadius: "6px",
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          background: "linear-gradient(140deg, #FBBF24, #F59E0B)",
        }}
      >
        石
      </Box>
      <Typography component="span" sx={{ fontSize: 13 }}>
        你的女神石餘額
      </Typography>
      <Typography
        component="span"
        sx={{ ml: "auto", fontWeight: 700, color: short ? "error.main" : "text.primary", ...NUMS }}
      >
        {fmtStone(balance)}
      </Typography>
    </Card>
  );
}

function BtnNote({ children }) {
  return (
    <Typography
      sx={{ fontSize: 11.5, color: "text.secondary", textAlign: "center", lineHeight: 1.5 }}
    >
      {children}
    </Typography>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function MarketListing() {
  const { loggedIn: isLoggedIn, profile } = useLiff();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = profile?.userId;

  // 從市場點進來的話，上一頁就是那本簿子：直接退回去，history 不會多長一節，
  // 不然「頁內返回 push 市場 → 瀏覽器上一頁又回到詳情」會變成一個轉不出去的圈。
  // 直接開連結（LIFF 分享、書籤）沒有這個標記，改用 replace 導向帶角色+方向的市場，
  // 同樣不會留下能退回本頁的紀錄。不看 history.length，那個值猜不準。
  const fromMarket = Boolean(location.state?.fromMarket);

  // 操作失敗回來的終態：把畫面原地降級，不重新導頁。
  const [deadCode, setDeadCode] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 收購單成交／取消時退回去的金額，後端會回 refundedAmount，用來寫實際數字。
  const [refunded, setRefunded] = useState(null);

  const [{ data: listing, loading, error }, refetch] = useAxios(
    `/api/public-market/listings/${id}`,
    { manual: true }
  );
  const [{ loading: buying }, purchase] = useAxios(
    { url: `/api/public-market/listings/${id}/purchase`, method: "POST" },
    { manual: true }
  );
  const [{ loading: fulfilling }, fulfill] = useAxios(
    { url: `/api/public-market/listings/${id}/fulfill`, method: "POST" },
    { manual: true }
  );
  const [{ loading: cancelling }, cancelListing] = useAxios(
    { url: `/api/public-market/listings/${id}`, method: "DELETE" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "委託詳情";
  }, []);

  useEffect(() => {
    if (isLoggedIn) refetch().catch(() => {});
  }, [isLoggedIn, refetch]);

  const orderNo = useMemo(() => `#EX-${id}`, [id]);

  // 方向與種類優先看資料本身；資料還沒到就先用進來時帶的 state，
  // 免得返回鍵在載入中把人送回錯的一本簿子。
  const orderType = listing ? orderTypeOf(listing) : (location.state?.orderType ?? "sell");
  const buyOrder = orderType === "buy";
  const copy = ORDER_COPY[orderType];
  const itemKind = listing
    ? itemKindOf(listing)
    : normalizeItemKind(location.state?.itemKind ?? "character");
  const fragment = itemKind === "fragment";
  // 「這個標的」在文案裡怎麼稱呼。碎片一定要帶「碎片」兩個字，
  // 不然「賣出後角色離開你的box」會套到碎片上。
  const thing = fragment ? "碎片" : "角色";

  // 這頁所有語義上「回市場」的按鈕都走這裡，行為才會一致。
  const backToMarket = useCallback(() => {
    if (fromMarket) navigate(-1);
    else navigate(marketPathFor(listing, orderType, itemKind), { replace: true });
  }, [fromMarket, navigate, listing, orderType, itemKind]);

  const handleBuy = async () => {
    setConfirmOpen(false);
    try {
      const { data } = await purchase();
      // 花掉的是總額，不是單價。
      const paid = Number(data.total) > 0 ? Number(data.total) : Number(data.price);
      const amount = data.itemKind === "fragment" ? ` ${fmtStone(data.quantity)} 片` : "";
      handleOpen(
        `已購買 ${data.name}${data.itemKind === "fragment" ? "碎片" : ""}${amount}，花費 ${fmtStone(paid)} 女神石`,
        "success"
      );
      refetch().catch(() => {});
    } catch (err) {
      const { code, title, detail, data } = errorInfo(err, "購買失敗，請稍後再試", { fragment });
      if (
        code === "ALREADY_TAKEN" ||
        code === "SELLER_LOST_ITEM" ||
        code === "SELLER_LOST_FRAGMENTS"
      ) {
        // 原地降級：畫面直接改為失效狀態，並跳提示。
        setDeadCode(code);
      }
      if (code === "INSUFFICIENT_FUNDS" && data) {
        handleOpen(
          `${title}｜餘額 ${fmtStone(data.balance)} / 需要 ${fmtStone(data.price)} / 還差 ${fmtStone(data.shortfall)}`,
          "error"
        );
      } else {
        handleOpen(detail ? `${title}，${detail}` : title, "error");
      }
      refetch().catch(() => {});
    }
  };

  const handleFulfill = async () => {
    setConfirmOpen(false);
    try {
      const { data } = await fulfill();
      const dealTotal =
        Number(data.total) > 0 ? Number(data.total) : totalOf(listing ?? { price: 0 });
      const amount = data.itemKind === "fragment" ? ` ${fmtStone(data.quantity)} 片` : "";
      handleOpen(
        `已賣出 ${data.name ?? listing?.name}${data.itemKind === "fragment" ? "碎片" : ""}${amount}，實收 ${fmtStone(data.netProceeds ?? calcNet(dealTotal))} 女神石`,
        "success"
      );
      refetch().catch(() => {});
    } catch (err) {
      const { code, title, detail, data } = errorInfo(err, "賣出失敗，請稍後再試", { fragment });
      // 收購方在這段時間內自己取得了角色：單子作廢、預扣退還給對方，
      // 這時候畫面要直接變成失效，不能還留一顆「賣給他」。
      if (code === "ALREADY_TAKEN" || code === "ALREADY_OWNED_REQUESTER" || code === "NOT_OPEN") {
        setDeadCode(code);
        if (data?.refundedAmount != null) setRefunded(data.refundedAmount);
      }
      // 碎片不足時掛單「保持 open」——後端刻意不下架，所以這裡不能設 deadCode，
      // 玩家補足碎片後還能回來賣。
      if (code === "INSUFFICIENT_FRAGMENTS" && data) {
        handleOpen(
          `${title}｜你有 ${fmtStone(data.balance)} 片 / 需要 ${fmtStone(data.required)} 片 / 還差 ${fmtStone(data.shortfall)} 片`,
          "error"
        );
      } else {
        handleOpen(detail ? `${title}，${detail}` : title, "error");
      }
      refetch().catch(() => {});
    }
  };

  const handleCancel = async () => {
    try {
      const { data } = await cancelListing();
      // 收購單取消要退錢，金額用後端回的為準；沒回就退回總額。
      if (buyOrder) {
        const amount = data?.refundedAmount ?? totalOf(listing ?? {});
        setRefunded(amount);
        handleOpen(`已取消收購單，${fmtStone(amount)} 女神石已全額退還`, "success");
      } else {
        handleOpen(`已取消${fragment ? "碎片" : ""}掛單`, "success");
      }
      refetch().catch(() => {});
    } catch (err) {
      const { title, detail } = errorInfo(err, "取消失敗，請稍後再試", { fragment });
      handleOpen(detail ? `${title}，${detail}` : title, "error");
    }
  };

  if (!isLoggedIn) return <AlertLogin />;
  if (loading && !listing) return <PageSkeleton />;

  if (error && !listing) {
    const status = error.response?.status;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          {status === 404 ? "找不到這筆委託" : "載入委託失敗，請稍後再試"}
        </Alert>
        {/* listing 沒載到，不知道是哪隻角色；從市場來就退回去，直接開連結則回市場首頁。 */}
        <Button variant="outlined" onClick={backToMarket}>
          回列表
        </Button>
      </Box>
    );
  }

  if (!listing) return <PageSkeleton />;

  const viewer = listing.viewer || {};
  // 金額一律以總額為基準：碎片單 total = 每片單價 × 片數。
  // 手續費、實收、差額、餘額變化都算在 total 上，不能拿 price 去算。
  const quantity = quantityOf(listing);
  const total = totalOf(listing);
  const fee = listing.fee ?? calcFee(total);
  const net = listing.netProceeds ?? calcNet(total);
  const balance = viewer.balance ?? 0;
  const shortfall = Math.max(0, total - balance);
  // 碎片單才有的欄位：我手上有幾片。角色單不會回這個。
  const myFragments = Number(viewer.fragmentBalance ?? 0);
  const fragmentsKnown = fragment && viewer.fragmentBalance != null;

  // 收購單的「掛單者」是買家。後端會帶 isRequester，沒帶時退回比對 isBuyer / buyerId。
  const isRequester = buyOrder
    ? Boolean(
        viewer.isRequester ?? viewer.isBuyer ?? (viewerId != null && listing.buyerId === viewerId)
      )
    : false;
  const mineLabel = buyOrder
    ? isRequester
      ? "我的收購單"
      : ""
    : viewer.isSeller
      ? "我的掛單"
      : "";
  const posterName = displayName(posterNameOf(listing));
  const refundAmount = refunded ?? listing.refundedAmount ?? total;

  // 顯示狀態：本地失效碼優先，再看後端 status。
  const dead = Boolean(deadCode) || listing.status === "invalid";
  const shownStatus = deadCode ? "invalid" : listing.status;

  const wrap = children => (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <AppHeader
        listing={listing}
        orderType={orderType}
        orderNo={orderNo}
        mineLabel={mineLabel}
        onBack={backToMarket}
        onRefresh={() => {
          setDeadCode(null);
          setRefunded(null);
          refetch().catch(() => {});
        }}
        refreshing={loading}
      />
      {children}
      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );

  /* ---- 失效（兩種方向共用） ------------------------------------------- */
  if (dead) {
    // 收購單失效只有一種常見成因：收購方自己拿到角色了，錢已全額退回給他。
    // 碎片收購單不會因為「已持有」失效（碎片可累積），所以那句話只給角色單。
    const requesterGotIt =
      deadCode === "ALREADY_OWNED_REQUESTER" ||
      (buyOrder && !fragment && listing.status === "invalid");
    // 賣單失效：角色是「賣家沒有這隻角色了」，碎片是「賣家碎片不夠了」。
    const isLostItem =
      !buyOrder &&
      (deadCode === "SELLER_LOST_ITEM" ||
        deadCode === "SELLER_LOST_FRAGMENTS" ||
        listing.status === "invalid");

    return wrap(
      <>
        <HeroFlat listing={listing} orderType={orderType} status="invalid" dimmed />

        <Alert severity="error" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            {buyOrder
              ? requesterGotIt
                ? "收購方已取得此角色，收購單已失效"
                : `此收購單已被其他玩家接走或取消`
              : isLostItem
                ? fragment
                  ? "賣家的碎片已不足，委託已失效"
                  : "賣家已無此角色，委託已失效"
                : "此委託已被其他玩家買走或取消"}
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            {buyOrder
              ? isRequester
                ? `系統已自動下架，預扣的 ${fmtStone(refundAmount)} 女神石已全額退還給你。`
                : `你的${thing}沒有被扣走，也沒有任何女神石異動。`
              : isLostItem
                ? fragment
                  ? "賣家在成交前把碎片回收或兌換掉了。系統已自動下架這筆委託，你沒有被扣款。"
                  : "系統已自動下架這筆委託，沒有任何女神石異動。"
                : "你的女神石沒有被扣款。"}
          </Typography>
        </Alert>

        <Card>
          {fragment ? (
            <>
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
              <Row
                label={buyOrder ? "每片收購價" : "每片掛單價"}
                value={`${fmtStone(listing.price)} 女神石`}
              />
              <Row label="總價" value={`${fmtStone(total)} 女神石`} strike />
            </>
          ) : (
            <Row
              label={buyOrder ? "收購價" : "掛單價"}
              value={`${fmtStone(total)} 女神石`}
              strike
            />
          )}
          <Row label={copy.poster} value={posterName} />
          {(isLostItem || requesterGotIt) && (
            <Row label="失效時間" value={fmtShortDate(listing.closedAt)} />
          )}
          {buyOrder && isRequester ? (
            <Row
              label="已退還"
              value={`${fmtStone(refundAmount)} 女神石`}
              valueColor="success.main"
            />
          ) : (
            <Row label="你的餘額" value={`${fmtStone(balance)}（未變動）`} />
          )}
        </Card>

        <Button variant="contained" color={buyOrder ? "secondary" : "primary"} disabled>
          {buyOrder ? "收購單已失效" : isLostItem ? "委託已失效" : "立即購買"}
        </Button>
        <BtnNote>此委託已結束，沒有可用的操作</BtnNote>
        <Button variant="outlined" onClick={backToMarket}>
          看其他{itemLabel(listing)}的{copy.noun}
        </Button>
        {(isLostItem || requesterGotIt) && (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.6, mx: 0.25 }}>
            若你認為這是異常，請在群組輸入「客服」回報單號 {orderNo}。
          </Typography>
        )}
      </>
    );
  }

  /* ---- 已成交（終態） -------------------------------------------------- */
  if (shownStatus === "sold") {
    const iAmBuyer = viewerId != null && listing.buyerId === viewerId;
    const iAmSeller = viewerId != null && listing.sellerId === viewerId;

    return wrap(
      <>
        <HeroFlat listing={listing} orderType={orderType} status="sold" />

        <Card>
          {fragment && (
            <>
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
              <Row label="每片成交價" value={`${fmtStone(listing.price)} 女神石`} />
            </>
          )}
          <Row label={fragment ? "成交總額" : "成交價"} value={`${fmtStone(total)} 女神石`} />
          <Row label="手續費 5%（已銷毀）" value={fmtStone(fee)} valueColor="text.secondary" />
          <Row label="賣家實收" value={fmtStone(net)} />
        </Card>

        <Card>
          <Row label="賣家" value={iAmSeller ? "你" : displayName(listing.sellerName)} />
          <Row label="買家" value={iAmBuyer ? "你" : displayName(listing.buyerName)} />
          <Row label="成交時間" value={fmtShortDate(listing.soldAt)} />
        </Card>

        <Alert severity="info" icon={false} sx={{ borderRadius: 3 }}>
          {iAmSeller
            ? `${thing}已交付買家，你已收到 ${fmtStone(net)} 女神石。`
            : fragment
              ? `碎片已進入你的碎片庫存，共 ${fmtStone(quantity)} 片。`
              : "角色已入庫，星數為初始值。"}
          這筆委託已結束，沒有可用的操作。
        </Alert>
        {fragment && iAmBuyer && (
          <Button variant="outlined" color="secondary" onClick={() => navigate("/gacha/fragments")}>
            看我的碎片庫存
          </Button>
        )}
        <BtnNote>紀錄保留 90 天</BtnNote>
      </>
    );
  }

  /* ---- 已取消（終態） -------------------------------------------------- */
  if (shownStatus === "cancelled") {
    return wrap(
      <>
        <HeroFlat listing={listing} orderType={orderType} status="cancelled" dimmed />

        <Card>
          {fragment && (
            <>
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
              <Row label="每片價格" value={`${fmtStone(listing.price)} 女神石`} />
            </>
          )}
          <Row
            label={fragment ? "原總價" : buyOrder ? "原收購價" : "原掛單價"}
            value={`${fmtStone(total)} 女神石`}
            strike
          />
          <Row label={copy.poster} value={posterName} />
          <Row label={buyOrder ? "發布時間" : "掛單時間"} value={fmtShortDate(listing.createdAt)} />
          <Row label="取消時間" value={fmtShortDate(listing.closedAt)} />
          <Row label="取消原因" value={`${copy.poster}自行取消`} />
          {buyOrder && isRequester && (
            <Row
              label="已退還"
              value={`${fmtStone(refundAmount)} 女神石`}
              valueColor="success.main"
            />
          )}
        </Card>

        <Alert severity="info" icon={false} sx={{ borderRadius: 3 }}>
          {buyOrder
            ? isRequester
              ? `這筆收購單已取消，預扣的 ${fmtStone(refundAmount)} 女神石已全額退還。`
              : "這筆收購單已取消，無法賣出。"
            : "這筆委託已取消，無法購買。"}
          可以回列表看看其他{itemLabel(listing)}的{copy.noun}。
        </Alert>
        <Button variant="outlined" onClick={backToMarket}>
          回列表找其他{itemLabel(listing)}
        </Button>
      </>
    );
  }

  /* ================= 以下皆為 open ================= */

  /* ---- 收購單：我是發單的人 -------------------------------------------- */
  if (buyOrder && isRequester) {
    return wrap(
      <>
        <HeroBanner listing={listing} orderType="buy" kicker="我的收購單" />

        <Card>
          <Row
            label="狀態"
            value={
              <Box component="span" sx={{ display: "inline-flex", gap: 0.75 }}>
                <StatusChip status="open" />
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                  <Tag label="我的" />
                </Box>
              </Box>
            }
          />
          <Row label="發布時間" value={fmtShortDate(listing.createdAt)} />
          {fragment ? (
            <Row label="你會取得" value={`${fmtStone(quantity)} 片碎片`} />
          ) : (
            Number(listing.star) >= 1 && (
              <Row label="你會取得" value={`基礎 ${Number(listing.star)} 星`} />
            )
          )}
        </Card>

        <SectionTitle>你的女神石</SectionTitle>
        <Card>
          {fragment && (
            <>
              <Row label="每片出價" value={`${fmtStone(listing.price)} 女神石`} />
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
            </>
          )}
          <Row
            label="已預扣（發布時）"
            value={`${fmtStone(total)} 女神石`}
            valueColor="error.main"
          />
          <Row label="成交時支付" value={`${fmtStone(total)} 女神石`} />
          <Row label="賣家實收（扣 5%）" value={fmtStone(net)} valueColor="text.secondary" />
          <Row label="取消時退還" value={`${fmtStone(total)} 女神石`} />
        </Card>

        <Alert severity="info" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            這筆錢現在被鎖住
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            {fmtStone(total)} 女神石在發布時就已扣款
            {fragment && `（每片 ${fmtStone(listing.price)} × ${fmtStone(quantity)} 片）`}
            ，收購單還開著的期間不能用來買別的東西。 取消或失效時會全額退回，不收任何費用。
          </Typography>
        </Alert>

        <Button variant="outlined" color="error" onClick={handleCancel} disabled={cancelling}>
          取消收購單並退款
        </Button>
        <BtnNote>取消後 {fmtStone(total)} 女神石立即全額退回你的錢包</BtnNote>
      </>
    );
  }

  /* ---- 賣單：我是掛單的賣家 -------------------------------------------- */
  if (!buyOrder && (viewer.isSeller || viewer.blockReason === "IS_SELLER")) {
    return wrap(
      <>
        <HeroBanner listing={listing} orderType="sell" kicker="我的賣出委託" />

        <Card>
          <Row
            label="狀態"
            value={
              <Box component="span" sx={{ display: "inline-flex", gap: 0.75 }}>
                <StatusChip status="open" />
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                  <Tag label="我的" />
                </Box>
              </Box>
            }
          />
          <Row label="掛單時間" value={fmtShortDate(listing.createdAt)} />
          {/* 這一格對兩種標的的意思相反，講錯會直接誤導人：
              角色掛單期間會鎖定，碎片掛單「不」鎖定，還能拿去回收或兌換。 */}
          <Row
            label={fragment ? "碎片狀態" : "角色狀態"}
            value={fragment ? "未鎖定，仍可回收／兌換" : "掛單鎖定中"}
            valueColor={fragment ? "warning.main" : undefined}
          />
          {fragment ? (
            <>
              <Row label="要賣的片數" value={`${fmtStone(quantity)} 片`} />
              {fragmentsKnown && (
                <Row
                  label="你目前持有"
                  value={`${fmtStone(myFragments)} 片`}
                  valueColor={myFragments < quantity ? "error.main" : "success.main"}
                />
              )}
            </>
          ) : (
            Number(listing.star) >= 1 && (
              <Row label="買家會取得" value={`基礎 ${Number(listing.star)} 星`} />
            )
          )}
        </Card>

        <SectionTitle>成交後結算</SectionTitle>
        <Card>
          {fragment && (
            <>
              <Row label="每片售價" value={fmtStone(listing.price)} />
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
            </>
          )}
          <Row label={fragment ? "總價" : "售價"} value={fmtStone(total)} />
          <Row label="手續費 5%（銷毀）" value={fmtStone(fee)} valueColor="text.secondary" />
          <Row label="你可得" value={fmtStone(net)} />
        </Card>

        {/* 碎片賣單最重要的一句：庫存沒被鎖，你自己花掉就會讓單失效。 */}
        {fragment && fragmentsKnown && myFragments < quantity && (
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
              你的碎片已經不夠這張單了
            </AlertTitle>
            <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
              目前只有 {fmtStone(myFragments)} 片，這張單要 {fmtStone(quantity)} 片。
              有人來買的時候這筆單會直接失效下架。補足碎片或先取消重掛。
            </Typography>
          </Alert>
        )}

        <Alert severity="info" sx={{ borderRadius: 3 }}>
          {fragment
            ? "取消不收手續費。碎片本來就沒被鎖住，掛單期間也可以回收或兌換 —— 但成交當下片數不足，這筆單會失效。"
            : "取消後角色立即解除鎖定，不收手續費。升星強化留在你手上。"}
        </Alert>

        <Button variant="outlined" color="error" onClick={handleCancel} disabled={cancelling}>
          取消掛單
        </Button>
      </>
    );
  }

  /* ---- 收購單：我是可能的賣家 ------------------------------------------ */
  if (buyOrder) {
    // canFulfill 由後端說了算；沒帶時退回看持有狀態，兩者的判準是同一件事。
    const owns = viewer.ownsCharacter;
    const reason = viewer.blockReason;
    // 碎片的門檻是「片數夠不夠」，跟有沒有那隻角色完全無關。
    const canFulfill = fragment
      ? (viewer.canFulfill ?? (fragmentsKnown ? myFragments >= quantity : false))
      : (viewer.canFulfill ?? owns === true);
    // 資產狀態未知時（後端沒帶）不要急著寫「未持有」，
    // 那句話會讓真的有資產的人直接放棄。
    const assetKnown = fragment ? fragmentsKnown : typeof owns === "boolean";
    const notEnough = fragment
      ? reason === "INSUFFICIENT_FRAGMENTS" || (fragmentsKnown && myFragments < quantity)
      : reason === "NOT_OWNED" || owns === false;
    const shortFrags = Math.max(0, quantity - myFragments);

    return wrap(
      <>
        <HeroBanner
          listing={listing}
          orderType="buy"
          kicker={fragment ? "碎片收購委託" : "收購委託"}
        />

        {notEnough && (
          <Alert severity="warning" role="status" sx={{ borderRadius: 3 }}>
            <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
              {fragment
                ? `你的${listing.name}碎片不足，無法賣出`
                : `你沒有${listing.name}，無法賣出`}
            </AlertTitle>
            <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
              {fragment
                ? `這張單要 ${fmtStone(quantity)} 片，你目前有 ${fmtStone(myFragments)} 片，還差 ${fmtStone(shortFrags)} 片。抽到重複角色會拿到碎片，也可以到碎片市場買。`
                : "要接這張收購單，得先真的持有這隻角色。可以去轉蛋，或到出售中的掛單簿買一隻。"}
            </Typography>
          </Alert>
        )}

        <Card>
          <Row label="狀態" value={<StatusChip status="open" />} />
          <Row
            label="收購方"
            value={
              <Box
                component="span"
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.875 }}
              >
                <CharAvatar
                  itemId={listing.buyerId ?? listing.itemId}
                  name={posterName}
                  size={28}
                />
                {posterName}
              </Box>
            }
          />
          <Row label="發布時間" value={fmtShortDate(listing.createdAt)} />
          {fragment ? (
            <>
              <Row label="對方要收" value={`${fmtStone(quantity)} 片`} />
              <Row
                label="你的碎片"
                value={
                  assetKnown
                    ? `${fmtStone(myFragments)} 片${myFragments >= quantity ? "，可賣出" : "，不足"}`
                    : "確認中…"
                }
                valueColor={
                  assetKnown ? (myFragments >= quantity ? "success.main" : "error.main") : undefined
                }
              />
            </>
          ) : (
            <Row
              label="你的持有狀態"
              value={assetKnown ? (owns ? "已持有，可賣出" : "未持有") : "確認中…"}
              valueColor={assetKnown ? (owns ? "success.main" : "error.main") : undefined}
            />
          )}
        </Card>

        <WalletStrip balance={balance} />

        {/* 兩種標的的代價完全不同：角色是整隻離開 box 且升星消失，
            碎片只是庫存數量減少，沒有星等這回事。 */}
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            {fragment ? "賣出後碎片就從庫存扣掉" : "賣出後角色就離開你的box"}
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            {fragment
              ? `這 ${fmtStone(quantity)} 片會直接從你的碎片庫存扣除，扣掉後如果不到 150 片就沒辦法兌換該角色了。`
              : "你的升星強化不會跟著轉移，也不會退還升星花掉的女神石。買家拿到的是初始星數。"}
          </Typography>
        </Alert>

        <SectionTitle>你會拿到多少</SectionTitle>
        <Card sx={{ boxShadow: "none" }}>
          {fragment && (
            <>
              <Row label="每片收購價" value={`${fmtStone(listing.price)} 女神石`} />
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
            </>
          )}
          <Row
            label={fragment ? "總價（單價 × 片數）" : "收購價"}
            value={`${fmtStone(total)} 女神石`}
          />
          <Row label="手續費 5%（銷毀）" value={`−${fmtStone(fee)}`} valueColor="text.secondary" />
          <Row label="你實收" value={fmtStone(net)} valueColor="secondary.main" />
          <Row
            label="你的餘額"
            value={`${fmtStone(balance)} → ${fmtStone(balance + net)} 女神石`}
          />
          {fragment && assetKnown && (
            <Row
              label="你的碎片"
              value={`${fmtStone(myFragments)} → ${fmtStone(Math.max(0, myFragments - quantity))} 片`}
            />
          )}
        </Card>

        <Button
          variant="contained"
          color="secondary"
          onClick={() => setConfirmOpen(true)}
          disabled={!canFulfill || fulfilling}
          sx={{ py: 1.5 }}
        >
          {notEnough
            ? fragment
              ? `碎片不足 ${fmtStone(quantity)} 片`
              : `你沒有${listing.name}`
            : `賣給${posterName}`}
        </Button>
        <BtnNote>
          {notEnough
            ? fragment
              ? `湊到 ${fmtStone(quantity)} 片後就能回來賣出`
              : "取得這隻角色後就能回來賣出"
            : `成交後不可反悔，你會收到 ${fmtStone(net)} 女神石。`}
        </BtnNote>
        {notEnough && (
          <Button
            variant="outlined"
            onClick={() =>
              navigate(
                fragment
                  ? `/trade/market?itemKind=fragment&characterId=${listing.itemId}`
                  : `/trade/market?characterId=${listing.itemId}`,
                { state: { fromMarket: false } }
              )
            }
          >
            {fragment ? `去買${listing.name}的碎片` : `去買一隻${listing.name}`}
          </Button>
        )}

        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          fullWidth
          maxWidth="xs"
          aria-labelledby="fulfill-confirm-title"
        >
          <DialogTitle id="fulfill-confirm-title" sx={{ fontWeight: 700 }}>
            確認把{itemLabel(listing)}
            {fragment && ` ${fmtStone(quantity)} 片`}賣給{posterName}？
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ borderRadius: 3, mb: 1.5 }}>
              <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
                {fragment ? "碎片會立刻從庫存扣除" : "角色會立刻離開你的box"}
              </AlertTitle>
              <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
                {fragment
                  ? "這個動作無法取消，碎片也不會退還。"
                  : "升星強化不會轉移，也不會退錢。這個動作無法取消。"}
              </Typography>
            </Alert>
            <Box sx={{ mb: 1.5 }}>
              <Row label="標的" value={`${itemLabel(listing)}（${listing.itemId}）`} />
              {fragment ? (
                <>
                  <Row label="片數" value={`${fmtStone(quantity)} 片`} />
                  <Row label="每片收購價" value={`${fmtStone(listing.price)} 女神石`} />
                  <Row label="總價" value={`${fmtStone(total)} 女神石`} />
                  {assetKnown && (
                    <Row
                      label="你的碎片"
                      value={`${fmtStone(myFragments)} → ${fmtStone(Math.max(0, myFragments - quantity))} 片`}
                    />
                  )}
                </>
              ) : (
                <>
                  {Number(listing.star) >= 1 && (
                    <Row label="對方會取得" value={`基礎 ${Number(listing.star)} 星`} />
                  )}
                  <Row label="收購價" value={`${fmtStone(total)} 女神石`} />
                </>
              )}
              <Row
                label="手續費 5%（銷毀）"
                value={`−${fmtStone(fee)}`}
                valueColor="text.secondary"
              />
              <Row label="你實收" value={`${fmtStone(net)} 女神石`} valueColor="secondary.main" />
              <Row label="交易後餘額" value={`${fmtStone(balance + net)} 女神石`} />
            </Box>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.6 }}>
              對方發單時已預扣 {fmtStone(total)} 女神石，成交當下就會撥給你，不會跳票。
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" onClick={() => setConfirmOpen(false)} disabled={fulfilling}>
              取消
            </Button>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleFulfill}
              disabled={fulfilling}
              autoFocus
            >
              確認賣出
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  /* ---- 賣單 B3：已擁有該角色 ------------------------------------------ */
  // 只有角色單走這裡。碎片**不受「已持有」限制** —— viewer.ownsCharacter 在碎片單
  // 也會是 true（你就是有那隻角色），但那完全不妨礙你買它的碎片。
  // 少了 !fragment 這個條件，已持有角色的人會被擋在自己最想買的碎片外面。
  if (!fragment && (viewer.blockReason === "ALREADY_OWNED" || viewer.ownsCharacter)) {
    return wrap(
      <>
        <HeroBanner listing={listing} orderType="sell" kicker="賣出委託" />

        <Alert severity="warning" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            你已擁有此角色，無法購買
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            角色為一人一隻，重複持有不會生效。抽到重複的角色會變成該角色的碎片。
          </Typography>
        </Alert>

        <Card>
          <Row label="狀態" value={<StatusChip status="open" />} />
          <Row label="賣家" value={displayName(listing.sellerName)} />
          <Row
            label="你的持有狀態"
            value={
              <Box
                component="span"
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
              >
                <CharAvatar
                  itemId={listing.itemId}
                  name={listing.name}
                  headImage={listing.headImage}
                  size={28}
                />
                已持有
              </Box>
            }
          />
        </Card>

        <Button variant="contained" disabled>
          你已擁有{listing.name}
        </Button>
        <BtnNote>你可以改為掛賣單，或去收購簿看看有沒有人想買</BtnNote>
        <Button variant="outlined" onClick={() => navigate("/trade/sell")}>
          改為掛售我的{listing.name}
        </Button>
        <Button
          variant="text"
          color="secondary"
          onClick={() => navigate(`/trade/market?orderType=buy&characterId=${listing.itemId}`)}
        >
          看誰在收購{listing.name}
        </Button>
        {/* 已持有角色的人正是碎片市場的主要客群（賣掉多餘碎片換石頭），
            所以這裡順手給一個入口，而不是只留死路。 */}
        <Button
          variant="text"
          color="secondary"
          onClick={() => navigate(`/trade/market?itemKind=fragment&characterId=${listing.itemId}`)}
        >
          看{listing.name}的碎片行情
        </Button>
      </>
    );
  }

  /* ---- 賣單 B2：女神石不足 -------------------------------------------- */
  if (viewer.blockReason === "INSUFFICIENT_FUNDS") {
    return wrap(
      <>
        <HeroBanner listing={listing} orderType="sell" kicker="賣出委託" />
        <WalletStrip balance={balance} short />

        <Alert severity="error" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            女神石不足，無法購買
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6, ...NUMS }}>
            餘額 {fmtStone(balance)} · 需要 {fmtStone(total)} · 還差{" "}
            <strong>{fmtStone(shortfall)}</strong>。
          </Typography>
        </Alert>

        <Card sx={{ boxShadow: "none" }}>
          {fragment && (
            <>
              <Row label="每片售價" value={fmtStone(listing.price)} />
              <Row label="片數" value={`${fmtStone(quantity)} 片`} />
            </>
          )}
          <Row label={fragment ? "總價" : "售價"} value={fmtStone(total)} />
          <Row label="你的餘額" value={fmtStone(balance)} valueColor="error.main" />
          <Row label="差額" value={fmtStone(shortfall)} valueColor="error.main" />
        </Card>

        <Button variant="contained" disabled>
          女神石不足
        </Button>
        <BtnNote>還差 {fmtStone(shortfall)} 女神石</BtnNote>
        <Button variant="outlined" onClick={backToMarket}>
          看預算內的{itemLabel(listing)}（≤ {fmtStone(balance)}）
        </Button>
      </>
    );
  }

  /* ---- 賣單 A1：買家視角，可購買 -------------------------------------- */
  const blocked = viewer.canBuy === false;
  return wrap(
    <>
      <HeroBanner
        listing={listing}
        orderType="sell"
        kicker={fragment ? "碎片賣出委託" : "賣出委託"}
      />

      <Card>
        <Row label="狀態" value={<StatusChip status="open" />} />
        <Row
          label="賣家"
          value={
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.875 }}>
              <CharAvatar
                itemId={listing.sellerId}
                name={displayName(listing.sellerName)}
                size={28}
              />
              {displayName(listing.sellerName)}
            </Box>
          }
        />
        <Row label="掛單時間" value={fmtShortDate(listing.createdAt)} />
        {fragment ? (
          <>
            <Row label="你會買到" value={`${fmtStone(quantity)} 片`} />
            {fragmentsKnown && (
              <Row
                label="你的碎片"
                value={`${fmtStone(myFragments)} → ${fmtStone(myFragments + quantity)} 片`}
                valueColor="secondary.main"
              />
            )}
          </>
        ) : (
          <Row label="你的持有狀態" value="未持有" />
        )}
      </Card>

      <WalletStrip balance={balance} />

      {/* 碎片不能沿用角色的「初始星數」警語 —— 碎片沒有星等。
          這裡該講的是「碎片能拿來做什麼」，以及湊滿 150 片換到的是 1★。 */}
      {fragment ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            買到的碎片可以累積
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            碎片沒有持有上限，已經擁有這隻角色也能買。每 150 片可兌換該角色（
            <strong>取得的角色固定 1★</strong>
            ，不是角色的原生星數），也可以 1 片換 1 女神石回收。
          </Typography>
          {fragmentsKnown && (
            <Typography sx={{ fontSize: 12.8, lineHeight: 1.6, fontWeight: 700, mt: 0.5, ...NUMS }}>
              買下後你會有 {fmtStone(myFragments + quantity)} 片
              {myFragments + quantity >= 150
                ? "，已達兌換門檻。"
                : `，距離 150 片還差 ${fmtStone(Math.max(0, 150 - myFragments - quantity))} 片。`}
            </Typography>
          )}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            成交後你拿到的是初始星數
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            賣家的升星強化不會轉移，升星所花的女神石會直接消失。
          </Typography>
          {Number(listing.star) >= 1 && (
            <Typography sx={{ fontSize: 12.8, lineHeight: 1.6, fontWeight: 700, mt: 0.5 }}>
              這筆你會拿到 {listing.name} 基礎 {Number(listing.star)} 星。
            </Typography>
          )}
        </Alert>
      )}

      <SectionTitle>費用</SectionTitle>
      <Card sx={{ boxShadow: "none" }}>
        {fragment && (
          <>
            <Row label="每片售價" value={`${fmtStone(listing.price)} 女神石`} />
            <Row label="片數" value={`${fmtStone(quantity)} 片`} />
          </>
        )}
        <Row
          label={fragment ? "你支付（單價 × 片數）" : "你支付"}
          value={`${fmtStone(total)} 女神石`}
        />
        <Row label="手續費 5%（銷毀）" value={fmtStone(fee)} valueColor="text.secondary" />
        <Row label="賣家實收" value={fmtStone(net)} />
      </Card>

      <Button
        variant="contained"
        onClick={() => setConfirmOpen(true)}
        disabled={blocked || buying}
        sx={{ py: 1.5 }}
      >
        立即購買
      </Button>
      <BtnNote>交易成立後不可退回，請確認{fragment ? "片數與總價" : "角色與價格"}。</BtnNote>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="buy-confirm-title"
      >
        <DialogTitle id="buy-confirm-title" sx={{ fontWeight: 700 }}>
          確認購買{itemLabel(listing)}
          {fragment && ` ${fmtStone(quantity)} 片`}？
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 1.5 }}>
            {fragment ? (
              <>
                <Row label="片數" value={`${fmtStone(quantity)} 片`} />
                <Row label="每片售價" value={`${fmtStone(listing.price)} 女神石`} />
                <Row label="應付總額（單價 × 片數）" value={`${fmtStone(total)} 女神石`} />
                {fragmentsKnown && (
                  <Row
                    label="你的碎片"
                    value={`${fmtStone(myFragments)} → ${fmtStone(myFragments + quantity)} 片`}
                    valueColor="secondary.main"
                  />
                )}
              </>
            ) : (
              <>
                {Number(listing.star) >= 1 && (
                  <Row label="你會取得" value={`基礎 ${Number(listing.star)} 星`} />
                )}
                <Row label="售價" value={`${fmtStone(listing.price)} 女神石`} />
                <Row label="應付總額" value={`${fmtStone(total)} 女神石`} />
              </>
            )}
            <Row label="目前餘額" value={fmtStone(balance)} />
            <Row label="交易後餘額" value={fmtStone(balance - total)} />
          </Box>
          {fragment ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
                碎片兌換出來的角色固定 1★
              </AlertTitle>
              <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
                湊滿 150 片可兌換 {listing.name}，取得的是 1★，不是原生星數。
              </Typography>
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
                你收到的是角色初始星數
              </AlertTitle>
              <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
                賣家的升星強化不會轉移。
              </Typography>
            </Alert>
          )}
          <Typography sx={{ mt: 1.5, fontSize: 11.5, color: "text.secondary", lineHeight: 1.6 }}>
            手續費 {fmtStone(fee)} 女神石（5%）於成交時銷毀，賣家實收 {fmtStone(net)}。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmOpen(false)} disabled={buying}>
            取消
          </Button>
          <Button variant="contained" onClick={handleBuy} disabled={buying} autoFocus>
            確認購買
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
