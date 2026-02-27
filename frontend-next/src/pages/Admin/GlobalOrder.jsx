import { useState, useEffect, useCallback } from "react";
import { Box, Button, Avatar, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import OrderDialog from "../../components/OrderDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as globalOrderService from "../../services/globalOrder";

const NEW_ORDER_TEMPLATE = {
  order: "",
  touchType: "1",
  senderIcon: "",
  senderName: "",
  orderKey: "",
  replyDatas: [{ no: 0, messageType: "text", reply: "回覆內容" }],
};

export default function AdminGlobalOrder() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await globalOrderService.fetchDatas();
      setRows(data || []);
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "指令管理頁面";
    fetchData();
  }, [fetchData]);

  const handleOpenAdd = () => {
    setEditingOrder(NEW_ORDER_TEMPLATE);
    setOrderDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setEditingOrder(row);
    setOrderDialogOpen(true);
  };

  const handleDialogClose = () => {
    setOrderDialogOpen(false);
    setEditingOrder(null);
  };

  const handleSave = async (orderData) => {
    if (!orderData.order || orderData.order.trim() === "") return;
    if (!Array.isArray(orderData.replyDatas)) return;
    orderData.replyDatas = orderData.replyDatas.filter((d) => d.reply !== "");

    const isInsert =
      !Object.prototype.hasOwnProperty.call(orderData, "orderKey") ||
      !orderData.orderKey ||
      orderData.orderKey.trim() === "";

    try {
      setLoading(true);
      if (isInsert) {
        await globalOrderService.insertData(orderData);
      } else {
        await globalOrderService.updateData(orderData);
      }
      showHint("成功！", "success");
      handleDialogClose();
      fetchData();
    } catch {
      showHint("操作失敗，是否尚未登入？ 或是 網路異常", "warning");
      setLoading(false);
    }
  };

  const handleDeleteClick = (row) => {
    showAlert({
      title: "確認刪除",
      description: `確定要刪除指令「${row.order}」嗎？`,
      onSubmit: async () => {
        try {
          await globalOrderService.deleteData(row.orderKey);
          showHint("成功！", "success");
          fetchData();
        } catch {
          showHint("刪除失敗", "error");
        } finally {
          closeAlert();
        }
      },
    });
  };

  const touchTypeMap = { 1: "全符合", 2: "關鍵字符合" };

  const columns = [
    { field: "order", headerName: "指令", flex: 1, minWidth: 150 },
    {
      field: "touchType",
      headerName: "觸發方式",
      width: 130,
      valueFormatter: (value) => touchTypeMap[value] || value,
    },
    {
      field: "senderName",
      headerName: "發送名",
      width: 130,
      valueFormatter: (value) => value || "預設",
    },
    {
      field: "senderIcon",
      headerName: "發送頭像",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar
          alt={params.row.senderName || "預設"}
          src={params.value || ""}
          sx={{ width: 36, height: 36 }}
        />
      ),
    },
    {
      field: "actions",
      headerName: "操作",
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Button size="small" onClick={() => handleOpenEdit(params.row)}>
            <EditIcon fontSize="small" />
          </Button>
          <Button size="small" color="error" onClick={() => handleDeleteClick(params.row)}>
            <DeleteIcon fontSize="small" />
          </Button>
        </Box>
      ),
    },
  ];

  if (loading && rows.length === 0) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">全群指令管理</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
          新增指令
        </Button>
      </Box>

      <Box sx={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.orderKey}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          disableRowSelectionOnClick
        />
      </Box>

      {/* Order Add/Edit Dialog */}
      <OrderDialog
        open={orderDialogOpen}
        onClose={handleDialogClose}
        onSave={handleSave}
        data={editingOrder}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={alertState.open}
        onClose={closeAlert}
        onSubmit={alertState.onSubmit}
        onCancel={closeAlert}
        title={alertState.title}
        description={alertState.description}
      />

      {/* Snackbar */}
      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
