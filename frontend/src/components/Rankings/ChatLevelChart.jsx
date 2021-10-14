import React, { useMemo } from "react";
import Paper from "@material-ui/core/Paper";
import useAxios from "axios-hooks";
import Grid from "@material-ui/core/Grid";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import Typography from "@material-ui/core/Typography";
import LinearProgress from "@material-ui/core/LinearProgress";

const columns = [
  {
    field: "rank",
    headerName: "#",
  },
  {
    field: "displayName",
    headerName: "暱稱",
    width: 150,
  },
  {
    field: "experience",
    headerName: "經驗值",
    width: 150,
  },
  {
    field: "level",
    headerName: "等級",
    width: 150,
  },
];

const CustomLoadingOverlay = () => {
  return (
    <GridOverlay>
      <div style={{ position: "absolute", top: 0, width: "100%" }}>
        <LinearProgress color="secondary" />
      </div>
    </GridOverlay>
  );
};

const ChatLevelChart = () => {
  const [{ data, loading }] = useAxios("/api/Chat/Level/Rank");

  let rankingDatas = useMemo(() => {
    if (!data) return [];
    return data
      .slice(0, 51)
      .reverse()
      .map((d, i) => ({ id: i, ...d }));
  }, [data]);

  return (
    <Grid container item xs={12} sm={12} justifyContent="center">
      <Grid item xs={12}>
        <Typography variant="h5" component="h5" style={{ marginBottom: "5px" }}>
          等級排行榜
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Paper style={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={rankingDatas}
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            loading={loading}
            components={{
              LoadingOverlay: CustomLoadingOverlay,
            }}
          />
        </Paper>
      </Grid>
    </Grid>
  );
};

export default ChatLevelChart;
