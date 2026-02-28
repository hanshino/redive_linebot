import { useEffect, useState } from "react";
import useAxios from "axios-hooks";
import { Grid, IconButton, Paper, Typography, Chip } from "@mui/material";
import { Done as DoneIcon, Settings as SettingsIcon } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { Link } from "react-router-dom";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import useLiff from "../../context/useLiff";

function genStatusCell(params) {
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
}

function ShareButton(params) {
  const { value } = params;
  const status = get(params, "row.status", -1);
  const disabled = status !== 0;

  return (
    <IconButton
      color="primary"
      component={Link}
      to={`/trade/${value}/detail`}
      disabled={disabled}
    >
      <SettingsIcon />
    </IconButton>
  );
}

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

export default function TradeManage() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [{ data: marketList = [], loading }, fetchMarketList] = useAxios(
    {
      url: "/api/trades",
      params: {
        page: paginationModel.page + 1,
        per_page: paginationModel.pageSize,
      },
    },
    { manual: true }
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchMarketList();
  }, [isLoggedIn, fetchMarketList]);

  const handlePaginationModelChange = (newModel) => {
    setPaginationModel(newModel);
    fetchMarketList({
      params: {
        page: newModel.page + 1,
        per_page: newModel.pageSize,
      },
    });
  };

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  return (
    <Grid container direction="column" spacing={2}>
      {loading && <FullPageLoading />}
      <Grid>
        <Typography variant="h5">交易管理</Typography>
        <Typography variant="subtitle2">可以在這裡管理您的交易訂單</Typography>
      </Grid>
      <Grid>
        <Paper sx={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={marketList}
            loading={loading}
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            pageSizeOptions={[10]}
            pagination
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
          />
        </Paper>
      </Grid>
    </Grid>
  );
}
