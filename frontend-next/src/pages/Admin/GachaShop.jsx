import { useState, useEffect, useCallback, useMemo } from "react";
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
  Grid,
  Paper,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as gachaShopService from "../../services/gachaShop";

export default function AdminGachaShop() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list"); // "list" | "create" | "edit"
  const [editingRow, setEditingRow] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const existIds = useMemo(() => rows.map((item) => item.itemId), [rows]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaShopService.fetchItems();
      setRows(data || []);
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "女神石商店管理";
    fetchData();
  }, [fetchData]);

  const handleCreate = async (formData) => {
    try {
      setLoading(true);
      await gachaShopService.createItem(formData);
      showHint("新增成功", "success");
      setMode("list");
      fetchData();
    } catch {
      showHint("新增失敗", "error");
      setLoading(false);
    }
  };

  const handleOpenEdit = (row) => {
    setEditingRow({
      id: row.id,
      name: row.name || "",
      price: row.price ?? "",
      itemImage: row.itemImage || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    try {
      await gachaShopService.updateItem(editingRow.id, {
        ...editingRow,
        item_image: editingRow.itemImage,
      });
      showHint("更新成功", "success");
      setEditDialogOpen(false);
      setEditingRow(null);
      fetchData();
    } catch {
      showHint("更新失敗", "error");
    }
  };

  const handleDeleteClick = (row) => {
    showAlert({
      title: "確認刪除",
      description: `確定要刪除商品「${row.name}」嗎？`,
      onSubmit: async () => {
        try {
          await gachaShopService.deleteItem(row.id);
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
      field: "headImage",
      headerName: "頭像",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar alt={params.row.name} src={params.value} sx={{ width: 40, height: 40 }} />
      ),
    },
    { field: "name", headerName: "名稱", flex: 1, minWidth: 120 },
    { field: "price", headerName: "價格", width: 120 },
    { field: "itemImage", headerName: "大圖", flex: 1, minWidth: 200 },
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

  if (loading && rows.length === 0 && mode === "list") {
    return <FullPageLoading />;
  }

  if (mode === "create") {
    return (
      <>
        <CreateForm
          existIds={existIds}
          onSubmit={handleCreate}
          onCancel={() => setMode("list")}
          loading={loading}
        />
        <HintSnackBar
          open={hintState.open}
          message={hintState.message}
          severity={hintState.severity}
          onClose={closeHint}
        />
      </>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">女神石商店管理</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMode("create")}>
          新增商品
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

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>編輯商品</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="名稱"
            value={editingRow?.name || ""}
            sx={{ mt: 1, mb: 2 }}
            size="small"
            disabled
          />
          <TextField
            fullWidth
            label="價格"
            value={editingRow?.price ?? ""}
            onChange={(e) =>
              setEditingRow((prev) => ({ ...prev, price: e.target.value }))
            }
            sx={{ mb: 2 }}
            size="small"
            type="number"
          />
          <TextField
            fullWidth
            label="大圖"
            value={editingRow?.itemImage || ""}
            onChange={(e) =>
              setEditingRow((prev) => ({ ...prev, itemImage: e.target.value }))
            }
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button onClick={handleEditSave} variant="contained">
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

function CreateForm({ existIds, onSubmit, onCancel, loading }) {
  const [gachaData, setGachaData] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [price, setPrice] = useState(500);
  const [itemImage, setItemImage] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    Promise.all([
      gachaShopService.fetchGachaPoolData(),
      gachaShopService.fetchCharacterImages(),
    ]).then(([poolData, charData]) => {
      setGachaData(poolData || []);
      setCharacters(charData || []);
      const available = (poolData || []).filter(
        (item) => !existIds.includes(parseInt(item.id))
      );
      if (available.length > 0) {
        setSelectedId(available[0].id);
      }
    });
  }, [existIds]);

  const nameList = useMemo(() => {
    if (!gachaData.length) return [];
    return gachaData.filter((item) => !existIds.includes(parseInt(item.id)));
  }, [gachaData, existIds]);

  const handleCharacterChange = (e) => {
    const id = parseInt(e.target.value);
    setSelectedId(id);
    const target = gachaData.find((item) => item.id === id);
    if (target) {
      const character = characters.find((item) => item.unitName === target.unitName);
      if (character) {
        setItemImage(character.image);
        setPreview(character.image);
      }
    }
  };

  const handleSubmit = () => {
    const target = gachaData.find((item) => item.id === parseInt(selectedId));
    if (!itemImage || !price || !target?.id) {
      alert("請填寫完整");
      return;
    }
    onSubmit({
      id: target.id,
      item_image: itemImage,
      price: parseInt(price),
    });
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Grid container direction="column" spacing={1} component={Paper} sx={{ p: 2 }}>
        <Grid>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={onCancel}>
              返回
            </Button>
            <Typography variant="h6">新增商品</Typography>
          </Box>
        </Grid>
        <Grid>
          <TextField
            fullWidth
            color="primary"
            label="名稱"
            variant="outlined"
            required
            select
            value={selectedId}
            onChange={handleCharacterChange}
          >
            {nameList.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid>
          <TextField
            fullWidth
            color="primary"
            label="價格"
            variant="outlined"
            required
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Grid>
        <Grid>
          <TextField
            fullWidth
            color="primary"
            label="大圖"
            variant="outlined"
            required
            value={itemImage}
            onChange={(e) => setItemImage(e.target.value)}
          />
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <Button
              onClick={onCancel}
              fullWidth
              color="secondary"
              variant="contained"
              size="large"
              disabled={loading}
            >
              取消
            </Button>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Button
              onClick={handleSubmit}
              fullWidth
              color="primary"
              variant="contained"
              size="large"
              disabled={loading}
            >
              新增
            </Button>
          </Grid>
        </Grid>
        {preview && (
          <Grid>
            <Box component="img" src={preview} sx={{ maxWidth: "100%", mt: 1 }} />
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
