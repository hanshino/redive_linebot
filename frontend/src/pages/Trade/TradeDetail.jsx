import { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Paper, Typography, Skeleton, Alert, Button } from "@mui/material";
import liff from "@line/liff";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { getViewerRole } from "./_shared";

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

export default function TradeDetail() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const { marketId } = useParams();
  const [{ data: market, loading, error }, fetchMarket] = useAxios(`/api/market/${marketId}`, {
    manual: true,
  });

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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography>
        role: {role} | status: {market.status}
      </Typography>
    </Box>
  );
}
