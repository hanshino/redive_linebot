import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import FlareIcon from "@mui/icons-material/Flare";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as gachaPoolService from "../../services/gachaPool";

const starOptions = [
  { value: 1, label: "Rare(1)" },
  { value: 2, label: "SuperRare(2)" },
  { value: 3, label: "UltraRare(3)" },
];

const princessOptions = [
  { value: 1, label: "是公主" },
  { value: 0, label: "不是公主" },
];

const EMPTY_FORM = {
  name: "",
  imageUrl: "",
  star: 3,
  rate: "",
  isPrincess: 1,
  tag: "",
};

export default function AdminGachaPool() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaPoolService.fetchData();
      setRows(
        data.map((d) => ({
          ...d,
          rate: parseFloat(d.rate),
          isPrincess: parseInt(d.isPrincess),
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

  const handleOpenAdd = () => {
    setEditingRow(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    setFormData({
      name: row.name || "",
      imageUrl: row.imageUrl || "",
      star: row.star ?? 3,
      rate: row.rate ?? "",
      isPrincess: row.isPrincess ?? 1,
      tag: row.tag || "",
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingRow(null);
  };

  const handleFormChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      headImage_url: formData.imageUrl,
      star: formData.star,
      rate: formData.rate,
      is_princess: formData.isPrincess,
      tag: formData.tag,
    };

    try {
      if (editingRow) {
        await gachaPoolService.updateData(editingRow.id, payload);
        showHint("更新成功", "success");
      } else {
        await gachaPoolService.insertData(payload);
        showHint("新增成功", "success");
      }
      handleDialogClose();
      fetchData();
    } catch {
      showHint(editingRow ? "更新失敗" : "新增失敗", "error");
    }
  };

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
      headerName: "頭像",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar
          alt={params.row.name}
          src={params.value}
          sx={{ width: 40, height: 40 }}
        />
      ),
    },
    { field: "name", headerName: "名字", flex: 1, minWidth: 120 },
    {
      field: "star",
      headerName: "星數",
      width: 130,
      valueFormatter: (value) => {
        const opt = starOptions.find((o) => o.value === value);
        return opt ? opt.label : value;
      },
    },
    {
      field: "rate",
      headerName: "機率",
      width: 100,
      valueFormatter: (value) => `${value}%`,
    },
    {
      field: "isPrincess",
      headerName: "是公主嗎",
      width: 120,
      valueFormatter: (value) => (value === 1 ? "是公主" : "不是公主"),
    },
    { field: "tag", headerName: "標籤", width: 120 },
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
        <Typography variant="h5">卡池管理系統</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
          新增角色
        </Button>
      </Box>

      <Box sx={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          disableRowSelectionOnClick
        />
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRow ? "編輯角色" : "新增角色"}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="名字"
            value={formData.name}
            onChange={handleFormChange("name")}
            sx={{ mt: 1, mb: 2 }}
            size="small"
          />
          <TextField
            fullWidth
            label="頭像網址"
            value={formData.imageUrl}
            onChange={handleFormChange("imageUrl")}
            sx={{ mb: 2 }}
            size="small"
          />
          <TextField
            fullWidth
            select
            label="星數"
            value={formData.star}
            onChange={handleFormChange("star")}
            sx={{ mb: 2 }}
            size="small"
          >
            {starOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="機率"
            value={formData.rate}
            onChange={handleFormChange("rate")}
            sx={{ mb: 2 }}
            size="small"
            type="number"
          />
          <TextField
            fullWidth
            select
            label="是公主嗎"
            value={formData.isPrincess}
            onChange={handleFormChange("isPrincess")}
            sx={{ mb: 2 }}
            size="small"
          >
            {princessOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="標籤"
            value={formData.tag}
            onChange={handleFormChange("tag")}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>取消</Button>
          <Button onClick={handleSave} variant="contained">
            儲存
          </Button>
        </DialogActions>
      </Dialog>

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
