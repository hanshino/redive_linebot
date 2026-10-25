import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  Avatar,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Typography,
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
import LoadError from "../../components/LoadError";
import PageHero, { HeroButton } from "../../components/PageHero";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import * as gachaShopService from "../../services/gachaShop";
import { errorText } from "./_errors";

// 價格必須是正整數
const isValidPrice = value => {
  const n = Number(value);
  return String(value).trim() !== "" && Number.isInteger(n) && n >= 1;
};

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
          icon={<ShoppingCartIcon sx={{ fontSize: "16px !important" }} />}
          label={`${row.price} 石`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ mt: 0.5 }}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
        <Tooltip title="編輯">
          <IconButton
            aria-label={`編輯商品 ${row.name}`}
            onClick={() => onEdit(row)}
            sx={{ width: 44, height: 44 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="刪除">
          <IconButton
            aria-label={`刪除商品 ${row.name}`}
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
export default function AdminGachaShop() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState("list"); // "list" | "create"
  const [creating, setCreating] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  const existIds = useMemo(() => rows.map(item => item.itemId), [rows]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await gachaShopService.fetchItems();
      setRows(data || []);
    } catch {
      // 失敗不能顯示成「尚無商品資料」，清掉列表並改顯示 LoadError
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "女神石商店管理";
    fetchData();
  }, [fetchData]);

  const handleCreate = async formData => {
    if (creating) return;
    try {
      setCreating(true);
      await gachaShopService.createItem(formData);
      showHint("已新增商品，女神石商店已更新", "success");
      setMode("list");
      fetchData();
    } catch (e) {
      showHint(errorText(e, "新增商品失敗，內容還沒儲存，請檢查網路後再試一次。"), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = row => {
    setEditingRow({
      id: row.id,
      name: row.name || "",
      price: row.price ?? "",
      itemImage: row.itemImage || "",
    });
    setEditErrors({});
    setEditDialogOpen(true);
  };

  const handleCloseEdit = () => {
    if (editSaving) return;
    setEditDialogOpen(false);
  };

  const handleEditSave = async () => {
    if (editSaving) return;
    const next = {};
    if (!isValidPrice(editingRow.price)) next.price = "價格請輸入 1 以上的整數";
    if (!editingRow.itemImage.trim()) next.itemImage = "請填寫大圖網址";
    setEditErrors(next);
    if (Object.keys(next).length) return;

    try {
      setEditSaving(true);
      await gachaShopService.updateItem(editingRow.id, {
        ...editingRow,
        price: Number(editingRow.price),
        item_image: editingRow.itemImage.trim(),
      });
      showHint(`已更新商品「${editingRow.name}」`, "success");
      setEditDialogOpen(false);
      setEditingRow(null);
      fetchData();
    } catch (e) {
      showHint(errorText(e, "更新商品失敗，內容還沒儲存，請檢查網路後再試一次。"), "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteClick = row => {
    showAlert({
      title: "刪除商品",
      description: `「${row.name}」會從女神石商店下架，無法復原。`,
      submitText: "刪除",
      destructive: true,
      onSubmit: async () => {
        setBusy(true);
        try {
          await gachaShopService.deleteItem(row.id);
          closeAlert();
          showHint(`已刪除商品「${row.name}」`, "success");
          fetchData();
        } catch (e) {
          // 失敗時保留確認框，讓管理員可以重試或取消
          setBusy(false);
          showHint(errorText(e, `刪除「${row.name}」失敗，商品還在商店裡，請稍後再試。`), "error");
        }
      },
    });
  };

  if (error) {
    return <LoadError message="商店資料載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />;
  }

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
          creating={creating}
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
      <PageHero icon={<StorefrontIcon />} title="女神石商店管理" subtitle={`${rows.length} 件商品`}>
        <HeroButton startIcon={<AddIcon />} onClick={() => setMode("create")}>
          新增商品
        </HeroButton>
      </PageHero>
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
        onClose={handleCloseEdit}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
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
            label="價格（女神石）"
            value={editingRow?.price ?? ""}
            onChange={e => {
              setEditingRow(prev => ({ ...prev, price: e.target.value }));
              setEditErrors(prev => ({ ...prev, price: undefined }));
            }}
            sx={{ mb: 2 }}
            size="small"
            type="number"
            required
            error={Boolean(editErrors.price)}
            helperText={editErrors.price}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <TextField
            fullWidth
            label="大圖網址"
            value={editingRow?.itemImage || ""}
            onChange={e => {
              setEditingRow(prev => ({ ...prev, itemImage: e.target.value }));
              setEditErrors(prev => ({ ...prev, itemImage: undefined }));
            }}
            size="small"
            required
            error={Boolean(editErrors.itemImage)}
            helperText={editErrors.itemImage}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleCloseEdit} disabled={editSaving} sx={{ minHeight: 44 }}>
            取消
          </Button>
          <Button
            onClick={handleEditSave}
            variant="contained"
            disabled={editSaving}
            sx={{ minHeight: 44 }}
          >
            {editSaving ? "儲存中…" : "儲存"}
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

function CreateForm({ existIds, onSubmit, onCancel, creating }) {
  const [gachaData, setGachaData] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // "loading" | "ready" | "error"
  const [selectedId, setSelectedId] = useState("");
  const [price, setPrice] = useState(500);
  const [itemImage, setItemImage] = useState("");
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});

  // 選角色時帶入對應的大圖；找不到就維持目前的網址
  const applyCharacterImage = useCallback((target, charList) => {
    if (!target) return;
    const character = charList.find(item => item.unitName === target.unitName);
    if (character) {
      setItemImage(character.image);
      setPreview(character.image);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      const [poolData, charData] = await Promise.all([
        gachaShopService.fetchGachaPoolData(),
        gachaShopService.fetchCharacterImages(),
      ]);
      const pool = poolData || [];
      const chars = charData || [];
      setGachaData(pool);
      setCharacters(chars);
      const available = pool.filter(item => !existIds.includes(parseInt(item.id)));
      if (available.length > 0) {
        setSelectedId(available[0].id);
        applyCharacterImage(available[0], chars);
      }
      setLoadState("ready");
    } catch {
      // 載入失敗時下拉選單會是空的，必須明說並給重試，不能讓管理員以為「沒有可新增的角色」
      setLoadState("error");
    }
  }, [existIds, applyCharacterImage]);

  useEffect(() => {
    load();
  }, [load]);

  const nameList = useMemo(() => {
    if (!gachaData.length) return [];
    return gachaData.filter(item => !existIds.includes(parseInt(item.id)));
  }, [gachaData, existIds]);

  const handleCharacterChange = e => {
    const id = parseInt(e.target.value);
    setSelectedId(id);
    setErrors(prev => ({ ...prev, selectedId: undefined }));
    applyCharacterImage(
      gachaData.find(item => item.id === id),
      characters
    );
  };

  const handleSubmit = () => {
    if (creating) return;
    const target = gachaData.find(item => item.id === parseInt(selectedId));
    const next = {};
    if (!target?.id) next.selectedId = "請選擇要上架的角色";
    if (!isValidPrice(price)) next.price = "價格請輸入 1 以上的整數";
    if (!itemImage.trim()) next.itemImage = "請填寫大圖網址";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      id: target.id,
      item_image: itemImage.trim(),
      price: parseInt(price),
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          aria-label="返回商店列表"
          onClick={onCancel}
          disabled={creating}
          sx={{ width: 44, height: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          新增商品
        </Typography>
      </Box>

      {loadState === "loading" && <Skeleton variant="rounded" height={240} animation="wave" />}
      {loadState === "error" && (
        <LoadError message="角色與圖片資料載入失敗，請檢查網路後再試一次。" onRetry={load} />
      )}

      {/* Form Card */}
      {loadState === "ready" && (
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
            {nameList.length === 0 && (
              <Alert severity="info">卡池裡的角色都已經上架，沒有可以新增的商品。</Alert>
            )}
            <TextField
              fullWidth
              label="名稱"
              variant="outlined"
              required
              select
              value={selectedId}
              onChange={handleCharacterChange}
              disabled={nameList.length === 0}
              error={Boolean(errors.selectedId)}
              helperText={errors.selectedId}
            >
              {nameList.map(item => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              label="價格（女神石）"
              variant="outlined"
              required
              type="number"
              value={price}
              onChange={e => {
                setPrice(e.target.value);
                setErrors(prev => ({ ...prev, price: undefined }));
              }}
              error={Boolean(errors.price)}
              helperText={errors.price}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
            />

            <TextField
              fullWidth
              label="大圖網址"
              variant="outlined"
              required
              value={itemImage}
              onChange={e => {
                setItemImage(e.target.value);
                setErrors(prev => ({ ...prev, itemImage: undefined }));
              }}
              error={Boolean(errors.itemImage)}
              helperText={errors.itemImage}
            />

            {preview && (
              <Paper variant="outlined" sx={{ borderRadius: 2, p: 1 }}>
                <Box
                  component="img"
                  src={preview}
                  alt="商品大圖預覽"
                  sx={{ maxWidth: "100%", borderRadius: 1, display: "block" }}
                />
              </Paper>
            )}

            {/* Buttons */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button
                variant="outlined"
                color="inherit"
                onClick={onCancel}
                disabled={creating}
                sx={{ minHeight: 44 }}
              >
                取消
              </Button>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={creating || nameList.length === 0}
                sx={{ minHeight: 44 }}
              >
                {creating ? "新增中…" : "新增"}
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
