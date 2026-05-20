import { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Paper, Typography, Skeleton, Alert, Button, Chip, Avatar } from "@mui/material";
import RedeemIcon from "@mui/icons-material/Redeem";
import DiamondIcon from "@mui/icons-material/Diamond";
import StarIcon from "@mui/icons-material/Star";
import liff from "@line/liff";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { STATUS, STATUS_MAP, fmtDate, getViewerRole } from "./_shared";
import { genNotify } from "../../flex/TradeNotify";
import AlertDialog from "../../components/AlertDialog";
import useAlertDialog from "../../hooks/useAlertDialog";
import useHintBar from "../../hooks/useHintBar";
import HintSnackBar from "../../components/HintSnackBar";

function PageSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={200} animation="wave" />
      <Skeleton variant="rounded" height={160} animation="wave" />
    </Box>
  );
}

function ClosePanel() {
  const navigate = useNavigate();
  const handleClose = () => {
    if (liff.isInClient()) liff.closeWindow();
    else navigate("/trade/manage");
  };
  return (
    <Paper sx={{ p: 2, borderRadius: 3, textAlign: "center" }}>
      <Button variant="contained" onClick={handleClose}>
        關閉
      </Button>
    </Paper>
  );
}

function bannerCopy(role, status, marketId) {
  if (status === STATUS.COMPLETED) {
    return { title: `已成交 #${marketId}`, chipLabel: "已完成" };
  }
  if (status === STATUS.CANCELLED) {
    return {
      title: role === "seller" ? `已取消 #${marketId}` : "交易已取消",
      chipLabel: "已取消",
    };
  }
  // pending
  return {
    title: role === "seller" ? `委託 #${marketId}` : `交易邀請 #${marketId}`,
    chipLabel: role === "seller" ? "等待對方回覆" : "等你回覆",
  };
}

