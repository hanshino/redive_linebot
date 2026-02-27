import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import OrderDialog from "../../components/OrderDialog";
import * as CustomerOrderAPI from "../../services/customerOrder";
import useLiff from "../../context/useLiff";

const TOUCH_TYPE_MAP = { 1: "全符合", 2: "關鍵字符合" };
const STATUS_MAP = { 1: "啟用", 0: "關閉" };

/**
 * Aggregates flat order rows (one per reply) into grouped rows (one per orderKey).
 */
function arrangeOrderDatas(orderDatas) {
  if (!orderDatas || orderDatas.length === 0) return [];

  const hashReplies = {};
  orderDatas.forEach((data) => {
    hashReplies[data.orderKey] = hashReplies[data.orderKey] || [];
    hashReplies[data.orderKey].push({
      messageType: data.messageType,
      reply: data.reply,
      no: data.no,
    });
  });

  return Object.keys(hashReplies).map((orderKey) => {
    const { cusOrder, touchType, status, senderName, senderIcon } =
      orderDatas.find((d) => d.orderKey === orderKey);
    return {
      orderKey,
      order: cusOrder,
      touchType,
      replyDatas: hashReplies[orderKey],
      status,
      senderName,
      senderIcon,
    };
  });
}

export default function CustomerOrder() {
  const { loggedIn: isLoggedIn } = useLiff();
  const { sourceId } = useParams();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState(null);
  const [snackbar, { handleOpen: showSnack, handleClose: closeSnack }] = useHintBar();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await CustomerOrderAPI.fetchOrders(sourceId);
      setOrders(arrangeOrderDatas(resp));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    document.title = "自訂指令管理頁面";
    fetchData();
  }, [fetchData]);

  const handleOpenNew = useCallback(() => {
    setDialogData({
      order: "",
      touchType: "1",
      senderIcon: "",
      senderName: "",
      orderKey: "",
      replyDatas: [{ no: 0, messageType: "text", reply: "回覆內容" }],
    });
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setDialogData(row);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setDialogData(null);
  }, []);

  const handleSave = useCallback(
    async (orderData) => {
      if (!orderData.order || orderData.order === "") return;
      if (!Array.isArray(orderData.replyDatas)) return;

      orderData.replyDatas = orderData.replyDatas.filter((d) => d.reply !== "");

      const isInsert =
        !Object.prototype.hasOwnProperty.call(orderData, "orderKey") ||
        orderData.orderKey.trim() === "";

      setLoading(true);
      try {
        if (isInsert) {
          await CustomerOrderAPI.insertOrder(sourceId, orderData);
        } else {
          await CustomerOrderAPI.updateOrder(sourceId, orderData);
        }
        showSnack("成功！", "success");
        handleDialogClose();
        await fetchData();
      } catch {
        setLoading(false);
        showSnack("操作失敗，是否尚未登入？ 或是 網路異常", "warning");
      }
    },
    [sourceId, fetchData, showSnack, handleDialogClose]
  );

  const handleModifyStatus = useCallback(
    async (orderKey, status) => {
      try {
        await CustomerOrderAPI.setOrderStatus(sourceId, orderKey, status);
        showSnack("成功！", "success");
        await fetchData();
      } catch {
        showSnack("操作失敗", "error");
      }
    },
    [sourceId, fetchData, showSnack]
  );

  const columns = useMemo(
    () => [
      {
        field: "order",
        headerName: "指令",
        flex: 1,
        minWidth: 120,
      },
      {
        field: "touchType",
        headerName: "觸發方式",
        width: 120,
        valueFormatter: (value) => TOUCH_TYPE_MAP[value] || value,
      },
      {
        field: "status",
        headerName: "狀態",
        width: 90,
        renderCell: (params) => (
          <Chip
            label={STATUS_MAP[params.value] || params.value}
            size="small"
            color={params.value === 1 ? "success" : "default"}
            variant={params.value === 1 ? "filled" : "outlined"}
          />
        ),
      },
      {
        field: "senderName",
        headerName: "發送名",
        width: 100,
        valueFormatter: (value) => value || "預設",
      },
      {
        field: "senderIcon",
        headerName: "發送頭像",
        width: 80,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const icon = params.value || null;
          const name = params.row.senderName || "預設";
          return <Avatar alt={name} src={icon} sx={{ width: 32, height: 32 }} />;
        },
      },
      {
        field: "actions",
        headerName: "操作",
        width: 120,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const row = params.row;
          return (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="編輯">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => handleEdit(row)}
                    disabled={row.status === 0 || !isLoggedIn}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {row.status === 1 ? (
                <Tooltip title="刪除指令">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleModifyStatus(row.orderKey, 0)}
                      disabled={!isLoggedIn}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : (
                <Tooltip title="回復指令">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleModifyStatus(row.orderKey, 1)}
                      disabled={!isLoggedIn}
                    >
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
    ],
    [isLoggedIn, handleEdit, handleModifyStatus]
  );

  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>注意事項</AlertTitle>
        <li>兩個月未觸發指令進行刪除</li>
        <li>相同指令、回覆，無法重複新增</li>
        <li>完全符合的指令優先觸發</li>
      </Alert>

      {!isLoggedIn && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          按右上登入才可進行指令的修改動作
        </Alert>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNew}>
          新增指令
        </Button>
      </Box>

      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={orders}
          columns={columns}
          getRowId={(row) => row.orderKey}
          autoHeight
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          disableRowSelectionOnClick
          loading={loading}
          sx={{
            "& .MuiDataGrid-cell": {
              display: "flex",
              alignItems: "center",
            },
          }}
        />
      </Box>

      <FullPageLoading open={loading} />

      <OrderDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSave={handleSave}
        data={dialogData}
      />

      <HintSnackBar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={closeSnack}
      />
    </>
  );
}
