import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Avatar,
  Chip,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Skeleton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import TerminalIcon from "@mui/icons-material/Terminal";
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

const TOUCH_TYPE_MAP = { 1: "全符合", 2: "關鍵字符合" };

/* ---------- Loading Skeleton ---------- */
function GlobalOrderSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rounded" height={72} animation="wave" />
      ))}
    </Box>
  );
}

/* ---------- Order Row ---------- */
function OrderRow({ row, onEdit, onDelete }) {
  const touchLabel = TOUCH_TYPE_MAP[row.touchType] || String(row.touchType);
  const isKeyword = String(row.touchType) === "2";

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
      <Avatar
        alt={row.senderName || "預設"}
        src={row.senderIcon || ""}
        sx={{ width: 48, height: 48, flexShrink: 0 }}
      >
        {(row.senderName || "預").charAt(0)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
          {row.order}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75, mt: 0.5, flexWrap: "wrap", alignItems: "center" }}>
          <Chip
            label={touchLabel}
            size="small"
            color={isKeyword ? "warning" : "primary"}
            variant="outlined"
          />
          {row.senderName && (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              {row.senderName}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
        <Tooltip title="編輯">
          <IconButton size="small" onClick={() => onEdit(row)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="刪除">
          <IconButton size="small" color="error" onClick={() => onDelete(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

/* ---------- Main Component ---------- */
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
    document.title = "全群指令管理";
    fetchData();
  }, [fetchData]);

  const handleOpenAdd = () => {
    setEditingOrder(NEW_ORDER_TEMPLATE);
    setOrderDialogOpen(true);
  };

  const handleOpenEdit = row => {
    setEditingOrder(row);
    setOrderDialogOpen(true);
  };

  const handleDialogClose = () => {
    setOrderDialogOpen(false);
    setEditingOrder(null);
  };

  const handleSave = async orderData => {
    if (!orderData.order || orderData.order.trim() === "") return;
    if (!Array.isArray(orderData.replyDatas)) return;
    orderData.replyDatas = orderData.replyDatas.filter(d => d.reply !== "");

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

  const handleDeleteClick = row => {
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

  if (loading && rows.length === 0) {
    return <GlobalOrderSkeleton />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Gradient Banner */}
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          }}
        />
        <Box
          sx={{
            position: "relative",
            px: { xs: 2.5, sm: 3 },
            py: { xs: 2.5, sm: 3 },
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <TerminalIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)", flexShrink: 0 }} />
          <Box sx={{ color: "#fff", flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              全群指令管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`${rows.length} 個指令`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
            }}
          >
            新增指令
          </Button>
        </Box>
      </Paper>
      {/* Command List */}
      {rows.length === 0 ? (
        <Paper sx={{ py: 6, textAlign: "center", borderRadius: 3 }}>
          <TerminalIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
          <Typography
            sx={{
              color: "text.secondary",
            }}
          >
            尚無指令資料
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
          {rows.map((row, i) => (
            <Box key={row.orderKey}>
              {i > 0 && <Divider />}
              <OrderRow row={row} onEdit={handleOpenEdit} onDelete={handleDeleteClick} />
            </Box>
          ))}
        </Paper>
      )}
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
