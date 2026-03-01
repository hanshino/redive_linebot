import { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import { Grid } from "@mui/material";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import AlertDialog from "../../components/AlertDialog";
import useAlertDialog from "../../hooks/useAlertDialog";
import useQuery from "../../hooks/useQuery";
import liff from "@line/liff";
import useLiff from "../../context/useLiff";

export default function TradeTransaction() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const [{ data: marketData, loading, error: marketError }, fetchTrade] = useAxios(
    {},
    { manual: true }
  );
  const [{ data: tradeData, loading: tradeLoading, error: tradeError }, doTransaction] = useAxios(
    {},
    { manual: true }
  );
  const [{ data: denyData, loading: denyLoading, error: denyError }, denyTransaction] = useAxios(
    {},
    { manual: true }
  );
  const [{ message, severity, open }, { handleOpen, handleClose }] = useHintBar();
  const [alertState, { handleOpen: alertHandleOpen, handleClose: alertHandleClose }] =
    useAlertDialog();
  const { open: alertOpen, title, description, submitText, cancelText, onSubmit, onCancel } =
    alertState;
  const { marketId } = useParams();
  const query = useQuery();
  const action = query.get("action");
  const navigate = useNavigate();

  const handleFinish = () => {
    setTimeout(() => {
      if (liff.isInClient()) {
        liff.closeWindow();
      } else {
        navigate("/");
      }
    }, 3000);
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchTrade({
      url: `/api/market/${marketId}`,
    });
  }, [isLoggedIn, marketId, fetchTrade]);

  useEffect(() => {
    if (marketError) {
      handleOpen(get(marketError, "response.data.message"), "error");
      handleFinish();
    }
  }, [marketError]);

  useEffect(() => {
    if (marketError) return;
    if (!marketData) return;

    const sellerId = get(marketData, "seller_id");
    const { userId } = liffContext;

    if (sellerId === userId) {
      handleOpen("此為您自己開設的交易，請等候對方完成交易，3秒後自動關閉視窗", "warning");
      handleFinish();
    } else if (get(marketData, "status", -1) !== 0) {
      handleOpen("此交易已經完成", "warning");
      handleFinish();
    } else if (action === "transaction") {
      alertHandleOpen({
        title: "確認交易",
        description: `您將要花費 ${marketData.price} 元 買入 ${marketData.name} ，確定要進行交易嗎？`,
        submitText: "確定",
        cancelText: "取消",
        onSubmit: () => {
          alertHandleClose();
          doTransaction({
            url: `/api/market/${marketId}/transactions`,
            method: "POST",
          });
        },
        onCancel: () => {
          alertHandleClose();
          handleOpen("將在3秒後關閉視窗", "warning");
          handleFinish();
        },
      });
    } else if (action === "deny") {
      alertHandleOpen({
        title: "拒絕交易",
        description: `您將要拒絕 ${marketData.name} 的交易，確定要拒絕嗎？`,
        submitText: "確定",
        cancelText: "取消",
        onSubmit: () => {
          alertHandleClose();
          denyTransaction({
            url: `/api/market/${marketId}/transactions`,
            method: "DELETE",
          });
        },
        onCancel: () => {
          alertHandleClose();
          handleOpen("將在3秒後關閉視窗", "warning");
          handleFinish();
        },
      });
    }
  }, [marketData, marketError]);

  useEffect(() => {
    if (!tradeError) return;
    handleOpen(get(tradeError, "response.data.message"), "error");
    handleFinish();
  }, [tradeError]);

  useEffect(() => {
    if (tradeError) return;
    if (!tradeData) return;

    handleOpen("交易成功，3秒後自動關閉視窗", "success");
    handleFinish();
  }, [tradeData, tradeError]);

  useEffect(() => {
    if (denyError) return;
    if (!denyData) return;

    handleOpen("交易取消成功，3秒後自動關閉視窗", "success");
    handleFinish();
  }, [denyData, denyError]);

  if (!isLoggedIn) return <AlertLogin />;

  const pageLoading = loading || tradeLoading || denyLoading;

  return (
    <Grid container>
      {pageLoading && <FullPageLoading />}
      <HintSnackBar open={open} message={message} severity={severity} onClose={handleClose} />
      <AlertDialog
        open={alertOpen}
        onClose={alertHandleClose}
        title={title}
        description={description}
        submitText={submitText}
        cancelText={cancelText}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Grid>
  );
}
