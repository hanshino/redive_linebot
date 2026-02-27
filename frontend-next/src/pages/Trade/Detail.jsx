import { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import { Grid, Typography, Paper, Button } from "@mui/material";
import { get } from "lodash";
import { FullPageLoading } from "../../components/Loading";
import { genNotify } from "../../flex/TradeNotify";
import liff from "@line/liff";
import useLiff from "../../context/useLiff";

export default function TradeDetail() {
  const { loggedIn: isLoggedIn } = useLiff();
  const { marketId } = useParams();
  const navigate = useNavigate();
  const [{ data = [], loading }, fetchDetail] = useAxios(`/api/Market/${marketId}`, {
    manual: true,
  });
  const [{ data: cancelRes, loading: cancelLoading, error: cancelError }, cancelOrder] = useAxios(
    {
      url: `/api/Market/${marketId}/Transaction`,
      method: "DELETE",
    },
    { manual: true }
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchDetail();
  }, [fetchDetail, isLoggedIn]);

  useEffect(() => {
    if (cancelRes && !cancelError) {
      navigate("/trade/manage");
    } else if (!cancelRes && cancelError) {
      alert("取消交易失敗");
    }
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
      {pageLoading && <FullPageLoading />}
      <Grid>
        <Typography variant="h5">交易詳情</Typography>
      </Grid>
      <Grid container component={Paper} spacing={2} sx={{ p: 2 }}>
        <Grid>
          <Typography variant="subtitle1" color="textSecondary">
            #{data.id}
          </Typography>
        </Grid>
        <Grid container spacing={3}>
          <Grid>
            <img src={data.image} alt={data.name} />
          </Grid>
          <Grid>
            <Typography variant="h6">{data.name}</Typography>
            <Typography variant="subtitle2" color="textSecondary">
              道具編號：{data.item_id}
            </Typography>
          </Grid>
        </Grid>
        <Grid container justifyContent="flex-end">
          <Grid>
            <Typography variant="subtitle2" color="textPrimary">
              要求：<strong>{data.price}</strong> 女神石
            </Typography>
          </Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <Button color="secondary" variant="contained" fullWidth onClick={handleCancel}>
              取消交易
            </Button>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Button color="primary" variant="contained" fullWidth onClick={handleNotify}>
              通知對方
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
