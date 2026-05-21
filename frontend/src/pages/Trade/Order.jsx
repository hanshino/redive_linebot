import { useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  Avatar,
  Alert,
  Skeleton,
} from "@mui/material";
import HandshakeIcon from "@mui/icons-material/Handshake";
import DiamondIcon from "@mui/icons-material/Diamond";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useQuery from "../../hooks/useQuery";
import useLiff from "../../context/useLiff";
import CharacterPickerDrawer from "./CharacterPickerDrawer";
import { QUICK_PRICES } from "./_shared";

function Banner({ targetName }) {
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
        <HandshakeIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            與 {targetName} 交易
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            選一個角色，設定女神石價格
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default function TradeOrder() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const navigate = useNavigate();
  const query = useQuery();
  const targetId = query.get("target_id");
  const viewerId = liffContext?.userId;

  const [selectedId, setSelectedId] = useState(null);
  const [charge, setCharge] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [{ data: targetProfile, loading: targetLoading }] = useAxios(
    targetId ? `/api/profile/${targetId}` : null,
    { manual: !isLoggedIn || !targetId || viewerId === targetId }
  );
  const [{ data: inventoryItems = [], loading: invLoading }, fetchItems] = useAxios(
    "/api/inventory",
    { manual: true }
  );
  const [{ data: createResp, loading: createLoading, error: createErr }, createOrder] = useAxios(
    { url: "/api/trades", method: "POST" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "交易申請";
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchItems();
  }, [isLoggedIn, fetchItems]);

  useEffect(() => {
    if (!targetId) handleOpen("未指定交易對象", "error");
  }, [targetId, handleOpen]);

  useEffect(() => {
    if (createErr) handleOpen(get(createErr, "response.data.message"), "error");
  }, [createErr, handleOpen]);

  useEffect(() => {
    if (createResp?.marketId) {
      navigate(`/trade/${createResp.marketId}`);
    }
  }, [createResp, navigate]);

  const selectedItem = useMemo(
    () => inventoryItems.find(i => i.itemId === selectedId),
    [inventoryItems, selectedId]
  );

  // /api/profile/:userId always returns a synthesised fallback name, so we
  // only need a guard for the "no targetId in the URL" case.
  const targetName = targetProfile?.displayName || "未知對象";

  const isSelf = viewerId && targetId && viewerId === targetId;
  const chargeNum = Number(charge);
  const submittable =
    !isSelf && selectedId != null && Number.isFinite(chargeNum) && chargeNum > 0 && !createLoading;

  const handleSubmit = () => {
    if (!submittable) return;
    createOrder({
      data: { targetId, itemId: selectedId, charge: chargeNum },
    });
  };

  if (!isLoggedIn) return <AlertLogin />;

  const bannerNode =
    targetLoading || !targetProfile ? (
      <Skeleton variant="rounded" height={120} animation="wave" />
    ) : (
      <Banner targetName={targetName} />
    );

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
      {bannerNode}

      {isSelf && <Alert severity="error">您不能與自己進行交易。</Alert>}

      <Alert severity="warning" sx={{ borderRadius: 3 }}>
        <Typography variant="body2">1. 請確認交易對象已加入您的好友</Typography>
        <Typography variant="body2">
          2. 對方來自指令自動帶出，如果不是您要交易的對象請關閉視窗
        </Typography>
      </Alert>

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="overline" color="text.secondary">
          角色
        </Typography>
        <Button
          fullWidth
          variant="outlined"
          size="large"
          disabled={isSelf || invLoading}
          onClick={() => setPickerOpen(true)}
          endIcon={<ChevronRightIcon />}
          sx={{
            mt: 1,
            justifyContent: "space-between",
            py: 1.5,
            textTransform: "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {selectedItem ? (
              <>
                <Avatar
                  variant="rounded"
                  src={selectedItem.headImage}
                  alt={selectedItem.name}
                  sx={{ width: 40, height: 40 }}
                />
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedItem.name}
                </Typography>
              </>
            ) : (
              <Typography variant="body1" color="text.secondary">
                {invLoading ? "載入背包中…" : "點此選擇角色"}
              </Typography>
            )}
          </Box>
        </Button>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="overline" color="text.secondary">
          女神石
        </Typography>
        <TextField
          fullWidth
          value={charge}
          onChange={e => setCharge(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={isSelf}
          inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
          InputProps={{
            startAdornment: <DiamondIcon sx={{ mr: 1, color: "text.secondary" }} />,
          }}
          placeholder="輸入要求金額"
          sx={{ mt: 1 }}
        />
        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          {QUICK_PRICES.map(p => (
            <Chip
              key={p}
              label={p >= 1000 ? `${p / 1000}k` : `${p}`}
              onClick={() => setCharge(String(p))}
              clickable
              disabled={isSelf}
              variant={String(p) === charge ? "filled" : "outlined"}
              color={String(p) === charge ? "primary" : "default"}
            />
          ))}
        </Box>
      </Paper>

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
        <Button
          fullWidth
          variant="outlined"
          color="secondary"
          size="large"
          onClick={() => window.history.back()}
        >
          取消
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          size="large"
          disabled={!submittable}
          onClick={handleSubmit}
        >
          送出交易
        </Button>
      </Box>

      <CharacterPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={inventoryItems}
        initialId={selectedId}
        onConfirm={id => setSelectedId(id)}
      />

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
