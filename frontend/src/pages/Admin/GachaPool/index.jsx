import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Avatar,
  TextField,
  Chip,
  Typography,
  IconButton,
  InputAdornment,
  Stack,
  Paper,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DataGrid } from "@mui/x-data-grid";
import { zhTW } from "@mui/x-data-grid/locales";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { FullPageLoading } from "../../../components/Loading";
import LoadError from "../../../components/LoadError";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaPoolService from "../../../services/gachaPool";
import { errorText } from "../_errors";
import { STAR_META, starColors, fmtRate } from "./stars";

const STAR_FILTERS = [
  { label: "全部", value: null },
  { label: STAR_META[3].short, value: 3 },
  { label: STAR_META[2].short, value: 2 },
  { label: STAR_META[1].short, value: 1 },
];

export default function AdminGachaPool() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await gachaPoolService.fetchData();
      setRows(
        data.map(d => ({
          ...d,
          star: parseInt(d.star, 10),
          rate: parseFloat(d.rate),
          isPrincess: parseInt(d.isPrincess, 10),
        }))
      );
    } catch {
      // 失敗不能留舊資料或空表：清掉列表，改顯示 LoadError
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "卡池管理頁面";
    fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (starFilter !== null) {
      result = result.filter(r => r.star === starFilter);
    }
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(keyword));
    }
    return result;
  }, [rows, starFilter, search]);

  // 各星等機率加總（全池，不受搜尋與篩選影響）：調機率時要看得到總和有沒有跑掉
  const rateSums = useMemo(() => {
    const sums = { 3: 0, 2: 0, 1: 0 };
    rows.forEach(r => {
      if (sums[r.star] !== undefined) sums[r.star] += Number(r.rate) || 0;
    });
    return { ...sums, total: sums[3] + sums[2] + sums[1] };
  }, [rows]);

  const handleDeleteClick = row => {
    showAlert({
      title: "刪除角色",
      description: `「${row.name}」會從卡池移除，無法復原。`,
      submitText: "刪除",
      destructive: true,
      onSubmit: async () => {
        setBusy(true);
        try {
          await gachaPoolService.deleteData(row.id);
          closeAlert();
          showHint(`已刪除角色「${row.name}」`, "success");
          fetchData();
        } catch (e) {
          // 失敗時保留確認框，讓管理員可以重試或取消
          setBusy(false);
          showHint(errorText(e, `刪除「${row.name}」失敗，角色還在卡池裡，請稍後再試。`), "error");
        }
      },
    });
  };

  const columns = [
    {
      field: "imageUrl",
      headerName: "",
      width: isMobile ? 48 : 56,
      sortable: false,
      filterable: false,
      renderCell: params => {
        const cfg = starColors(theme, params.row.star);
        return (
          <Avatar
            alt={params.row.name}
            src={params.value}
            sx={{
              width: isMobile ? 32 : 40,
              height: isMobile ? 32 : 40,
              border: 2,
              borderColor: cfg.color,
              boxShadow: `0 0 0 2px ${cfg.bg}`,
            }}
          />
        );
      },
    },
    {
      field: "name",
      headerName: "名稱",
      flex: 1,
      minWidth: isMobile ? 70 : 100,
      renderCell: params => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {params.value}
          </Typography>
          {/* 手機版放不下星等與標籤欄，改收進名稱下方（星等用文字，不只靠顏色） */}
          {isMobile && (
            <Typography variant="caption" noWrap sx={{ color: "text.secondary", display: "block" }}>
              <Box
                component="span"
                sx={{ color: starColors(theme, params.row.star).color, fontWeight: 700 }}
              >
                {(STAR_META[params.row.star] || STAR_META[1]).short}
              </Box>
              {params.row.tag ? ` ・${params.row.tag}` : ""}
            </Typography>
          )}
        </Box>
      ),
    },
    ...(!isMobile
      ? [
          {
            field: "star",
            headerName: "星等",
            width: 80,
            renderCell: params => {
              const cfg = starColors(theme, params.value);
              return (
                <Chip
                  label={(STAR_META[params.value] || STAR_META[1]).short}
                  size="small"
                  sx={{
                    bgcolor: cfg.bg,
                    color: cfg.color,
                    border: 1,
                    borderColor: cfg.border,
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    letterSpacing: "0.05em",
                  }}
                />
              );
            },
          },
        ]
      : []),
    {
      // 機率是調卡池時最常看的欄位，手機版也要留著
      field: "rate",
      headerName: "機率",
      width: isMobile ? 76 : 90,
      renderCell: params => (
        <Typography
          variant="body2"
          sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}
        >
          {fmtRate(params.value)}
        </Typography>
      ),
    },
    ...(!isMobile
      ? [
          {
            field: "isPrincess",
            headerName: "公主",
            width: 72,
            renderCell: params =>
              params.value === 1 ? (
                <Tooltip title="公主角色" arrow>
                  <AutoAwesomeIcon
                    aria-label="公主角色"
                    role="img"
                    sx={{ color: "secondary.main", fontSize: 20 }}
                  />
                </Tooltip>
              ) : (
                <Typography variant="body2" sx={{ color: "text.disabled" }}>
                  —
                </Typography>
              ),
          },
          { field: "tag", headerName: "標籤", width: 100 },
        ]
      : []),
    {
      field: "actions",
      headerName: "",
      width: 108,
      sortable: false,
      filterable: false,
      renderCell: params => (
        <Stack direction="row" spacing={1}>
          <Tooltip title="編輯" arrow>
            <IconButton
              aria-label={`編輯角色 ${params.row.name}`}
              onClick={() => navigate(`/admin/gacha-pool/${params.row.id}/edit`)}
              sx={{
                width: 44,
                height: 44,
                color: "primary.main",
                "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
                transition: "all 0.15s",
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="刪除" arrow>
            <IconButton
              aria-label={`刪除角色 ${params.row.name}`}
              onClick={() => handleDeleteClick(params.row)}
              sx={{
                width: 44,
                height: 44,
                color: "error.main",
                "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
                transition: "all 0.15s",
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  if (error) {
    return <LoadError message="卡池資料載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />;
  }

  if (loading && rows.length === 0) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header Card */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.07)} 0%, ${alpha(theme.palette.secondary.light, 0.05)} 100%)`,
        }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            mb: 2.5,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              卡池管理
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              共 {rows.length} 位角色
              {filteredRows.length !== rows.length && `，篩選後 ${filteredRows.length} 位`}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/admin/gacha-pool/new")}
            sx={{ borderRadius: 2, px: 2.5, minHeight: 44, flexShrink: 0 }}
          >
            新增角色
          </Button>
        </Stack>

        {/* 各星等機率加總：改機率時一眼看出總和 */}
        <Stack
          direction="row"
          role="group"
          aria-label="各星等機率加總"
          sx={{ flexWrap: "wrap", gap: 1, mb: 2.5 }}
        >
          {[3, 2, 1].map(star => {
            const cfg = starColors(theme, star);
            return (
              <Chip
                key={star}
                label={`${STAR_META[star].short} ${fmtRate(rateSums[star])}`}
                sx={{
                  bgcolor: cfg.bg,
                  color: cfg.color,
                  border: 1,
                  borderColor: cfg.border,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            );
          })}
          <Chip
            label={`合計 ${fmtRate(rateSums.total)}`}
            variant="outlined"
            sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
          />
        </Stack>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="搜尋角色名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "搜尋角色名稱" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "text.disabled" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            mb: 2,
            "& .MuiOutlinedInput-root": {
              bgcolor: "background.paper",
              borderRadius: 2,
            },
          }}
        />

        {/* Star Filter Chips：選取狀態除了底色，還有勾號與 aria-pressed */}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {STAR_FILTERS.map(f => {
            const active = starFilter === f.value;
            const cfg = f.value ? starColors(theme, f.value) : null;
            return (
              <Chip
                key={f.label}
                label={f.label}
                icon={active ? <CheckIcon /> : undefined}
                aria-pressed={active}
                onClick={() => setStarFilter(f.value)}
                sx={{
                  height: { xs: 44, sm: 32 },
                  fontWeight: active ? 700 : 500,
                  borderRadius: 1.5,
                  ...(active && cfg
                    ? {
                        bgcolor: cfg.bg,
                        color: cfg.color,
                        border: 1,
                        borderColor: cfg.color,
                        "& .MuiChip-icon": { color: cfg.color },
                      }
                    : active
                      ? {
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          "& .MuiChip-icon": { color: "primary.contrastText" },
                        }
                      : { bgcolor: "background.paper", border: 1, borderColor: "divider" }),
                  "&:hover": { opacity: 0.85 },
                  transition: "all 0.15s",
                }}
              />
            );
          })}
        </Stack>
      </Paper>
      {/* DataGrid */}
      <Paper
        elevation={0}
        sx={{ borderRadius: 3, border: 1, borderColor: "divider", overflow: "hidden" }}
      >
        <DataGrid
          rows={filteredRows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          localeText={zhTW.components.MuiDataGrid.defaultProps.localeText}
          slotProps={{
            basePagination: {
              showFirstButton: true,
              showLastButton: true,
            },
          }}
          disableRowSelectionOnClick
          rowHeight={56}
          sx={{
            border: "none",
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: alpha(theme.palette.primary.light, 0.06),
              borderBottom: 1,
              borderColor: "divider",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 700,
              fontSize: "0.8125rem",
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            },
            "& .MuiDataGrid-row": {
              "&:nth-of-type(even)": {
                bgcolor: "action.hover",
              },
              "&:hover": {
                bgcolor: alpha(theme.palette.primary.light, 0.1),
              },
              transition: "background-color 0.15s",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
            },
            "& .MuiDataGrid-footerContainer": {
              borderTop: 1,
              borderColor: "divider",
            },
          }}
        />
      </Paper>
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
