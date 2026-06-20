import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  Divider,
  Skeleton,
  Alert,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
} from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import RedeemIcon from "@mui/icons-material/Redeem";
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
import * as couponService from "../../../services/coupon";
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
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      setCoupons((await couponService.fetchCoupons()) || []);
    } catch {
      setError(true);
      showHint("載入失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

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

  const activeCount = useMemo(
    () => coupons.filter(c => deriveStatus(c) === "active").length,
    [coupons]
  );

  const handleSave = async payload => {
    try {
      setSaving(true);
      if (editing) await couponService.updateCoupon(editing.id, payload);
      else await couponService.createCoupon(payload);
      showHint(editing ? "更新成功" : "新增成功", "success");
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      showHint(e.response?.data?.message || "操作失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = coupon =>
    showAlert({
      title: "確認刪除",
      description: `確定要刪除兌換券「${coupon.code}」嗎？`,
      onSubmit: async () => {
        try {
          await couponService.deleteCoupon(coupon.id);
          showHint("刪除成功", "success");
          fetchData();
        } catch (e) {
          showHint(e.response?.data?.message || "刪除失敗", "error");
        } finally {
          closeAlert();
        }
      },
    });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
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
            p: { xs: 3, sm: 4 },
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <ConfirmationNumberIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ color: "#fff", flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Coupon 管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`共 ${coupons.length} 張`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
              <Chip
                label={`進行中 ${activeCount}`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
            }}
          >
            新增 coupon
          </Button>
        </Box>
      </Paper>

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
          value={statusFilter}
          onChange={(e, v) => v && setStatusFilter(v)}
          sx={{ "& .MuiToggleButton-root": { borderRadius: "8px !important" } }}
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
          <Box sx={{ p: 3 }}>
            <Alert severity="error">載入失敗，請重試</Alert>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <ConfirmationNumberIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              沒有符合的兌換券
            </Typography>
          </Box>
        ) : (
          filtered.map((c, idx) => {
            const status = deriveStatus(c);
            const meta = STATUS_META[status];
            return (
              <Box key={c.id}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    px: { xs: 2.5, sm: 3 },
                    py: { xs: 2, sm: 2.5 },
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <ConfirmationNumberIcon color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }} noWrap>
                      {c.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmt(c.start_at)} ~ {fmt(c.end_at)}
                    </Typography>
                  </Box>
                  <Chip
                    icon={<RedeemIcon sx={{ color: "inherit !important" }} />}
                    label={`女神石 ×${c.reward?.value ?? "?"}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    icon={STATUS_ICON[status]}
                    label={meta.label}
                    size="small"
                    color={meta.color}
                  />
                  <Chip label={`領取 ${c.redeemedCount}`} size="small" variant="outlined" />
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="查看領取">
                      <IconButton
                        size="small"
                        aria-label="查看領取"
                        onClick={() => setStatsId(c.id)}
                      >
                        <QueryStatsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="編輯">
                      <IconButton
                        size="small"
                        aria-label="編輯"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="刪除">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="刪除"
                        onClick={() => handleDelete(c)}
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
      />
    </Box>
  );
}
