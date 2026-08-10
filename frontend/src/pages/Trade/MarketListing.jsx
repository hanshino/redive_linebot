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
import { NUMS, calcFee, calcNet, displayName, errorInfo, fmtShortDate, fmtStone } from "./_market";
import {
  CharAvatar,
  BaseStarBadge,
  GradientPanel,
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

/** 回市場一律帶著角色，讓人回到剛才在看的那一本掛單簿。 */
const marketPathFor = listing =>
  listing?.itemId != null ? `/trade/market?characterId=${listing.itemId}` : "/trade/market";

function AppHeader({ listing, orderNo, onBack, onRefresh, refreshing }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 0.5 }}>
      <IconButton
        aria-label={listing?.name ? `返回${listing.name}的掛單列表` : "返回市場列表"}
        size="small"
        onClick={onBack}
      >
        <ArrowBackIosNewIcon fontSize="small" />
      </IconButton>
      <Box>
        <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }}>委託詳情</Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
          {orderNo}
          {listing?.viewer?.isSeller ? " · 我的掛單" : ""}
        </Typography>
      </Box>
      <Box sx={{ flex: "1 1 auto" }} />
      <IconButton aria-label="重新整理" size="small" onClick={onRefresh} disabled={refreshing}>
        <RefreshIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

/** 開放中用漸層 banner；終態 / 失效用平的卡片，跟設計稿一致。 */
function HeroBanner({ listing, kicker }) {
  return (
    <GradientPanel>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CharAvatar
          itemId={listing.itemId}
          name={listing.name}
          headImage={listing.headImage}
          size={62}
        />
        <Box>
          <Typography sx={{ fontSize: 11, letterSpacing: "1.4px", opacity: 0.82 }}>
            {kicker}
          </Typography>
          <Typography sx={{ fontSize: 21, fontWeight: 700, lineHeight: 1.2, mt: "2px" }}>
            {listing.name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.875, mt: "3px" }}>
            <Typography sx={{ fontSize: 11.5, opacity: 0.82, ...NUMS }}>
              ID {listing.itemId}
            </Typography>
            <BaseStarBadge star={listing.star} onGradient />
          </Box>
        </Box>
      </Box>
      <Box sx={{ mt: 1.75, display: "flex", alignItems: "baseline", gap: 0.875 }}>
        <Box component="b" sx={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.5px", ...NUMS }}>
          {fmtStone(listing.price)}
        </Box>
        <Box component="span" sx={{ fontSize: 13, opacity: 0.9 }}>
          女神石
        </Box>
      </Box>
    </GradientPanel>
  );
}

