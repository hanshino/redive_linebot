import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Divider,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
} from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import BlockIcon from "@mui/icons-material/Block";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import LoadError from "../../../components/LoadError";
import PageHero, { HeroButton } from "../../../components/PageHero";
import * as couponService from "../../../services/coupon";
import { errorText } from "../_errors";
import { deriveStatus, STATUS_META } from "./status";
import CouponFormDialog from "./CouponFormDialog";
import CouponStatsDrawer from "./CouponStatsDrawer";

const STATUS_ICON = {
  active: <CheckCircleIcon fontSize="small" />,
  upcoming: <ScheduleIcon fontSize="small" />,
  expired: <BlockIcon fontSize="small" />,
};

const fmt = v => (v ? new Date(v).toLocaleString() : "—");

export default function Coupon() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statsId, setStatsId] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      setCoupons((await couponService.fetchCoupons()) || []);
    } catch {
      // 失敗不能顯示成「沒有符合的兌換券」，清掉列表並改顯示 LoadError
      setCoupons([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "優惠券管理";
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(
    () =>
      coupons.filter(c => {
        const okSearch = c.code.toLowerCase().includes(search.trim().toLowerCase());
        const okStatus = statusFilter === "all" || deriveStatus(c) === statusFilter;
        return okSearch && okStatus;
      }),
    [coupons, search, statusFilter]
  );

  const activeCount = coupons.filter(c => deriveStatus(c) === "active").length;

  const handleSave = async payload => {
    if (saving) return;
    const isEdit = Boolean(editing);
    try {
      setSaving(true);
      if (editing) await couponService.updateCoupon(editing.id, payload);
      else await couponService.createCoupon(payload);
      showHint(
        isEdit ? `已更新兌換券「${payload.code}」` : `已新增兌換券「${payload.code}」`,
        "success"
      );
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      // 失敗時保留對話框，已填的內容不會消失
      showHint(
        errorText(e, `${isEdit ? "更新" : "新增"}兌換券失敗，內容還沒儲存，請檢查網路後再試一次。`),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = coupon => {
    const redeemed = coupon.redeemedCount > 0 ? `已有 ${coupon.redeemedCount} 人領取。` : "";
    showAlert({
      title: "刪除兌換券",
      description: `「${coupon.code}」${redeemed}刪除後玩家無法再使用，無法復原。`,
      submitText: "刪除",
      destructive: true,
      onSubmit: async () => {
        setBusy(true);
        try {
          await couponService.deleteCoupon(coupon.id);
          closeAlert();
          showHint(`已刪除兌換券「${coupon.code}」`, "success");
          fetchData();
        } catch (e) {
          // 失敗時保留確認框，讓管理員可以重試或取消
          setBusy(false);
          showHint(errorText(e, `刪除「${coupon.code}」失敗，兌換券還在，請稍後再試。`), "error");
        }
      },
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <PageHero
        icon={<ConfirmationNumberIcon />}
        title="Coupon 管理"
        subtitle={error ? undefined : `共 ${coupons.length} 張，進行中 ${activeCount} 張`}
      >
        <HeroButton
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          新增 coupon
        </HeroButton>
      </PageHero>

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          label="搜尋兌換碼"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={statusFilter}
          onChange={(e, v) => v && setStatusFilter(v)}
          aria-label="依狀態篩選"
          sx={{
            flexWrap: "wrap",
            gap: 1,
            "& .MuiToggleButtonGroup-grouped": {
              minHeight: 44,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              "&:not(:first-of-type)": { ml: 0, borderLeft: "1px solid", borderColor: "divider" },
            },
          }}
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="active">進行中</ToggleButton>
          <ToggleButton value="upcoming">尚未啟用</ToggleButton>
          <ToggleButton value="expired">已過期</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Paper sx={{ borderRadius: 3 }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <Box key={i} sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
              <Skeleton variant="rounded" height={48} />
            </Box>
          ))
        ) : error ? (
          <Box sx={{ px: 3 }}>
            <LoadError message="兌換券載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <ConfirmationNumberIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography sx={{ color: "text.secondary", mt: 1 }}>
              {coupons.length === 0 ? "還沒有兌換券" : "沒有符合的兌換券"}
            </Typography>
          </Box>
        ) : (
          filtered.map((c, idx) => {
            const status = deriveStatus(c);
            const meta = STATUS_META[status];
            return (
              <Box key={c.id}>
                {idx > 0 && <Divider />}
                {/* 窄螢幕自動換行成兩行：資訊一行、狀態與操作一行，操作按鈕靠右 */}
                <Box
                  sx={{
                    px: { xs: 2.5, sm: 3 },
                    py: { xs: 2, sm: 2.5 },
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    columnGap: 2,
                    rowGap: 1,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <ConfirmationNumberIcon color="action" />
                  <Box sx={{ flex: "1 1 180px", minWidth: 0 }}>
                    <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }} noWrap>
                      {c.code}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block" }}
                    >
                      {fmt(c.start_at)} ~ {fmt(c.end_at)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block" }}
                    >
                      女神石 ×{c.reward?.value ?? "?"}・已領取 {c.redeemedCount} 次
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                    <Chip
                      icon={STATUS_ICON[status]}
                      label={meta.label}
                      size="small"
                      color={meta.color}
                    />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, ml: "auto" }}>
                    <Tooltip title="查看領取">
                      <IconButton
                        aria-label={`查看 ${c.code} 的領取紀錄`}
                        onClick={() => setStatsId(c.id)}
                        sx={{ width: 44, height: 44 }}
                      >
                        <QueryStatsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="編輯">
                      <IconButton
                        aria-label={`編輯兌換券 ${c.code}`}
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                        sx={{ width: 44, height: 44 }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="刪除">
                      <IconButton
                        color="error"
                        aria-label={`刪除兌換券 ${c.code}`}
                        onClick={() => handleDelete(c)}
                        sx={{ width: 44, height: 44 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </Paper>

      <CouponFormDialog
        open={dialogOpen}
        editing={editing}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSave}
      />
      <CouponStatsDrawer couponId={statsId} onClose={() => setStatsId(null)} />

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
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
    </Box>
  );
}
