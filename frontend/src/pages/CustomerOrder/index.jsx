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
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import TerminalIcon from "@mui/icons-material/Terminal";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import LoadError from "../../components/LoadError";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
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
  // 同一個指令的每則回覆各是一列，觸發時間取其中最近的一筆
  const lastTouch = {};
  orderDatas.forEach(data => {
    if (data.touchDTM) {
      const t = new Date(data.touchDTM).getTime();
      if (!lastTouch[data.orderKey] || t > lastTouch[data.orderKey]) lastTouch[data.orderKey] = t;
    }
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
      lastTouch: lastTouch[orderKey] || null,
    };
  });
}

function formatTouch(ts) {
  if (!ts) return "尚未觸發";
  return `最後觸發 ${new Date(ts).toLocaleDateString("zh-TW")}`;
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

function OrderRow({ row, isLoggedIn, pending, onEdit, onModifyStatus }) {
  const isActive = row.status === 1;
  const touchLabel = TOUCH_TYPE_MAP[row.touchType] || String(row.touchType);
  const isKeyword = String(row.touchType) === "2";
  const buttonSx = { width: 44, height: 44 };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        py: 2,
      }}
    >
      <Avatar
        alt={row.senderName || "預設"}
        src={row.senderIcon || ""}
        sx={{ width: 48, height: 48, flexShrink: 0, opacity: isActive ? 1 : 0.6 }}
      >
        {(row.senderName || "預").charAt(0)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* 已關閉的列用次要文字色表示，不用整列降透明度（會讓文字對比不足） */}
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, color: isActive ? "text.primary" : "text.secondary" }}
          noWrap
        >
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
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          {formatTouch(row.lastTouch)}
        </Typography>
      </Box>
      {/* 編輯與刪除間留出空隙，手機上才不會誤觸破壞性按鈕 */}
      <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
        <Tooltip title="編輯">
          <span>
            <IconButton
              aria-label={`編輯指令 ${row.order}`}
              onClick={() => onEdit(row)}
              disabled={!isActive || !isLoggedIn || pending}
              sx={buttonSx}
            >
              <EditIcon />
            </IconButton>
          </span>
        </Tooltip>
        {isActive ? (
          <Tooltip title="刪除指令">
            <span>
              <IconButton
                aria-label={`刪除指令 ${row.order}`}
                color="error"
                onClick={() => onModifyStatus(row, 0)}
                disabled={!isLoggedIn || pending}
                sx={buttonSx}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title="回復指令">
            <span>
              <IconButton
                aria-label={`回復指令 ${row.order}`}
                onClick={() => onModifyStatus(row, 1)}
                disabled={!isLoggedIn || pending}
                sx={buttonSx}
              >
                <RestoreIcon />
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
  const [loadError, setLoadError] = useState(false);
  const [orders, setOrders] = useState([]);
  const [pendingKeys, setPendingKeys] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState(null);
  const [snackbar, { handleOpen: showSnack, handleClose: closeSnack }] = useHintBar();
  const [alertState, { handleOpen: openAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  // silent：存檔後重新整理清單時，不要把畫面換成骨架，也不要因為重新整理失敗就蓋掉現有清單
  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setLoadError(false);
      }
      try {
        const resp = await CustomerOrderAPI.fetchOrders(sourceId);
        setOrders(arrangeOrderDatas(resp));
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sourceId]
  );

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

  // 回傳 promise，OrderDialog 會等它結束才解除儲存鍵的鎖定；失敗時不關閉，保留使用者輸入
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
        showSnack("已儲存指令", "success");
        handleDialogClose();
        await fetchData({ silent: true });
      } catch {
        showSnack("儲存失敗，請確認已登入且網路正常，你輸入的內容還在", "warning");
      }
    },
    [sourceId, fetchData, showSnack, handleDialogClose]
  );

  // 成功後直接改這一列的狀態，不重抓整份清單（重抓會閃一次骨架、列表跳動）
  const applyStatus = useCallback(
    async (row, status) => {
      setPendingKeys(prev => [...prev, row.orderKey]);
      try {
        await CustomerOrderAPI.setOrderStatus(sourceId, row.orderKey, status);
        setOrders(prev => prev.map(o => (o.orderKey === row.orderKey ? { ...o, status } : o)));
        showSnack(
          status === 1 ? `已回復指令「${row.order}」` : `已刪除指令「${row.order}」`,
          "success"
        );
        return true;
      } catch {
        showSnack("操作失敗，請稍後再試", "error");
        return false;
      } finally {
        setPendingKeys(prev => prev.filter(k => k !== row.orderKey));
      }
    },
    [sourceId, showSnack]
  );

  const handleModifyStatus = useCallback(
    (row, status) => {
      if (status === 1) {
        applyStatus(row, 1);
        return;
      }
      // 刪除是軟刪除（之後能回復），但機器人會立刻停止回應這個指令，所以仍要確認
      openAlert({
        title: `刪除指令「${row.order}」？`,
        description: "機器人不會再回應這個指令，之後可按「回復指令」重新啟用。",
        submitText: "刪除",
        destructive: true,
        onSubmit: async () => {
          setBusy(true);
          const ok = await applyStatus(row, 0);
          if (ok) closeAlert();
          else setBusy(false);
        },
      });
    },
    [applyStatus, openAlert, closeAlert, setBusy]
  );

  if (loading) {
    return <CustomerOrderSkeleton />;
  }

  const activeCount = orders.filter(o => o.status === 1).length;
  const closedCount = orders.length - activeCount;

  // 橫幅上的 Chip 用實底，不用半透明白：半透明白疊在青色上，文字對比只有約 3.4:1
  const bannerChipSx = { bgcolor: "background.paper", color: "text.primary", fontWeight: 600 };

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
            color: "primary.contrastText",
          }}
        >
          <TerminalIcon sx={{ fontSize: 48, color: "primary.contrastText", flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              自訂指令管理
            </Typography>
            {!loadError && (
              <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                <Chip label={`${activeCount} 啟用`} size="small" sx={bannerChipSx} />
                {closedCount > 0 && (
                  <Chip label={`${closedCount} 已關閉`} size="small" sx={bannerChipSx} />
                )}
              </Box>
            )}
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenNew}
            disabled={!isLoggedIn || loadError}
            sx={{
              bgcolor: "background.paper",
              color: "primary.main",
              flexShrink: 0,
              minHeight: 44,
              "&:hover": {
                bgcolor: theme => alpha(theme.palette.background.paper, 0.88),
              },
            }}
          >
            新增指令
          </Button>
        </Box>
      </Paper>

      <Alert severity="info" sx={{ borderRadius: 2 }}>
        <AlertTitle sx={{ mb: 0.5 }}>注意事項</AlertTitle>
        <Box component="ul" sx={{ m: 0, pl: 2.5, "& li": { fontSize: 14 } }}>
          <li>超過兩個月沒有被觸發的指令會被自動刪除</li>
          <li>相同指令、回覆，無法重複新增</li>
          <li>完全符合的指令優先觸發</li>
        </Box>
      </Alert>

      {!isLoggedIn && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          按右上登入才可進行指令的修改動作
        </Alert>
      )}

      {loadError ? (
        <LoadError message="指令清單載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />
      ) : orders.length === 0 ? (
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
                pending={pendingKeys.includes(row.orderKey)}
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

      <AlertDialog
        open={alertState.open}
        onClose={closeAlert}
        onSubmit={alertState.onSubmit}
        title={alertState.title}
        description={alertState.description}
        submitText={alertState.submitText}
        destructive={alertState.destructive}
        busy={alertState.busy}
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