function HeroFlat({ listing, status, dimmed }) {
  return (
    <Card sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
      <CharAvatar
        itemId={listing.itemId}
        name={listing.name}
        headImage={listing.headImage}
        size={62}
        dimmed={dimmed}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 19, fontWeight: 700 }} noWrap>
          {listing.name}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", ...NUMS }}>
          ID {listing.itemId}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.875 }}>
          <StatusChip status={status} />
          <BaseStarBadge star={listing.star} />
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

  // 從市場點進來的話，上一頁就是那本掛單簿：直接退回去，history 不會多長一節，
  // 不然「頁內返回 push 市場 → 瀏覽器上一頁又回到詳情」會變成一個轉不出去的圈。
  // 直接開連結（LIFF 分享、書籤）沒有這個標記，改用 replace 導向帶角色的市場，
  // 同樣不會留下能退回本頁的紀錄。不看 history.length，那個值猜不準。
  const fromMarket = Boolean(location.state?.fromMarket);

  // 購買失敗回來的終態：把畫面原地降級成 B1 / B4，不重新導頁。
  const [deadCode, setDeadCode] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [{ data: listing, loading, error }, refetch] = useAxios(
    `/api/public-market/listings/${id}`,
    { manual: true }
  );
  const [{ loading: buying }, purchase] = useAxios(
    { url: `/api/public-market/listings/${id}/purchase`, method: "POST" },
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

  // 這頁所有語義上「回市場」的按鈕都走這裡，行為才會一致。
  const backToMarket = useCallback(() => {
    if (fromMarket) navigate(-1);
    else navigate(marketPathFor(listing), { replace: true });
  }, [fromMarket, navigate, listing]);

  const handleBuy = async () => {
    setConfirmOpen(false);
    try {
      const { data } = await purchase();
      handleOpen(`已購買 ${data.name}，花費 ${fmtStone(data.price)} 女神石`, "success");
      refetch().catch(() => {});
    } catch (err) {
      const { code, title, detail, data } = errorInfo(err, "購買失敗，請稍後再試");
      if (code === "ALREADY_TAKEN" || code === "SELLER_LOST_ITEM") {
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

  const handleCancel = async () => {
    try {
      await cancelListing();
      handleOpen("已取消掛單", "success");
      refetch().catch(() => {});
    } catch (err) {
      const { title, detail } = errorInfo(err, "取消失敗，請稍後再試");
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
  const fee = listing.fee ?? calcFee(listing.price);
  const net = listing.netProceeds ?? calcNet(listing.price);
  const balance = viewer.balance ?? 0;
  const shortfall = Math.max(0, listing.price - balance);

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
        orderNo={orderNo}
        onBack={backToMarket}
        onRefresh={() => {
          setDeadCode(null);
          refetch().catch(() => {});
        }}
        refreshing={loading}
      />
      {children}
      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );

  /* ---- B1：搶單失敗（已被買走） / B4：賣家已無此角色 ------------------ */
  if (dead) {
    const isLostItem = deadCode === "SELLER_LOST_ITEM" || listing.status === "invalid";
    return wrap(
      <>
        <HeroFlat listing={listing} status="invalid" dimmed />

        <Alert severity="error" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            {isLostItem ? "賣家已無此角色，委託已失效" : "此委託已被其他玩家買走或取消"}
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            {isLostItem ? "系統已自動下架這筆委託，沒有任何女神石異動。" : "你的女神石沒有被扣款。"}
          </Typography>
        </Alert>

        <Card>
          <Row label="掛單價" value={`${fmtStone(listing.price)} 女神石`} strike />
          <Row label="賣家" value={displayName(listing.sellerName)} />
          {isLostItem && <Row label="失效時間" value={fmtShortDate(listing.closedAt)} />}
          <Row label="你的餘額" value={`${fmtStone(balance)}（未變動）`} />
        </Card>

        {isLostItem ? (
          <>
            <Button variant="contained" disabled>
              委託已失效
            </Button>
            <Button variant="outlined" onClick={backToMarket}>
              回{listing.name}的掛單
            </Button>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.6, mx: 0.25 }}>
              若你認為這是異常，請在群組輸入「客服」回報單號 {orderNo}。
            </Typography>
          </>
        ) : (
          <>
            <Button variant="contained" disabled>
              立即購買
            </Button>
            <BtnNote>此委託已不可購買</BtnNote>
            <Button variant="outlined" onClick={backToMarket}>
              看其他{listing.name}的掛單
            </Button>
          </>
        )}
      </>
    );
  }

  /* ---- A3：已成交（終態） --------------------------------------------- */
  if (shownStatus === "sold") {
    return wrap(
      <>
        <HeroFlat listing={listing} status="sold" />

        <Card>
          <Row label="成交價" value={`${fmtStone(listing.price)} 女神石`} />
          <Row label="手續費 5%（已銷毀）" value={fmtStone(fee)} valueColor="text.secondary" />
          <Row label="賣家實收" value={fmtStone(net)} />
        </Card>

        <Card>
          <Row label="賣家" value={displayName(listing.sellerName)} />
          <Row
            label="買家"
            value={
              viewerId != null && listing.buyerId === viewerId
                ? "你"
                : displayName(listing.buyerName)
            }
          />
          <Row label="成交時間" value={fmtShortDate(listing.soldAt)} />
        </Card>

        <Alert severity="info" icon={false} sx={{ borderRadius: 3 }}>
          角色已入庫，星數為初始值。這筆委託已結束，沒有可用的操作。
        </Alert>
        <BtnNote>紀錄保留 90 天</BtnNote>
      </>
    );
  }

  /* ---- A3b：已取消（終態） -------------------------------------------- */
  if (shownStatus === "cancelled") {
    return wrap(
      <>
        <HeroFlat listing={listing} status="cancelled" dimmed />

        <Card>
          <Row label="原掛單價" value={`${fmtStone(listing.price)} 女神石`} strike />
          <Row label="賣家" value={displayName(listing.sellerName)} />
          <Row label="掛單時間" value={fmtShortDate(listing.createdAt)} />
          <Row label="取消時間" value={fmtShortDate(listing.closedAt)} />
          <Row label="取消原因" value="賣家自行取消" />
        </Card>

        <Alert severity="info" icon={false} sx={{ borderRadius: 3 }}>
          這筆委託已取消，無法購買。可以回列表看看其他{listing.name}的掛單。
        </Alert>
        <Button variant="outlined" onClick={backToMarket}>
          回列表找其他{listing.name}
        </Button>
      </>
    );
  }

  /* ---- A2：自己的掛單 -------------------------------------------------- */
  if (viewer.isSeller || viewer.blockReason === "IS_SELLER") {
    return wrap(
      <>
        <HeroBanner listing={listing} kicker="我的賣出委託" />

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
          <Row label="角色狀態" value="掛單鎖定中" />
          {Number(listing.star) >= 1 && (
            <Row label="買家會取得" value={`基礎 ${Number(listing.star)} 星`} />
          )}
        </Card>

        <SectionTitle>成交後結算</SectionTitle>
        <Card>
          <Row label="售價" value={fmtStone(listing.price)} />
          <Row label="手續費 5%（銷毀）" value={fmtStone(fee)} valueColor="text.secondary" />
          <Row label="你可得" value={fmtStone(net)} />
        </Card>

        <Alert severity="info" sx={{ borderRadius: 3 }}>
          取消後角色立即解除鎖定，不收手續費。升星強化留在你手上。
        </Alert>

        <Button variant="outlined" color="error" onClick={handleCancel} disabled={cancelling}>
          取消掛單
        </Button>
      </>
    );
  }

  /* ---- B3：已擁有該角色 ------------------------------------------------ */
  if (viewer.blockReason === "ALREADY_OWNED" || viewer.ownsCharacter) {
    return wrap(
      <>
        <HeroBanner listing={listing} kicker="賣出委託" />

        <Alert severity="warning" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            你已擁有此角色，無法購買
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
            角色為一人一隻，重複持有不會生效。
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
        <BtnNote>若要出售自己的{listing.name}，請到「我的掛單」新增委託</BtnNote>
        <Button variant="outlined" onClick={() => navigate("/trade/sell")}>
          改為掛售我的{listing.name}
        </Button>
      </>
    );
  }

  /* ---- B2：女神石不足 -------------------------------------------------- */
  if (viewer.blockReason === "INSUFFICIENT_FUNDS") {
    return wrap(
      <>
        <HeroBanner listing={listing} kicker="賣出委託" />
        <WalletStrip balance={balance} short />

        <Alert severity="error" role="status" sx={{ borderRadius: 3 }}>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
            女神石不足，無法購買
          </AlertTitle>
          <Typography sx={{ fontSize: 12.8, lineHeight: 1.6, ...NUMS }}>
            餘額 {fmtStone(balance)} · 需要 {fmtStone(listing.price)} · 還差{" "}
            <strong>{fmtStone(shortfall)}</strong>。
          </Typography>
        </Alert>

        <Card sx={{ boxShadow: "none" }}>
          <Row label="售價" value={fmtStone(listing.price)} />
          <Row label="你的餘額" value={fmtStone(balance)} valueColor="error.main" />
          <Row label="差額" value={fmtStone(shortfall)} valueColor="error.main" />
        </Card>

        <Button variant="contained" disabled>
          女神石不足
        </Button>
        <BtnNote>還差 {fmtStone(shortfall)} 女神石</BtnNote>
        <Button variant="outlined" onClick={backToMarket}>
          看預算內的{listing.name}（≤ {fmtStone(balance)}）
        </Button>
      </>
    );
  }

  /* ---- A1：買家視角，可購買 -------------------------------------------- */
  const blocked = viewer.canBuy === false;
  return wrap(
    <>
      <HeroBanner listing={listing} kicker="賣出委託" />

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
        <Row label="你的持有狀態" value="未持有" />
      </Card>

      <WalletStrip balance={balance} />

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

      <SectionTitle>費用</SectionTitle>
      <Card sx={{ boxShadow: "none" }}>
        <Row label="你支付" value={`${fmtStone(listing.price)} 女神石`} />
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
      <BtnNote>交易成立後不可退回，請確認角色與價格。</BtnNote>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="buy-confirm-title"
      >
        <DialogTitle id="buy-confirm-title" sx={{ fontWeight: 700 }}>
          確認購買{listing.name}？
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 1.5 }}>
            {Number(listing.star) >= 1 && (
              <Row label="你會取得" value={`基礎 ${Number(listing.star)} 星`} />
            )}
            <Row label="售價" value={`${fmtStone(listing.price)} 女神石`} />
            <Row label="應付總額" value={`${fmtStone(listing.price)} 女神石`} />
            <Row label="目前餘額" value={fmtStone(balance)} />
            <Row label="交易後餘額" value={fmtStone(balance - listing.price)} />
          </Box>
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            <AlertTitle sx={{ fontSize: 13, fontWeight: 700, mb: "2px" }}>
              你收到的是角色初始星數
            </AlertTitle>
            <Typography sx={{ fontSize: 12.8, lineHeight: 1.6 }}>
              賣家的升星強化不會轉移。
            </Typography>
          </Alert>
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
