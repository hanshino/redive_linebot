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
import { DataGrid } from "@mui/x-data-grid";
import { zhTW } from "@mui/x-data-grid/locales";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { FullPageLoading } from "../../../components/Loading";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaPoolService from "../../../services/gachaPool";

const STAR_FILTERS = [
  { label: "全部", value: null },
  { label: "SSR", value: 3 },
  { label: "SR", value: 2 },
  { label: "R", value: 1 },
];

const STAR_CONFIG = {
  3: { label: "SSR", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.3)" },
  2: { label: "SR", color: "#A855F7", bg: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.3)" },
  1: { label: "R", color: "#6B7280", bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.25)" },
};

export default function AdminGachaPool() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaPoolService.fetchData();
      setRows(
        data.map((d) => ({
          ...d,
          star: parseInt(d.star, 10),
          rate: parseFloat(d.rate),
          isPrincess: parseInt(d.isPrincess, 10),
        }))
      );
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "卡池管理頁面";
    fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (starFilter !== null) {
      result = result.filter((r) => r.star === starFilter);
    }
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(keyword));
    }
    return result;
  }, [rows, starFilter, search]);

  const handleDeleteClick = (row) => {
    showAlert({
      title: "確認刪除",
      description: `確定要刪除角色「${row.name}」嗎？`,
      onSubmit: async () => {
        try {
          await gachaPoolService.deleteData(row.id);
          showHint("刪除成功", "success");
          fetchData();
        } catch {
          showHint("刪除失敗", "error");
        } finally {
          closeAlert();
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
      renderCell: (params) => {
        const cfg = STAR_CONFIG[params.row.star] || STAR_CONFIG[1];
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
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "star",
      headerName: "星等",
      width: isMobile ? 64 : 80,
      renderCell: (params) => {
        const cfg = STAR_CONFIG[params.value] || STAR_CONFIG[1];
        return (
          <Chip
            label={cfg.label}
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
    ...(!isMobile
      ? [
          {
            field: "rate",
            headerName: "機率",
            width: 90,
            renderCell: (params) => (
              <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                {params.value}%
              </Typography>
            ),
          },
          {
            field: "isPrincess",
            headerName: "公主",
            width: 72,
            renderCell: (params) =>
              params.value === 1 ? (
                <Tooltip title="公主角色" arrow>
                  <AutoAwesomeIcon sx={{ color: "secondary.main", fontSize: 20 }} />
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
      width: isMobile ? 80 : 96,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="編輯" arrow>
            <IconButton
              size="small"
              onClick={() => navigate(`/admin/gacha-pool/${params.row.id}/edit`)}
              sx={{
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
              size="small"
              onClick={() => handleDeleteClick(params.row)}
              sx={{
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
          background: isDark
            ? "linear-gradient(135deg, rgba(38,198,218,0.08) 0%, rgba(251,191,36,0.06) 100%)"
            : "linear-gradient(135deg, rgba(0,172,193,0.06) 0%, rgba(245,158,11,0.04) 100%)",
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2.5 }}
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
            sx={{ borderRadius: 2, px: 2.5, boxShadow: 2 }}
          >
            新增角色
          </Button>
        </Stack>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="搜尋角色名稱..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
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

        {/* Star Filter Chips */}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {STAR_FILTERS.map((f) => {
            const active = starFilter === f.value;
            const cfg = f.value ? STAR_CONFIG[f.value] : null;
            return (
              <Chip
                key={f.label}
                label={f.label}
                onClick={() => setStarFilter(f.value)}
                sx={{
                  fontWeight: active ? 700 : 500,
                  borderRadius: 1.5,
                  ...(active && cfg
                    ? { bgcolor: cfg.bg, color: cfg.color, border: 1, borderColor: cfg.border }
                    : active
                      ? { bgcolor: "primary.main", color: "primary.contrastText" }
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
              bgcolor: isDark ? "rgba(38,198,218,0.06)" : "rgba(0,172,193,0.04)",
              borderBottom: 1,
              borderColor: "divider",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 700,
              fontSize: "0.8rem",
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            },
            "& .MuiDataGrid-row": {
              "&:nth-of-type(even)": {
                bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
              },
              "&:hover": {
                bgcolor: isDark ? "rgba(38,198,218,0.06)" : "rgba(0,172,193,0.04)",
              },
              transition: "background-color 0.15s",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: 1,
              borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
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
