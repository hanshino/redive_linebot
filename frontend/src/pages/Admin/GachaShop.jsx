import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Typography,
  Grid,
  Paper,
  Stack,
  IconButton,
  Tooltip,
  Divider,
  Skeleton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as gachaShopService from "../../services/gachaShop";

/* ---------- Loading Skeleton ---------- */
function GachaShopSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={56} animation="wave" />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rounded" height={72} animation="wave" />
      ))}
    </Box>
  );
}

/* ---------- Shop Item Row ---------- */
function ShopItemRow({ row, onEdit, onDelete }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
      <Avatar alt={row.name} src={row.headImage} sx={{ width: 48, height: 48, flexShrink: 0 }}>
        {row.name?.charAt(0)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
          {row.name}
        </Typography>
        <Chip
          icon={<ShoppingCartIcon sx={{ fontSize: "14px !important" }} />}
          label={`${row.price} 石`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ mt: 0.5 }}
        />
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
export default function AdminGachaShop() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list"); // "list" | "create"
  const [editingRow, setEditingRow] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const existIds = useMemo(() => rows.map(item => item.itemId), [rows]);

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

  const handleCreate = async formData => {
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

  const handleOpenEdit = row => {
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

  const handleDeleteClick = row => {
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

  if (loading && rows.length === 0 && mode === "list") {
    return <GachaShopSkeleton />;
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
          <StorefrontIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)", flexShrink: 0 }} />
          <Box sx={{ color: "#fff", flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              女神石商店管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`${rows.length} 件商品`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setMode("create")}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
            }}
          >
            新增商品
          </Button>
        </Box>
      </Paper>
      {/* Item List */}
      {rows.length === 0 ? (
        <Paper sx={{ py: 6, textAlign: "center", borderRadius: 3 }}>
          <StorefrontIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
          <Typography
            sx={{
              color: "text.secondary",
            }}
          >
            尚無商品資料
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
          {rows.map((row, i) => (
            <Box key={row.id}>
              {i > 0 && <Divider />}
              <ShopItemRow row={row} onEdit={handleOpenEdit} onDelete={handleDeleteClick} />
            </Box>
          ))}
        </Paper>
      )}
      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>編輯商品</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="名稱"
            value={editingRow?.name || ""}
            sx={{ mt: 2, mb: 2 }}
            size="small"
            disabled
          />
          <TextField
            fullWidth
            label="價格"
            value={editingRow?.price ?? ""}
            onChange={e => setEditingRow(prev => ({ ...prev, price: e.target.value }))}
            sx={{ mb: 2 }}
            size="small"
            type="number"
          />
          <TextField
            fullWidth
            label="大圖"
            value={editingRow?.itemImage || ""}
            onChange={e => setEditingRow(prev => ({ ...prev, itemImage: e.target.value }))}
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
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
      const available = (poolData || []).filter(item => !existIds.includes(parseInt(item.id)));
      if (available.length > 0) {
        setSelectedId(available[0].id);
      }
    });
  }, [existIds]);

  const nameList = useMemo(() => {
    if (!gachaData.length) return [];
    return gachaData.filter(item => !existIds.includes(parseInt(item.id)));
  }, [gachaData, existIds]);

  const handleCharacterChange = e => {
    const id = parseInt(e.target.value);
    setSelectedId(id);
    const target = gachaData.find(item => item.id === id);
    if (target) {
      const character = characters.find(item => item.unitName === target.unitName);
      if (character) {
        setItemImage(character.image);
        setPreview(character.image);
      }
    }
  };

  const handleSubmit = () => {
    const target = gachaData.find(item => item.id === parseInt(selectedId));
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton onClick={onCancel}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          新增商品
        </Typography>
      </Box>

      {/* Form Card */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
          p: { xs: 2.5, sm: 3 },
        }}
      >
        <Stack spacing={2.5}>
          <TextField
            fullWidth
            label="名稱"
            variant="outlined"
            required
            select
            value={selectedId}
            onChange={handleCharacterChange}
          >
            {nameList.map(item => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            label="價格"
            variant="outlined"
            required
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />

          <TextField
            fullWidth
            label="大圖"
            variant="outlined"
            required
            value={itemImage}
            onChange={e => setItemImage(e.target.value)}
          />

          {preview && (
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 1 }}>
              <Box
                component="img"
                src={preview}
                sx={{ maxWidth: "100%", borderRadius: 1, display: "block" }}
              />
            </Paper>
          )}

          {/* Buttons */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button variant="outlined" color="inherit" onClick={onCancel} disabled={loading}>
              取消
            </Button>
            <Button variant="contained" onClick={handleSubmit} disabled={loading}>
              新增
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
