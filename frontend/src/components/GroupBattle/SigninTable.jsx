import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Box, Grid, Paper, Typography, Pagination, Skeleton, Avatar,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import LinearProgress from "@mui/material/LinearProgress";
import * as GroupAPI from "../../services/group";

function CustomLoadingOverlay() {
  return (
    <GridOverlay>
      <LinearProgress color="secondary" sx={{ position: "absolute", top: 0, width: "100%" }} />
    </GridOverlay>
  );
}

/**
 * Process sign-in data: extract unique dates & build row objects
 */
function processSignData(signDatas) {
  let dates = [];
  signDatas.forEach((data) => {
    dates = [...dates, ...data.signDates];
  });
  dates = [...new Set(dates)].sort((a, b) => a - b);

  const rows = signDatas.map((userData, index) => {
    const row = { id: index, ...userData };
    dates.forEach((date) => {
      row[`d${date}`] = userData.signDates.includes(date) ? "Y" : "N";
    });
    return row;
  });

  return { dates, rows };
}

export default function SigninTable() {
  const { groupId } = useParams();
  const [signDatas, setSignDatas] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "三刀簽到表";
  }, []);

  useEffect(() => {
    setLoading(true);
    GroupAPI.getSignList(groupId, month)
      .then((result) => setSignDatas(result))
      .catch(() => setSignDatas([]))
      .finally(() => setLoading(false));
  }, [month, groupId]);

  const { dates, rows } = useMemo(() => processSignData(signDatas), [signDatas]);

  const columns = useMemo(() => {
    const base = [
      {
        field: "pictureUrl",
        headerName: "頭像",
        width: 70,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Avatar src={params.value} alt={params.row.displayName} sx={{ width: 32, height: 32 }} />
        ),
      },
      { field: "displayName", headerName: "成員姓名", flex: 1, minWidth: 120 },
    ];

    const dateCols = dates
      .filter((date) => date > 23)
      .map((date) => ({
        field: `d${date}`,
        headerName: `${month}/${date}`,
        width: 80,
        sortable: false,
        renderCell: (params) =>
          params.value === "Y" ? (
            <CheckIcon color="primary" fontSize="small" />
          ) : (
            <CloseIcon color="error" fontSize="small" />
          ),
      }));

    return [...base, ...dateCols];
  }, [dates, month]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Grid container direction="column" alignItems="center" spacing={1}>
          <Grid>
            <Typography variant="h6">月份</Typography>
          </Grid>
          <Grid>
            <Pagination
              count={12}
              page={month}
              variant="outlined"
              color="primary"
              boundaryCount={1}
              siblingCount={0}
              onChange={(_, page) => setMonth(page)}
            />
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Skeleton variant="rectangular" height={400} />
      ) : (
        <Paper sx={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={rows}
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            disableRowSelectionOnClick
            loading={loading}
            slots={{ loadingOverlay: CustomLoadingOverlay }}
            initialState={{
              pagination: { paginationModel: { pageSize: 30 } },
            }}
            pageSizeOptions={[10, 20, 30]}
            sx={{ border: 0 }}
          />
        </Paper>
      )}
    </Box>
  );
}
