import React, { useMemo, useState, useEffect } from "react";
import useAxios from "axios-hooks";
import Grid from "@material-ui/core/Grid";
import { DotsLoading } from "../Loading";
import { get } from "lodash";
import Alert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";
import Snackbar from "@material-ui/core/Snackbar";
import CharacterCard from "./CharacterCard";
import AlertDialog from "../AlertDialog";
import { useLocation } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();

  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const GodStoneShop = () => {
  const query = useQuery();
  const [queryState, setQueryState] = useState({
    asked: false,
  });
  const [barState, setBarState] = useState({
    open: false,
    message: "",
    severity: "",
  });
  const [dialog, setDialog] = useState({
    open: false,
    title: "",
    description: "",
    submitAction: () => {},
  });
  const [{ data, loading }] = useAxios("/api/GodStoneShop");
  const [{ data: history, loading: historyLoading }, refetchHistory] = useAxios(
    "/api/GodStoneShop/history"
  );
  const [{ data: purchaseResponse, loading: purchaseLoading, error: purchaseError }, doPurchase] =
    useAxios(
      {
        url: "/api/GodStoneShop/purchase",
        method: "POST",
      },
      { manual: true }
    );

  useEffect(() => {
    window.document.title = "女神石兌換商店";
  }, []);

  useEffect(() => {
    if (!purchaseResponse || purchaseLoading) return;

    setBarState({
      open: true,
      severity: purchaseError ? "error" : "success",
      message: purchaseError ? get(purchaseResponse, "error", "未知錯誤") : "兌換成功！",
    });
    refetchHistory();

    return () => {};
  }, [purchaseResponse, purchaseLoading, purchaseError]);

  const list = useMemo(() => {
    if (!data || !history) return [];
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

  useEffect(() => {
    // 等商品清單載入完畢後再做檢查
    if (list.length === 0) return;
    // 有帶入 queryString 有可能是從 LINE Client 端進來的，應該是要直接兌換角色
    const exchangeId = query.get("exchangeId");
    if (!exchangeId) {
      return;
    }

    const target = list.find(item => item.itemId == exchangeId);
    if (!target || queryState.asked === true) {
      return;
    }

    handlePurchase(target);
    setQueryState({ asked: true });
  }, [query, list]);

  if (loading) return <DotsLoading />;

  const handlePurchase = async item => {
    const { price } = item;
    const godStone = get(history, "godStone", 0);

    if (godStone < price) {
      setBarState({
        open: true,
        message: "女神石不足！",
        severity: "error",
      });
      return;
    } else {
      setDialog({
        open: true,
        title: "購買",
        description: `您將花費 ${price} 女神石，確定購買 ${item.name} 嗎？`,
        submitAction: () => {
          // 進行購買動作
          doPurchase({
            data: {
              itemId: item.itemId,
              itemCount: 1,
            },
          });

          // 順便關掉 Dialog
          handleCloseDialog();
        },
      });
    }
  };

  const handleCloseBar = () => setBarState(old => ({ ...old, open: false }));
  const handleCloseDialog = () => setDialog(old => ({ ...old, open: false }));

  return (
    <Grid container direction="column" spacing={3}>
      <Grid item>
        <Alert severity="info">
          <AlertTitle>提示</AlertTitle>
          您的女神石目前還有
          <strong>{` ${get(history, "godStone", "-")} `}</strong>個
        </Alert>
      </Grid>
      <Grid item container spacing={2}>
        {list.map((char, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <CharacterCard {...char} onClick={() => handlePurchase(char)} />
          </Grid>
        ))}
      </Grid>
      <Snackbar open={barState.open} autoHideDuration={6000} onClose={handleCloseBar}>
        <Alert elevation={6} variant="filled" onClose={handleCloseBar} severity={barState.severity}>
          {barState.message}
        </Alert>
      </Snackbar>
      {(purchaseLoading || historyLoading) && <DotsLoading />}
      <AlertDialog
        open={dialog.open}
        title={dialog.title}
        description={dialog.description}
        onSubmit={dialog.submitAction}
        onCancel={handleCloseDialog}
        handleClose={handleCloseDialog}
        submitText="確定"
        cancelText="取消"
      />
    </Grid>
  );
};

export default GodStoneShop;
