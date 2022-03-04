import React, { useMemo } from "react";
import useAxios from "axios-hooks";
import Paper from "@material-ui/core/Paper";
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
    field: "amount",
    headerName: "女神石數量",
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

const GodStoneRankChart = () => {
  const [{ data, loading }] = useAxios("/api/God-Stone/Rank");

  const godStoneData = useMemo(() => {
    if (!data) return [];
    return data.map((d, i) => ({ id: i, rank: i + 1, ...d }));
  }, [data]);

  return (
    <Grid container item xs={12} sm={12} justifyContent="center">
      <Grid item xs={12}>
        <Typography variant="h5" component="h5" style={{ marginBottom: "5px" }}>
          女神石排行
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Paper style={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={godStoneData}
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

export default GodStoneRankChart;
