import { useMemo, useState, useEffect } from "react";
import useAxios from "axios-hooks";
import { Grid, Alert, AlertTitle, Snackbar } from "@mui/material";
import { get } from "lodash";
import { useLocation } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import AlertDialog from "../../components/AlertDialog";
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
  const [queryState, setQueryState] = useState({ asked: false });
  const [barState, setBarState] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [dialog, { handleOpen: openDialog, handleClose: closeDialog }] = useAlertDialog();

  const [{ data, loading }, fetchData] = useAxios("/api/GodStoneShop", {
    manual: true,
  });
  const [{ data: history, loading: historyLoading }, fetchHistory] = useAxios(
    "/api/GodStoneShop/history",
    { manual: true }
  );
  const [{ data: purchaseResponse, loading: purchaseLoading, error: purchaseError }, doPurchase] =
    useAxios(
      { url: "/api/GodStoneShop/purchase", method: "POST" },
      { manual: true }
    );

  useEffect(() => {
    document.title = "女神石兌換商店";
  }, []);

  useEffect(() => {
    if (purchaseLoading) return;
    if (!purchaseResponse && !purchaseError) return;

    setBarState({
      open: true,
      severity: purchaseError ? "error" : "success",
      message: purchaseError ? get(purchaseError, "response.data.error", "未知錯誤") : "兌換成功！",
    });
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseResponse, purchaseLoading, purchaseError]);

  const list = useMemo(() => {
    if (!data || !history) return [];
    const holdingIds = get(history, "holdingList", []).map((item) => item.itemId);

    return data
      .map((item) => ({
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
    if (list.length === 0) return;
    const exchangeId = query.get("exchangeId");
    if (!exchangeId) return;

    const target = list.find((item) => item.itemId == exchangeId);
    if (!target || queryState.asked === true) return;

    handlePurchase(target);
    setQueryState({ asked: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, list]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (loading) return <FullPageLoading />;

  const handlePurchase = (item) => {
    const { price } = item;
    const godStone = get(history, "godStone", 0);

    if (godStone < price) {
      setBarState({
        open: true,
        message: "女神石不足！",
        severity: "error",
      });
      return;
    }

    openDialog({
      title: "購買",
      description: `您將花費 ${price} 女神石，確定購買 ${item.name} 嗎？`,
      onSubmit: () => {
        doPurchase({
          data: {
            itemId: item.itemId,
            itemCount: 1,
          },
        });
        closeDialog();
      },
    });
  };

  const handleCloseBar = () => setBarState((old) => ({ ...old, open: false }));

  return (
    <Grid container direction="column" spacing={3}>
      <Grid>
        <Alert severity="info">
          <AlertTitle>提示</AlertTitle>
          您的女神石目前還有
          <strong>{` ${get(history, "godStone", "-")} `}</strong>個
        </Alert>
      </Grid>
      <Grid container spacing={2}>
        {list.map((char, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
            <CharacterCard
              name={char.name}
              image={char.itemImage}
              price={char.price}
              star={char.star}
              holding={char.holding}
              isEnable={char.isEnable}
              onClick={() => handlePurchase(char)}
            />
          </Grid>
        ))}
      </Grid>
      <Snackbar open={barState.open} autoHideDuration={6000} onClose={handleCloseBar}>
        <Alert
          elevation={6}
          variant="filled"
          onClose={handleCloseBar}
          severity={barState.severity}
        >
          {barState.message}
        </Alert>
      </Snackbar>
      {(purchaseLoading || historyLoading) && <FullPageLoading />}
      <AlertDialog
        open={dialog.open}
        title={dialog.title}
        description={dialog.description}
        onSubmit={dialog.onSubmit}
        onCancel={closeDialog}
        onClose={closeDialog}
        submitText="確定"
        cancelText="取消"
      />
    </Grid>
  );
}
