import { useEffect, useState } from "react";
import useAxios from "axios-hooks";
import { Button, Grid, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";

const { liff } = window;

const columns = [
  { field: "name", headerName: "名稱", width: 130 },
  { field: "reward", headerName: "獎金", width: 130 },
  { field: "is_used", headerName: "已兌換", width: 130, type: "boolean" },
];

export default function ScratchCardExchange() {
  const isLoggedIn = liff.isLoggedIn();
  const [{ data = [], loading }, refetch] = useAxios("/api/ScratchCard/MyCards", {
    manual: true,
  });
  const [{ data: cardCountData, loading: cardCountLoading }, fetchCount] = useAxios(
    "/api/ScratchCard/MyCards/Count",
    { manual: true }
  );
  const [{ data: exchangeData, loading: exchangeLoading, error }, exchange] = useAxios(
    { url: "/api/ScratchCard/Exchange", method: "PUT" },
    { manual: true }
  );
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginationModel.page]);

  useEffect(() => {
    if (!exchangeData) return;

    handleOpen(`兌換成功，獲得 ${get(exchangeData, "rewards")}`, "success");
    fetchCards();

    if (error) {
      handleOpen(get(error, "response.data.message", "兌換失敗"), "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeData]);

  const fetchCards = () =>
    refetch({
      params: {
        limit: paginationModel.pageSize,
        offset: paginationModel.page * paginationModel.pageSize,
      },
    });

  const pageLoading = loading || exchangeLoading || cardCountLoading;

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const hasCardToExchange = data.some((card) => !card.is_used);

  return (
    <>
      <Grid container direction="column" sx={{ "& > *": { my: 1 } }}>
        <Grid>
          <Typography variant="h4">我的刮刮卡</Typography>
        </Grid>
        <Grid container justifyContent="flex-end">
          <Grid size={{ xs: 6, sm: 3 }}>
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
        <Grid>
          <div style={{ height: 800, width: "100%" }}>
            <DataGrid
              loading={pageLoading}
              rows={data}
              columns={columns}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              paginationMode="server"
              rowCount={get(cardCountData, "count", 0)}
              pageSizeOptions={[10]}
              disableColumnFilter
              disableColumnMenu
            />
          </div>
        </Grid>
      </Grid>
      <HintSnackBar open={open} message={message} severity={severity} onClose={handleClose} />
    </>
  );
}
