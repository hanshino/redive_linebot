import React, { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useHistory } from "react-router-dom";
import { Grid, Typography, Paper, Button } from "@material-ui/core";
import { genNotify } from "../../flex/TradeNotify";
import { get } from "lodash";
import { CirclesLoading } from "../Loading";

const { liff } = window;

const Detail = () => {
  const { marketId } = useParams();
  const history = useHistory();
  const [{ data = [], loading }, fetchDetail] = useAxios(`/api/Market/${marketId}`, {
    manual: true,
  });
  const [{ data: cancelRes, cancelLoading, error: cancelError }, cancelOrder] = useAxios(
    {
      url: `/api/Market/${marketId}/Transaction`,
      method: "DELETE",
    },
    {
      manual: true,
    }
  );
  const isLoggedIn = liff.isLoggedIn();

  useEffect(() => {
    (() => {
      if (!isLoggedIn) return;
      fetchDetail();
    })();

    return () => {};
  }, [fetchDetail, isLoggedIn]);

  useEffect(() => {
    (() => {
      if (cancelRes && !cancelError) {
        history.push("/Trade/Manage");
      } else if (!cancelRes && cancelError) {
        alert("取消交易失敗");
      }
    })();

    return () => {};
  }, [cancelError, cancelRes]);

  const handleNotify = () => {
    liff.shareTargetPicker([
      {
        type: "flex",
        altText: "交易邀請",
        contents: genNotify({
          marketId,
          name: get(data, "name"),
          charge: get(data, "price"),
          image: get(data, "image"),
        }),
      },
    ]);
  };

  const handleCancel = () => {
    cancelOrder();
  };

  const pageLoading = loading || cancelLoading;

  return (
    <Grid container spacing={2} direction="column">
      {pageLoading && <CirclesLoading />}
      <Grid item>
        <Typography variant="h5">交易詳情</Typography>
      </Grid>
      <Grid container item component={Paper} spacing={2}>
        <Grid item>
          <Typography variant="subtitle1" color="textSecondary">
            #{data.id}
          </Typography>
        </Grid>
        <Grid container item spacing={3}>
          <Grid item>
            <img src={data.image} alt={data.name} />
          </Grid>
          <Grid item>
            <Typography variant="h6">{data.name}</Typography>
            <Typography variant="subtitle2" color="textSecondary">
              道具編號：{data.item_id}
            </Typography>
          </Grid>
        </Grid>
        <Grid container item justifyContent="flex-end">
          <Grid item>
            <Typography variant="subtitle2" color="textPrimary">
              要求：<strong>{data.price}</strong> 女神石
            </Typography>
          </Grid>
        </Grid>
        <Grid container item spacing={2}>
          <Grid item xs={6}>
            <Button color="secondary" variant="contained" fullWidth onClick={handleCancel}>
              取消交易
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button color="primary" variant="contained" fullWidth onClick={handleNotify}>
              通知對方
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default Detail;
