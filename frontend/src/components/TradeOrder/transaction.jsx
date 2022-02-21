import React, { useEffect } from "react";
import useAxios from "axios-hooks";
import AlertLogin from "../AlertLogin";
import { useParams } from "react-router-dom";
import { CirclesLoading } from "../Loading";
import { Grid } from "@material-ui/core";
import { get } from "lodash";
import HintSnackBar, { useHintBar } from "../HintSnackBar";
import AlertDialog, { useAlertDialog } from "../AlertDialog";

const { liff } = window;

const Transaction = () => {
  const [{ data: marketData, loading, error: marketError }, fetchTrade] = useAxios(
    {},
    { manual: true }
  );
  const [{ data: tradeData, loading: tradeLoading, error: tradeError }, doTransaction] = useAxios(
    {},
    { manual: true }
  );
  const [{ message, severity, open }, { handleOpen, handleClose }] = useHintBar();
  const [
    { open: alertOpen, state: alertState },
    { handleOpen: alertHandleOpen, handleClose: alertHandleClose },
  ] = useAlertDialog();
  const { title, description, submitText, cancelText } = alertState;
  const isLoggedIn = liff.isLoggedIn();
  const { marketId } = useParams();

  const handleFinish = () => {
    setTimeout(() => {
      if (liff.isInClient()) {
        liff.closeWindow();
      } else {
        window.location.href = "/";
      }
    }, 3000);
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchTrade({
      url: `/api/Market/${marketId}`,
    });
  }, [isLoggedIn, marketId, fetchTrade]);

  useEffect(() => {
    // 處理獲取交易資料的情境
    if (marketError) {
      handleOpen(get(marketError, "response.data.message"), "error");
      handleFinish();
    }
  }, [marketError]);

  useEffect(() => {
    if (marketError) return;
    if (!marketData) return;

    const sellerId = get(marketData, "seller_id");
    const { userId } = liff.getContext();

    if (sellerId === userId) {
      handleOpen("此為您自己開設的交易，請等候對方完成交易，3秒後自動關閉視窗", "warning");
      handleFinish();
    } else if (get(marketData, "status", -1) !== 0) {
      handleOpen("此交易已經完成", "warning");
      handleFinish();
    } else {
      alertHandleOpen({
        title: "確認交易",
        description: `您將要花費 ${marketData.price} 元 買入 ${marketData.name} ，確定要進行交易嗎？`,
        submitText: "確定",
        cancelText: "取消",
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

  if (!isLoggedIn) return <AlertLogin />;

  const pageLoading = loading || tradeLoading;

  return (
    <Grid container>
      {pageLoading && <CirclesLoading />}
      <HintSnackBar {...{ message, severity, open, handleClose }} />
      <AlertDialog
        {...{
          open: alertOpen,
          handleClose: alertHandleClose,
          title,
          description,
          submitText,
          cancelText,
        }}
        onSubmit={() => {
          alertHandleClose();
          doTransaction({
            url: `/api/Market/${marketId}/Transaction`,
            method: "POST",
          });
        }}
        onCancel={() => {
          alertHandleClose();
          handleOpen("交易取消", "warning");
          handleFinish();
        }}
      />
    </Grid>
  );
};

export default Transaction;
