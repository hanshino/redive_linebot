import { useMemo } from "react";
import { Paper, Typography, LinearProgress } from "@mui/material";
import useAxios from "axios-hooks";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";

const columns = [
  { field: "rank", headerName: "#", width: 80 },
  { field: "displayName", headerName: "暱稱", flex: 1, minWidth: 150 },
  { field: "cnt", headerName: "蒐集數量", width: 150 },
];

function CustomLoadingOverlay() {
  return (
    <GridOverlay>
      <LinearProgress color="secondary" sx={{ position: "absolute", top: 0, width: "100%" }} />
    </GridOverlay>
  );
}

export default function GachaRankChart() {
  const [{ data, loading }] = useAxios("/api/Gacha/Rank/0");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.slice(0, 51).map((d, i) => ({ id: i, rank: i + 1, ...d }));
  }, [data]);

  return (
    <Paper sx={{ width: "100%", height: 500 }}>
      <Typography variant="h6" sx={{ p: 2, pb: 0 }}>
        轉蛋蒐集排行
      </Typography>
      <DataGrid
        columns={columns}
        rows={rows}
        disableColumnFilter
        disableColumnSelector
        disableColumnMenu
        disableRowSelectionOnClick
        loading={loading}
        slots={{ loadingOverlay: CustomLoadingOverlay }}
        sx={{ border: 0 }}
      />
    </Paper>
  );
}
