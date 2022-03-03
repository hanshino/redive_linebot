import React, { useEffect } from "react";
import useAxios from "axios-hooks";
import AlertLogin from "../AlertLogin";
import { useParams, useLocation, useHistory } from "react-router-dom";
import { CirclesLoading } from "../Loading";
import { Grid } from "@material-ui/core";
import { get } from "lodash";
import HintSnackBar, { useHintBar } from "../HintSnackBar";
import AlertDialog, { useAlertDialog } from "../AlertDialog";

const { liff } = window;

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const Transaction = () => {
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
  const [
    { open: alertOpen, state: alertState },
    { handleOpen: alertHandleOpen, handleClose: alertHandleClose },
  ] = useAlertDialog();
  const { title, description, submitText, cancelText, onSubmit, onCancel } = alertState;
  const isLoggedIn = liff.isLoggedIn();
  const { marketId } = useParams();
  const query = useQuery();
  const action = query.get("action");
  const history = useHistory();

  const handleFinish = () => {
    setTimeout(() => {
      if (liff.isInClient()) {
        liff.closeWindow();
      } else {
        history.push("/");
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
    (() => {
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
      } else if (action === "transaction") {
        alertHandleOpen({
          title: "確認交易",
          description: `您將要花費 ${marketData.price} 元 買入 ${marketData.name} ，確定要進行交易嗎？`,
          submitText: "確定",
          cancelText: "取消",
          onSubmit: () => {
            alertHandleClose();
            doTransaction({
              url: `/api/Market/${marketId}/Transaction`,
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
              url: `/api/Market/${marketId}/Transaction`,
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
    })();

    return () => {};
  }, [marketData, marketError]);

  useEffect(() => {
    (() => {
      if (!tradeError) return;
      handleOpen(get(tradeError, "response.data.message"), "error");
      handleFinish();
    })();

    return () => {};
  }, [tradeError]);

  useEffect(() => {
    (() => {
      if (tradeError) return;
      if (!tradeData) return;

      handleOpen("交易成功，3秒後自動關閉視窗", "success");
      handleFinish();
    })();

    return () => {};
  }, [tradeData, tradeError]);

  useEffect(() => {
    (() => {
      if (denyError) return;
      if (!denyData) return;

      handleOpen("交易取消成功，3秒後自動關閉視窗", "success");
      handleFinish();
    })();

    return () => {};
  }, [denyData, denyError]);

  if (!isLoggedIn) return <AlertLogin />;

  const pageLoading = loading || tradeLoading || denyLoading;

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
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Grid>
  );
};

export default Transaction;
