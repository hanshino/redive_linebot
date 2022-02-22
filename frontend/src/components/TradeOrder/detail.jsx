import React, { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams } from "react-router-dom";
import { Grid, Typography, Paper, Button } from "@material-ui/core";

const { liff } = window;

const Detail = () => {
  const { marketId } = useParams();
  const [{ data = [], loading }, fetchDetail] = useAxios(`/api/Market/${marketId}`, {
    manual: true,
  });
  const isLoggedIn = liff.isLoggedIn();

  useEffect(() => {
    (() => {
      if (!isLoggedIn) return;
      fetchDetail();
    })();

    return () => {};
  }, [fetchDetail, isLoggedIn]);

  return (
    <Grid container spacing={2} direction="column">
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
            <Button color="secondary" variant="contained" fullWidth>
              取消交易
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button color="primary" variant="contained" fullWidth>
              通知對方
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default Detail;
