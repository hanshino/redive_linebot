import { Button, Grid, makeStyles, Typography } from "@material-ui/core";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";
import { get } from "lodash";
import React from "react";
import { useEffect } from "react";
import AlertLogin from "../AlertLogin";
import HintSnackBar, { useHintBar } from "../HintSnackBar";
const { liff } = window;

const columns = [
  { field: "name", headerName: "名稱", width: 130 },
  { field: "reward", headerName: "獎金", width: 130 },
  { field: "is_used", headerName: "已兌換", width: 130, type: "boolean" },
];

const useStyle = makeStyles(theme => ({
  root: {
    "& > *": {
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
  },
}));

const ScratchCardExchange = () => {
  const isLoggedIn = liff.isLoggedIn();
  const classes = useStyle();
  const [{ data = [], loading }, refetch] = useAxios("/api/ScratchCard/MyCards", {
    manual: true,
  });
  const [{ data: cardCountData, loading: cardCountLoading }, fetchCount] = useAxios(
    "/api/ScratchCard/MyCards/Count",
    {
      manual: true,
    }
  );
  const [{ data: exchangeData, loading: exchangeLoading, error }, exchange] = useAxios(
    {
      url: "/api/ScratchCard/Exchange",
      method: "PUT",
    },
    { manual: true }
  );
  const [page, setPage] = React.useState(0);
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchCount();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchCards();
  }, [page]);

  useEffect(() => {
    if (!exchangeData) return;

    if (exchangeData) {
      handleOpen(`兌換成功，獲得 ${get(exchangeData, "rewards")}`, "success");
      fetchCards();
    } else {
      handleOpen(get(error, "response.data.message"), "error");
    }
  }, [exchangeData]);

  const fetchCards = () =>
    refetch({
      params: {
        limit: 10,
        offset: page * 10,
      },
    });

  const pageLoading = loading || exchangeLoading || cardCountLoading;

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const hasCardToExchange = data.some(card => !card.is_used);

  return (
    <>
      <Grid container direction="column" className={classes.root}>
        <Grid item>
          <Typography variant="h4">我的刮刮卡</Typography>
        </Grid>
        <Grid container item justifyContent="flex-end">
          <Grid item xs={6} sm={3}>
            <Button
              variant="outlined"
              fullWidth
              color="primary"
              disabled={pageLoading || !hasCardToExchange}
              onClick={exchange}
            >
              一鍵兌換
            </Button>
          </Grid>
        </Grid>
        <Grid item>
          <div style={{ height: 800, width: "100%" }}>
            <DataGrid
              loading={pageLoading}
              rows={data}
              columns={columns}
              pageSize={10}
              pagination
              paginationMode="server"
              disableColumnFilter
              disableColumnMenu
              rowCount={get(cardCountData, "count", 0)}
              onPageChange={page => setPage(page)}
            />
          </div>
        </Grid>
      </Grid>
      <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
    </>
  );
};

export default ScratchCardExchange;
