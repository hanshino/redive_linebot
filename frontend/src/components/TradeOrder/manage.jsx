import React, { useEffect, useState } from "react";
import useAxios from "axios-hooks";
import { CirclesLoading } from "../Loading";
import AlertLogin from "../AlertLogin";
import { Grid, IconButton, Paper, Typography } from "@material-ui/core";
import { DataGrid } from "@mui/x-data-grid";
import Chip from "@material-ui/core/Chip";
import { Done as DoneIcon } from "@material-ui/icons";
import SettingsIcon from "@material-ui/icons/Settings";
import { Link } from "react-router-dom";
import { get } from "lodash";

const { liff } = window;

const genStatusCell = params => {
  const status = params.value;
  const props = { size: "small", onDelete: () => {} };

  switch (status) {
    case 1:
      props.label = "已交易";
      props.deleteIcon = <DoneIcon />;
      props.color = "primary";
      props.clickable = true;
      break;
    case 0:
      props.label = "未交易";
      props.clickable = true;
      break;
    case -1:
      props.label = "已取消";
      props.color = "secondary";
      props.clickable = true;
      break;
    default:
  }

  return <Chip size="small" {...props} />;
};

const ShareButton = params => {
  const { value } = params;
  const status = get(params, "row.status", -1);
  const disabled = status !== 0;

  return (
    <IconButton color="primary" component={Link} to={`/Trade/${value}/Detail`} disabled={disabled}>
      <SettingsIcon />
    </IconButton>
  );
};

const columns = [
  {
    field: "item_id",
    headerName: "商品ID",
    description: "這東西代表著該交易對象的商品",
  },
  {
    field: "sell_target_list",
    headerName: "交易對象",
  },
  {
    field: "price",
    headerName: "價格",
    type: "number",
  },
  {
    field: "status",
    headerName: "狀態",
    renderCell: genStatusCell,
  },
  {
    field: "id",
    headerName: "操作",
    renderCell: ShareButton,
  },
  {
    field: "created_at",
    headerName: "建立時間",
    minWidth: 150,
    type: "dateTime",
  },
  {
    field: "updated_at",
    headerName: "更新時間",
    minWidth: 150,
    type: "dateTime",
  },
  {
    field: "sold_at",
    headerName: "交易時間",
    minWidth: 150,
    type: "dateTime",
  },
  {
    field: "closed_at",
    headerName: "關閉時間",
    minWidth: 150,
    type: "dateTime",
  },
];

const Manage = () => {
  const [page, setPage] = useState(0);
  const [{ data: marketList = [], loading }, fetchMarketList] = useAxios(
    {
      url: "/api/Trade",
      params: {
        page: page + 1,
        per_page: 10,
      },
    },
    {
      manual: true,
    }
  );
  const isLoggedIn = liff.isLoggedIn();

  useEffect(() => {
    (() => {
      if (!isLoggedIn) return;
      fetchMarketList();
    })();

    return () => {};
  }, [isLoggedIn, fetchMarketList]);

  const handlePageChange = newPage => {
    setPage(newPage);
    fetchMarketList({
      params: {
        page: newPage + 1,
        per_page: 10,
      },
    });
  };

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = loading;

  return (
    <Grid container direction="column" spacing={2}>
      {pageLoading && <CirclesLoading />}
      <Grid item>
        <Typography variant="h5">交易管理</Typography>
        <Typography variant="subtitle2">可以在這裡管理您的交易訂單</Typography>
      </Grid>
      <Grid item>
        <Paper style={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={marketList}
            loading={pageLoading}
            pageSize={10}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPageOptions={[10]}
            pagination
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
          />
        </Paper>
      </Grid>
    </Grid>
  );
};

export default Manage;
