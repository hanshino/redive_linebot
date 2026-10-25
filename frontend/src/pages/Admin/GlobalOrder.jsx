import { useState, useEffect, useCallback } from "react";
import {
  Box,
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
import LoadError from "../../components/LoadError";
import PageHero, { HeroButton } from "../../components/PageHero";
import OrderDialog from "../../components/OrderDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as globalOrderService from "../../services/globalOrder";
import { errorText } from "./_errors";

const NEW_ORDER_TEMPLATE = {
  order: "",
  touchType: "1",
  senderIcon: "",
  senderName: "",
  orderKey: "",
  replyDatas: [{ no: 0, messageType: "text", reply: "" }],
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
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
        <Tooltip title="編輯">
          <IconButton
            aria-label={`編輯指令 ${row.order}`}
            onClick={() => onEdit(row)}
            sx={{ width: 44, height: 44 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="刪除">
          <IconButton
            aria-label={`刪除指令 ${row.order}`}
            color="error"
            onClick={() => onDelete(row)}
            sx={{ width: 44, height: 44 }}
          >
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
  const [error, setError] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await globalOrderService.fetchDatas();
      setRows(data || []);
    } catch {
      // 失敗不能顯示成「尚無指令資料」，清掉列表並改顯示 LoadError
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // OrderDialog 自己會擋空白指令並處理送出中的狀態，這裡只是最後一道防線。
  // 成功才關閉對話框；失敗時它會留著，已填的內容不會消失。
  const handleSave = async data => {
    const command = (data.order || "").trim();
    if (!command) {
      showHint("請先填寫指令文字再儲存。", "warning");
      return;
    }
    if (!Array.isArray(data.replyDatas)) return;
    const orderData = { ...data, replyDatas: data.replyDatas.filter(d => d.reply !== "") };

    const isInsert =
      !Object.prototype.hasOwnProperty.call(orderData, "orderKey") ||
      !orderData.orderKey ||
      orderData.orderKey.trim() === "";

    try {
      if (isInsert) {
        await globalOrderService.insertData(orderData);
      } else {
        await globalOrderService.updateData(orderData);
      }
      showHint(isInsert ? `已新增指令「${command}」` : `已更新指令「${command}」`, "success");
      handleDialogClose();
      fetchData();
    } catch (e) {
      const expired = e.response?.status === 401;
      showHint(
        errorText(
          e,
          expired
            ? "登入已過期，請重新登入後再儲存。"
            : "儲存指令失敗，內容還沒儲存，請檢查網路後再試一次。"
        ),
        "error"
      );
    }
  };

  const handleDeleteClick = row => {
    showAlert({
      title: "刪除指令",
      description: `「${row.order}」會在所有群組失效，無法復原。`,
      submitText: "刪除",
      destructive: true,
      onSubmit: async () => {
        setBusy(true);
        try {
          await globalOrderService.deleteData(row.orderKey);
          closeAlert();
          showHint(`已刪除指令「${row.order}」`, "success");
          fetchData();
        } catch (e) {
          // 失敗時保留確認框，讓管理員可以重試或取消
          setBusy(false);
          showHint(errorText(e, `刪除「${row.order}」失敗，指令還在，請稍後再試。`), "error");
        }
      },
    });
  };

  if (error) {
    return <LoadError message="全群指令載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />;
  }

  if (loading && rows.length === 0) {
    return <GlobalOrderSkeleton />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <PageHero icon={<TerminalIcon />} title="全群指令管理" subtitle={`${rows.length} 個指令`}>
        <HeroButton startIcon={<AddIcon />} onClick={handleOpenAdd}>
          新增指令
        </HeroButton>
      </PageHero>
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
        submitText={alertState.submitText}
        destructive={alertState.destructive}
        busy={alertState.busy}
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
