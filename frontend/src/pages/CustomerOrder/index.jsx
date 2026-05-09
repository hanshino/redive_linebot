import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import TerminalIcon from "@mui/icons-material/Terminal";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import OrderDialog from "../../components/OrderDialog";
import * as CustomerOrderAPI from "../../services/customerOrder";
import useLiff from "../../context/useLiff";

const TOUCH_TYPE_MAP = { 1: "全符合", 2: "關鍵字符合" };

/**
 * Aggregates flat order rows (one per reply) into grouped rows (one per orderKey).
 */
function arrangeOrderDatas(orderDatas) {
  if (!orderDatas || orderDatas.length === 0) return [];

  const hashReplies = {};
  orderDatas.forEach(data => {
    hashReplies[data.orderKey] = hashReplies[data.orderKey] || [];
    hashReplies[data.orderKey].push({
      messageType: data.messageType,
      reply: data.reply,
      no: data.no,
    });
  });

  return Object.keys(hashReplies).map(orderKey => {
    const { cusOrder, touchType, status, senderName, senderIcon } = orderDatas.find(
      d => d.orderKey === orderKey
    );
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

function CustomerOrderSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={92} animation="wave" />
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} variant="rounded" height={72} animation="wave" />
      ))}
    </Box>
  );
}

function OrderRow({ row, isLoggedIn, onEdit, onModifyStatus }) {
  const isActive = row.status === 1;
  const touchLabel = TOUCH_TYPE_MAP[row.touchType] || String(row.touchType);
  const isKeyword = String(row.touchType) === "2";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        py: 2,
        opacity: isActive ? 1 : 0.55,
      }}
    >
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
          {!isActive && <Chip label="已關閉" size="small" variant="outlined" />}
          {row.senderName && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {row.senderName}
            </Typography>
          )}
        </Box>
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        <Tooltip title="編輯">
          <span>
            <IconButton
              size="small"
              onClick={() => onEdit(row)}
              disabled={!isActive || !isLoggedIn}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {isActive ? (
          <Tooltip title="刪除指令">
            <span>
              <IconButton
                size="small"
                color="error"
                onClick={() => onModifyStatus(row.orderKey, 0)}
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
                onClick={() => onModifyStatus(row.orderKey, 1)}
                disabled={!isLoggedIn}
              >
                <RestoreIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}

export default function CustomerOrder() {
  const { loggedIn: isLoggedIn } = useLiff();
  const { sourceId } = useParams();
  const [loading, setLoading] = useState(true);
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
      replyDatas: [{ no: 0, messageType: "text", reply: "" }],
    });
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback(row => {
    setDialogData(row);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setDialogData(null);
  }, []);

  const handleSave = useCallback(
    async orderData => {
      if (!orderData.order || orderData.order === "") return;
      if (!Array.isArray(orderData.replyDatas)) return;

      orderData.replyDatas = orderData.replyDatas.filter(d => d.reply !== "");

      const isInsert =
        !Object.prototype.hasOwnProperty.call(orderData, "orderKey") ||
        orderData.orderKey.trim() === "";

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

  if (loading && orders.length === 0) {
    return <CustomerOrderSkeleton />;
  }

  const activeCount = orders.filter(o => o.status === 1).length;
  const closedCount = orders.length - activeCount;

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
              自訂指令管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`${activeCount} 啟用`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
              {closedCount > 0 && (
                <Chip
                  label={`${closedCount} 已關閉`}
                  size="small"
                  sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
                />
              )}
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenNew}
            disabled={!isLoggedIn}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
              "&.Mui-disabled": { color: "rgba(255,255,255,0.4)" },
            }}
          >
            新增指令
          </Button>
        </Box>
      </Paper>

      <Alert severity="info" sx={{ borderRadius: 2 }}>
        <AlertTitle sx={{ mb: 0.5 }}>注意事項</AlertTitle>
        <Box component="ul" sx={{ m: 0, pl: 2.5, "& li": { fontSize: 14 } }}>
          <li>兩個月未觸發指令進行刪除</li>
          <li>相同指令、回覆，無法重複新增</li>
          <li>完全符合的指令優先觸發</li>
        </Box>
      </Alert>

      {!isLoggedIn && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          按右上登入才可進行指令的修改動作
        </Alert>
      )}

      {orders.length === 0 ? (
        <Paper sx={{ py: 6, textAlign: "center", borderRadius: 3 }}>
          <TerminalIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
          <Typography sx={{ color: "text.secondary" }}>尚無指令資料</Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
          {orders.map((row, i) => (
            <Box key={row.orderKey}>
              {i > 0 && <Divider />}
              <OrderRow
                row={row}
                isLoggedIn={isLoggedIn}
                onEdit={handleEdit}
                onModifyStatus={handleModifyStatus}
              />
            </Box>
          ))}
        </Paper>
      )}

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
    </Box>
  );
}
