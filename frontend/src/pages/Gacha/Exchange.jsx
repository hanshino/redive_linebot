import { useMemo, useState, useEffect } from "react";
import useAxios from "axios-hooks";
import { Box, Grid, Alert, Snackbar, Typography } from "@mui/material";
import DiamondIcon from "@mui/icons-material/Diamond";
import { get } from "lodash";
import { useLocation } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import AlertDialog from "../../components/AlertDialog";
import LoadError from "../../components/LoadError";
import CharacterCard from "../../components/CharacterCard";
import useAlertDialog from "../../hooks/useAlertDialog";
import useLiff from "../../context/useLiff";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function GachaExchange() {
  const { loggedIn: isLoggedIn } = useLiff();
  const query = useQuery();
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [barState, setBarState] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [dialog, { handleOpen: openDialog, handleClose: closeDialog, setBusy }] = useAlertDialog();
  // 深連結的外框只在確認框開著時保留，關掉後就收起，不然會一直框著
  const [focusDismissed, setFocusDismissed] = useState(false);
  const dismissDialog = () => {
    closeDialog();
    setFocusDismissed(true);
  };

  const [{ data, error: shopError }, fetchData] = useAxios("/api/god-stone-shop", {
    manual: true,
  });
  const [{ data: history, error: historyError }, fetchHistory] = useAxios(
    "/api/god-stone-shop/history",
    { manual: true }
  );
  const [, doPurchase] = useAxios(
    { url: "/api/god-stone-shop/purchase", method: "POST" },
    { manual: true }
  );

  useEffect(() => {
    document.title = "女神石兌換商店";
  }, []);

  const showBar = (message, severity) => setBarState({ open: true, message, severity });

  // 兩支 API 都要成功才畫得出商店（要知道餘額與已持有），任何一支失敗都算載入失敗。
  // 兌換後的重新整理失敗不走這裡：舊資料還在，只提示一聲。
  const loadFailed = (shopError && !data) || (historyError && !history);
  const ready = Array.isArray(data) && history != null;

  const loadAll = () => {
    // 錯誤已經存進 axios-hooks 的 state，這裡吞掉 rejection 避免 unhandled。
    fetchData().catch(() => {});
    fetchHistory().catch(() => {});
  };

  const list = useMemo(() => {
    if (!Array.isArray(data) || !history) return [];
    const holdingIds = get(history, "holdingList", []).map(item => item.itemId);

    return data
      .map(item => ({
        ...item,
        holding: holdingIds.includes(item.itemId),
      }))
      .sort((a, b) => {
        if (a.holding && !b.holding) return 1;
        if (!a.holding && b.holding) return -1;
        return a.itemId - b.itemId;
      });
  }, [data, history]);

  const godStone = Number(get(history, "godStone", 0)) || 0;

  const confirmPurchase = async item => {
    setBusy(true);
    let purchased = false;
    let failMessage = "";
    try {
      await doPurchase({ data: { itemId: item.itemId, itemCount: 1 } });
      purchased = true;
    } catch (e) {
      failMessage = get(e, "response.data.error", "兌換失敗，請稍後再試一次。");
    }

    // 不論成敗都重抓：成功要更新餘額與已兌換，失敗（例如已兌換過）多半是畫面過期。
    // 確認框在重抓完成前一直維持 busy，卡片還顯示「兌換」的那段空窗就不會被再點一次。
    let refreshed = true;
    try {
      await fetchHistory();
    } catch {
      refreshed = false;
    }

    dismissDialog();
    if (!purchased) showBar(failMessage, "error");
    else if (!refreshed) {
      showBar(`已兌換 ${item.name}，但餘額更新失敗，請重新整理頁面確認。`, "warning");
    } else showBar(`兌換成功：${item.name}`, "success");
  };

  const handlePurchase = item => {
    const price = Number(item.price);

    if (item.holding) {
      showBar("你已經兌換過這個角色了。", "info");
      return;
    }
    if (item.isEnable !== 1) {
      showBar("這個商品目前未開放兌換。", "info");
      return;
    }
    if (godStone < price) {
      showBar(
        `女神石不足：需要 ${price.toLocaleString()}，你目前有 ${godStone.toLocaleString()}。`,
        "error"
      );
      return;
    }

    // 花掉女神石不能退回，所以走 destructive：動詞按鈕、預設焦點在「取消」。
    openDialog({
      title: `兌換 ${item.name}？`,
      description: `花費 ${price.toLocaleString()} 女神石，剩下 ${(godStone - price).toLocaleString()}，兌換後無法退回。`,
      submitText: "兌換",
      destructive: true,
      onSubmit: () => confirmPurchase(item),
    });
  };

  // 深連結 ?exchangeId=：商品會被框起來並捲到畫面中間，同時開確認框；
  // 仍然要玩家按「兌換」才會扣款。資料備齊後只處理一次（在 render 階段調整自己的 state，
  // 不用 effect，避免多一輪 render）。
  const exchangeId = query.get("exchangeId");
  const linkTarget = useMemo(
    () => (exchangeId ? list.find(item => String(item.itemId) === exchangeId) : undefined),
    [exchangeId, list]
  );
  const focusId = focusDismissed ? null : (linkTarget?.itemId ?? null);
  if (ready && exchangeId && !deepLinkHandled) {
    setDeepLinkHandled(true);
    if (linkTarget) handlePurchase(linkTarget);
    else showBar("找不到這個兌換商品，可能已下架。", "warning");
  }

  useEffect(() => {
    if (focusId == null) return;
    document.getElementById(`exchange-item-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (loadFailed)
    return <LoadError message="兌換商店載入失敗，請檢查網路後再試一次。" onRetry={loadAll} />;

  if (!ready) return <FullPageLoading />;

  const handleCloseBar = () => setBarState(old => ({ ...old, open: false }));

  return (
    <Grid container direction="column" spacing={3}>
      <Grid>
        <Alert severity="info" icon={<DiamondIcon fontSize="inherit" />}>
          你的女神石目前還有
          <strong>{` ${godStone.toLocaleString()} `}</strong>個
        </Alert>
      </Grid>
      {list.length === 0 ? (
        <Grid>
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography sx={{ color: "text.secondary" }}>目前沒有可兌換的角色。</Typography>
          </Box>
        </Grid>
      ) : (
        <Grid container spacing={2}>
          {list.map(char => (
            <Grid
              size={{ xs: 12, sm: 6, md: 4 }}
              key={char.itemId}
              id={`exchange-item-${char.itemId}`}
            >
              <CharacterCard
                name={char.name}
                image={char.itemImage}
                price={char.price}
                star={char.star}
                holding={char.holding}
                isEnable={char.isEnable}
                highlighted={focusId === char.itemId}
                onClick={() => handlePurchase(char)}
              />
            </Grid>
          ))}
        </Grid>
      )}
      <Snackbar open={barState.open} autoHideDuration={6000} onClose={handleCloseBar}>
        <Alert elevation={6} variant="filled" onClose={handleCloseBar} severity={barState.severity}>
          {barState.message}
        </Alert>
      </Snackbar>
      <AlertDialog
        open={dialog.open}
        title={dialog.title}
        description={dialog.description}
        onSubmit={dialog.onSubmit}
        onCancel={dismissDialog}
        onClose={dismissDialog}
        submitText={dialog.submitText}
        cancelText={dialog.cancelText}
        destructive={dialog.destructive}
        busy={dialog.busy}
      />
    </Grid>
  );
}