function Banner({ role, status, marketId }) {
  const { title, chipLabel } = bannerCopy(role, status, marketId);
  const statusInfo = STATUS_MAP[status] || STATUS_MAP[STATUS.CANCELLED];
  return (
    <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          flexWrap: "wrap",
        }}
      >
        <RedeemIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={statusInfo.icon}
              label={chipLabel}
              size="small"
              color={statusInfo.color}
              sx={
                statusInfo.color === "default"
                  ? { bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }
                  : undefined
              }
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function HeroCard({ market }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Avatar
          variant="rounded"
          src={market.image}
          alt={market.name}
          sx={{ width: 96, height: 96, borderRadius: 2 }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {market.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            道具編號 #{market.item_id}
          </Typography>
          {market.star > 0 && (
            <Box sx={{ display: "flex", mt: 0.5 }}>
              {Array.from({ length: market.star }).map((_, i) => (
                <StarIcon key={i} sx={{ color: "warning.main", fontSize: 18 }} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ mt: 2, color: "text.secondary", fontSize: 14 }}>
        <strong>{market.seller_display_name || "賣方"}</strong>
        {" → "}
        <strong>{market.buyer_display_name || "買方"}</strong>
      </Box>
    </Paper>
  );
}

function DetailRow({ label, value, valueColor }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color: valueColor || "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}

function DetailsCard({ market, role, balance, balanceLoading }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <DetailRow
        label="金額"
        value={
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            <DiamondIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            {market.price.toLocaleString()}
          </Box>
        }
      />
      <DetailRow label="建立於" value={fmtDate(market.created_at)} />
      {role === "buyer" && (
        <>
          <DetailRow
            label="你的女神石"
            value={balanceLoading ? "…" : (balance ?? 0).toLocaleString()}
          />
          <DetailRow
            label="交易後"
            value={
              balanceLoading ? "…" : Math.max(0, (balance ?? 0) - market.price).toLocaleString()
            }
            valueColor={!balanceLoading && (balance ?? 0) < market.price ? "error.main" : undefined}
          />
        </>
      )}
    </Paper>
  );
}

export default function TradeDetail() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const { marketId } = useParams();
  const [{ data: market, loading, error }, fetchMarket] = useAxios(`/api/market/${marketId}`, {
    manual: true,
  });

  const isBuyer = market ? getViewerRole(market, liffContext?.userId) === "buyer" : false;
  const [{ data: stoneData, loading: stoneLoading }] = useAxios("/api/inventory/total-god-stone", {
    manual: !isLoggedIn || !isBuyer,
  });

  const balance = stoneData?.total ?? null;

  const navigate = useNavigate();
  const [{ loading: acceptLoading }, acceptTx] = useAxios({ method: "POST" }, { manual: true });
  const [{ loading: denyLoading }, denyTx] = useAxios({ method: "DELETE" }, { manual: true });
  const [alertState, { handleOpen: openAlert, handleClose: closeAlert }] = useAlertDialog();
  const [
    { message, severity, open: snackOpen },
    { handleOpen: openSnack, handleClose: closeSnack },
  ] = useHintBar();

  useEffect(() => {
    document.title = "交易詳情";
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchMarket();
  }, [isLoggedIn, fetchMarket]);

  if (!isLoggedIn) return <AlertLogin />;
  if (loading || !market) return <PageSkeleton />;

  if (error) {
    const code = error.response?.status;
    const msg = code === 403 ? "您無權檢視此交易" : code === 404 ? "交易不存在" : "載入交易失敗";
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Alert severity="error">{msg}</Alert>
        <ClosePanel />
      </Box>
    );
  }

  const role = getViewerRole(market, liffContext?.userId);
  if (role === "guest") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Alert severity="error">您無權檢視此交易</Alert>
        <ClosePanel />
      </Box>
    );
  }

  const closeAfterSuccess = () => {
    setTimeout(() => {
      if (liff.isInClient()) liff.closeWindow();
      else navigate("/trade/manage");
    }, 1500);
  };

  const handleAccept = () => {
    openAlert({
      title: "確認接受",
      description: `將花費 ${market.price} 女神石換取「${market.name}」，確定嗎？`,
      submitText: "確認接受",
      cancelText: "取消",
      onSubmit: async () => {
        closeAlert();
        try {
          await acceptTx({ url: `/api/market/${market.id}/transactions` });
          openSnack("交易成功", "success");
          closeAfterSuccess();
        } catch (e) {
          openSnack(e.response?.data?.message || "交易失敗", "error");
        }
      },
      onCancel: closeAlert,
    });
  };

  const handleDeny = () => {
    openAlert({
      title: "拒絕交易",
      description: `要拒絕「${market.name}」這筆交易嗎？`,
      submitText: "拒絕",
      cancelText: "取消",
      onSubmit: async () => {
        closeAlert();
        try {
          await denyTx({ url: `/api/market/${market.id}/transactions` });
          openSnack("已拒絕", "success");
          closeAfterSuccess();
        } catch (e) {
          openSnack(e.response?.data?.message || "操作失敗", "error");
        }
      },
      onCancel: closeAlert,
    });
  };

  const handleCancelOrder = () => {
    openAlert({
      title: "取消委託",
      description: `要取消「${market.name}」的委託嗎？`,
      submitText: "取消委託",
      cancelText: "返回",
      onSubmit: async () => {
        closeAlert();
        try {
          await denyTx({ url: `/api/market/${market.id}/transactions` });
          openSnack("已取消委託", "success");
          setTimeout(() => navigate("/trade/manage"), 1000);
        } catch (e) {
          openSnack(e.response?.data?.message || "操作失敗", "error");
        }
      },
      onCancel: closeAlert,
    });
  };

  const handleShare = async () => {
    try {
      const result = await liff.shareTargetPicker([
        {
          type: "flex",
          altText: "交易邀請",
          contents: genNotify({
            marketId: market.id,
            name: market.name,
            image: market.image,
            charge: market.price,
            sellerName: liffContext?.displayName || "好友",
            star: market.star ?? 0,
          }),
        },
      ]);
      if (result === null) openSnack("已取消分享", "info");
      else openSnack("已發送邀請", "success");
    } catch {
      openSnack("分享失敗，請稍後再試", "error");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
        pb: "calc(env(safe-area-inset-bottom) + 80px)",
        minHeight: "100dvh",
      }}
    >
      <Banner role={role} status={market.status} marketId={market.id} />
      <HeroCard market={market} />
      <DetailsCard market={market} role={role} balance={balance} balanceLoading={stoneLoading} />
      {role === "buyer" &&
        market.status === STATUS.PENDING &&
        !stoneLoading &&
        balance != null &&
        balance < market.price && (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            女神石不足，無法完成這筆交易
          </Alert>
        )}

      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          px: 2,
          pt: 1.5,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
          display: "flex",
          gap: 1.5,
          zIndex: 10,
        }}
      >
        {market.status !== STATUS.PENDING ? (
          <Button
            fullWidth
            variant="contained"
            onClick={() => (liff.isInClient() ? liff.closeWindow() : navigate("/trade/manage"))}
            size="large"
          >
            關閉
          </Button>
        ) : role === "seller" ? (
          <>
            <Button
              fullWidth
              variant="outlined"
              color="error"
              size="large"
              onClick={handleCancelOrder}
              disabled={denyLoading}
            >
              取消委託
            </Button>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleShare}
            >
              再次通知
            </Button>
          </>
        ) : (
          <>
            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              size="large"
              onClick={handleDeny}
              disabled={denyLoading || acceptLoading}
            >
              拒絕
            </Button>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleAccept}
              disabled={acceptLoading || denyLoading || (balance != null && balance < market.price)}
            >
              接受交易
            </Button>
          </>
        )}
      </Box>

      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        description={alertState.description}
        submitText={alertState.submitText}
        cancelText={alertState.cancelText}
        onSubmit={alertState.onSubmit}
        onCancel={alertState.onCancel}
        onClose={closeAlert}
      />
      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={closeSnack} />
    </Box>
  );
}
