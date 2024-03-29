import React, { useEffect, useRef } from "react";
import useAxios from "axios-hooks";
import AlertLogin from "../AlertLogin";
import { DotsLoading, CirclesLoading } from "../Loading";
import { useLocation } from "react-router-dom";
import HintSnackBar, { useHintBar } from "../HintSnackBar";
import { Grid, TextField, Button, Typography } from "@material-ui/core";
import { Alert, AlertTitle } from "@material-ui/lab";
import { get } from "lodash";
import { genNotify } from "../../flex/TradeNotify";

const { liff } = window;

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const TradeOrder = () => {
  const isLoggedIn = liff.isLoggedIn();
  const seletEl = useRef(null);
  const chargeEl = useRef(null);
  const [{ data = [], loading }, fetchItems] = useAxios("/api/Inventory", { manual: true });
  const [{ data: createResponse, loading: createLoading, error }, createOrder] = useAxios(
    {
      url: "/api/Trade",
      method: "POST",
    },
    { manual: true }
  );
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();
  const query = useQuery();
  const targetId = query.get("target_id");
  const { userId } = liff.getContext();

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchItems();
    return () => {};
  }, [isLoggedIn, fetchItems]);

  useEffect(() => {
    if (!targetId) {
      handleOpen("未指定交易對象", "error");
    }

    return () => {};
  }, [targetId, handleOpen]);

  useEffect(() => {
    (() => {
      if (!error) return;
      handleOpen(get(error, "response.data.message"), "error");
    })();
    return () => {};
  }, [error]);

  const pageLoading = loading || createLoading;

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const handleCancel = () => {
    if (liff.isInClient()) {
      liff.closeWindow();
    } else {
      window.location.href = "/";
    }
  };

  const handleSubmit = () => {
    let payload = {
      targetId,
      itemId: parseInt(seletEl.current.value),
      charge: parseInt(chargeEl.current.value),
    };

    if (get(payload, "charge", 0) <= 0) {
      handleOpen("請輸入收費金額", "error");
    } else {
      createOrder({
        data: payload,
      });
    }
  };

  if (createResponse) {
    return <TradeCreateResult marketId={get(createResponse, "marketId")} />;
  }

  const isSelf = userId === targetId;
  const selfAlert = (
    <Grid item>
      <Alert severity="error">
        <AlertTitle>錯誤</AlertTitle>
        您不能與自己進行交易
      </Alert>
    </Grid>
  );

  return (
    <Grid container direction="column" spacing={2}>
      {pageLoading && <DotsLoading />}
      {isSelf && selfAlert}
      <Grid item>
        <Alert severity="warning">
          <AlertTitle>注意</AlertTitle>
          <Typography variant="inherit" component="p">
            1. 請確認您的交易對象是否已經在您的好友列表中，如果沒有，請先加入好友
          </Typography>
          <Typography variant="inherit">
            2. 交易對象為指令自動帶出，如果您不是要跟對方交易，請直接關閉視窗
          </Typography>
        </Alert>
      </Grid>
      <Grid item container spacing={2}>
        <Grid item xs={12}>
          <TextField label="交易對象" value={targetId} disabled variant="outlined" fullWidth />
        </Grid>
        <Grid item xs={12}>
          <TextField
            select
            label="選擇商品"
            SelectProps={{
              native: true,
            }}
            inputRef={seletEl}
            fullWidth
            variant="outlined"
            helperText="只會列出您擁有的商品"
            autoFocus
            disabled={isSelf}
          >
            {data.map(item => (
              <option key={item.itemId} value={item.itemId}>
                {item.name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="要求女神石"
            type="number"
            variant="outlined"
            defaultValue={0}
            fullWidth
            inputRef={chargeEl}
            helperText="請輸入要求的女神石數量，對方將會支付相應的女神石"
            disabled={isSelf}
          />
        </Grid>
        <Grid item xs={6}>
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            onClick={handleCancel}
            disabled={isSelf}
          >
            取消交易
          </Button>
        </Grid>
        <Grid item xs={6}>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={handleSubmit}
            disabled={isSelf}
          >
            送出交易
          </Button>
        </Grid>
      </Grid>
      <HintSnackBar {...{ open, message, severity, handleClose }} />
    </Grid>
  );
};

const TradeCreateResult = ({ marketId }) => {
  const [{ data: marketData, loading }] = useAxios(`/api/Market/${marketId}`);

  const handleShare = () => {
    liff.shareTargetPicker([
      {
        type: "flex",
        altText: "交易邀請",
        contents: genNotify({
          marketId,
          name: get(marketData, "name"),
          charge: get(marketData, "price"),
          image: get(marketData, "image"),
        }),
      },
    ]);
  };

  if (loading) {
    return <CirclesLoading />;
  }

  return (
    <Grid container direction="column" spacing={2}>
      <Grid item>
        <Typography variant="h5">交易建立成功</Typography>
        <Typography variant="subtitle2">您已經成功建立了一個交易，請等待對方回覆</Typography>
      </Grid>
      <Grid item>
        <Button variant="contained" color="primary" onClick={handleShare}>
          通知對方
        </Button>
      </Grid>
    </Grid>
  );
};

export { default as Transaction } from "./transaction";
export { default as Manage } from "./manage";
export { default as Detail } from "./detail";
export default TradeOrder;
