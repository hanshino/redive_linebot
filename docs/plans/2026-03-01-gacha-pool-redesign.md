# Gacha Pool Admin Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the `/admin/gacha-pool` page from a basic DataGrid+Dialog into a modern two-page CRUD interface (list page + full-screen form page), optimized for both desktop and mobile.

**Architecture:** Replace the single `GachaPool.jsx` with a folder containing two components: a list page (`index.jsx`) with search/filter/DataGrid, and a form page (`GachaPoolForm.jsx`) for create/edit. New routes added in `App.jsx`. Backend API and `services/gachaPool.js` unchanged.

**Tech Stack:** React 19, MUI v7, MUI X DataGrid v8, React Router v7, Emotion CSS-in-JS

---

### Task 1: Create List Page — `GachaPool/index.jsx`

**Files:**
- Create: `frontend/src/pages/Admin/GachaPool/index.jsx`
- Delete: `frontend/src/pages/Admin/GachaPool.jsx` (old single-file component)

**Step 1: Create the directory**

```bash
mkdir -p frontend/src/pages/Admin/GachaPool
```

**Step 2: Write the list page**

Create `frontend/src/pages/Admin/GachaPool/index.jsx` with:

```jsx
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import { FullPageLoading } from "../../../components/Loading";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaPoolService from "../../../services/gachaPool";

const STAR_FILTERS = [
  { label: "全部", value: null },
  { label: "⭐⭐⭐ SSR", value: 3 },
  { label: "⭐⭐ SR", value: 2 },
  { label: "⭐ R", value: 1 },
];

const STAR_CHIP_COLORS = {
  3: { bg: "secondary.main", text: "secondary.contrastText" },
  2: { bg: "info.main", text: "info.contrastText" },
  1: { bg: "text.secondary", text: "background.paper" },
};

export default function AdminGachaPool() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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

  const starChip = (value) => {
    const colors = STAR_CHIP_COLORS[value] || STAR_CHIP_COLORS[1];
    const labels = { 3: "SSR", 2: "SR", 1: "R" };
    return (
      <Chip
        label={labels[value] || value}
        size="small"
        sx={{
          bgcolor: colors.bg,
          color: colors.text,
          fontWeight: 700,
          fontSize: "0.75rem",
        }}
      />
    );
  };

  const columns = [
    {
      field: "imageUrl",
      headerName: "頭像",
      width: 64,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar
          alt={params.row.name}
          src={params.value}
          sx={{ width: 36, height: 36 }}
        />
      ),
    },
    { field: "name", headerName: "名稱", flex: 1, minWidth: 100 },
    {
      field: "star",
      headerName: "星等",
      width: 90,
      renderCell: (params) => starChip(params.value),
    },
    {
      field: "rate",
      headerName: "機率",
      width: 90,
      valueFormatter: (value) => `${value}%`,
    },
    ...(!isMobile
      ? [
          {
            field: "isPrincess",
            headerName: "公主",
            width: 80,
            renderCell: (params) => (
              <Chip
                label={params.value === 1 ? "是" : "否"}
                size="small"
                variant={params.value === 1 ? "filled" : "outlined"}
                color={params.value === 1 ? "success" : "default"}
              />
            ),
          },
          { field: "tag", headerName: "標籤", width: 100 },
        ]
      : []),
    {
      field: "actions",
      headerName: "",
      width: 96,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => navigate(`/admin/gacha-pool/${params.row.id}/edit`)}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteClick(params.row)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  if (loading && rows.length === 0) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">卡池管理</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/admin/gacha-pool/new")}
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
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
      />

      {/* Star Filter Chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        {STAR_FILTERS.map((f) => (
          <Chip
            key={f.label}
            label={f.label}
            variant={starFilter === f.value ? "filled" : "outlined"}
            color={starFilter === f.value ? "primary" : "default"}
            onClick={() => setStarFilter(f.value)}
            sx={{ fontWeight: starFilter === f.value ? 700 : 400 }}
          />
        ))}
      </Stack>

      {/* DataGrid */}
      <Box sx={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          disableRowSelectionOnClick
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "background.default",
              fontWeight: 700,
            },
            "& .MuiDataGrid-row:hover": {
              bgcolor: "action.hover",
            },
          }}
        />
      </Box>

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
```

**Step 3: Delete old file**

```bash
rm frontend/src/pages/Admin/GachaPool.jsx
```

**Step 4: Verify import still works**

The import in `App.jsx` is `import AdminGachaPool from "./pages/Admin/GachaPool"` — this resolves to `GachaPool/index.jsx` automatically. No change needed in `App.jsx` for this import.

**Step 5: Commit**

```bash
git add frontend/src/pages/Admin/GachaPool/index.jsx
git add frontend/src/pages/Admin/GachaPool.jsx
git commit -m "feat: redesign gacha-pool list page with search and star filter"
```

---

### Task 2: Create Form Page — `GachaPool/GachaPoolForm.jsx`

**Files:**
- Create: `frontend/src/pages/Admin/GachaPool/GachaPoolForm.jsx`

**Step 1: Write the form page**

Create `frontend/src/pages/Admin/GachaPool/GachaPoolForm.jsx` with:

```jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Avatar,
  Stack,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import HintSnackBar from "../../../components/HintSnackBar";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaPoolService from "../../../services/gachaPool";

const starOptions = [
  { value: 1, label: "⭐ Rare (R)" },
  { value: 2, label: "⭐⭐ SuperRare (SR)" },
  { value: 3, label: "⭐⭐⭐ UltraRare (SSR)" },
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

export default function GachaPoolForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchCharacter = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaPoolService.fetchData();
      const character = data.find((d) => d.id === Number(id));
      if (!character) {
        showHint("找不到該角色", "error");
        navigate("/admin/gacha-pool");
        return;
      }
      setFormData({
        name: character.name || "",
        imageUrl: character.imageUrl || "",
        star: Number(character.star) || 3,
        rate: parseFloat(character.rate) || "",
        isPrincess: parseInt(character.isPrincess) ?? 1,
        tag: character.tag || "",
      });
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, showHint]);

  useEffect(() => {
    document.title = isEdit ? "編輯角色" : "新增角色";
    if (isEdit) {
      fetchCharacter();
    }
  }, [isEdit, fetchCharacter]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showHint("請輸入角色名稱", "warning");
      return;
    }

    const payload = {
      name: formData.name,
      headImage_url: formData.imageUrl,
      star: formData.star,
      rate: formData.rate,
      is_princess: formData.isPrincess,
      tag: formData.tag,
    };

    try {
      setSaving(true);
      if (isEdit) {
        await gachaPoolService.updateData(Number(id), payload);
      } else {
        await gachaPoolService.insertData(payload);
      }
      showHint(isEdit ? "更新成功" : "新增成功", "success");
      setTimeout(() => navigate("/admin/gacha-pool"), 800);
    } catch {
      showHint(isEdit ? "更新失敗" : "新增失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%", maxWidth: 720, mx: "auto" }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate("/admin/gacha-pool")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">{isEdit ? "編輯角色" : "新增角色"}</Typography>
      </Stack>

      {/* Image Preview */}
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          p: 3,
          mb: 3,
          borderRadius: 2,
          border: 1,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Avatar
          src={formData.imageUrl}
          alt={formData.name || "角色預覽"}
          sx={{ width: 120, height: 120, fontSize: 48 }}
        >
          {formData.name?.charAt(0) || "?"}
        </Avatar>
      </Paper>

      {/* Form Fields */}
      <Stack spacing={2.5}>
        <TextField
          fullWidth
          label="角色名稱"
          value={formData.name}
          onChange={handleChange("name")}
          required
        />

        <TextField
          fullWidth
          label="圖片網址"
          value={formData.imageUrl}
          onChange={handleChange("imageUrl")}
          placeholder="https://..."
        />

        {/* Two-column row on desktop, stacked on mobile */}
        <Stack direction={isMobile ? "column" : "row"} spacing={2}>
          <TextField
            fullWidth
            select
            label="星等"
            value={formData.star}
            onChange={handleChange("star")}
          >
            {starOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            label="機率 (%)"
            value={formData.rate}
            onChange={handleChange("rate")}
            type="number"
            slotProps={{ htmlInput: { step: "0.001", min: "0" } }}
          />
        </Stack>

        <Stack direction={isMobile ? "column" : "row"} spacing={2}>
          <TextField
            fullWidth
            select
            label="公主角色"
            value={formData.isPrincess}
            onChange={handleChange("isPrincess")}
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
            onChange={handleChange("tag")}
          />
        </Stack>
      </Stack>

      {/* Save Button */}
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          pt: 3,
          pb: 2,
          bgcolor: "background.paper",
          zIndex: 1,
        }}
      >
        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{ py: 1.5, fontWeight: 700, fontSize: "1rem" }}
        >
          {saving ? "儲存中..." : isEdit ? "儲存變更" : "新增角色"}
        </Button>
      </Box>

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
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Admin/GachaPool/GachaPoolForm.jsx
git commit -m "feat: add gacha-pool full-screen form page for create/edit"
```

---

### Task 3: Add Routes in `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx:25,81`

**Step 1: Add import for GachaPoolForm**

After line 25 (`import AdminGachaPool`), add:

```jsx
import AdminGachaPoolForm from "./pages/Admin/GachaPool/GachaPoolForm";
```

**Step 2: Add new routes**

After line 81 (`<Route path="admin/gacha-pool" element={<AdminGachaPool />} />`), add:

```jsx
<Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
<Route path="admin/gacha-pool/:id/edit" element={<AdminGachaPoolForm />} />
```

Note: The `/new` route must come before `/:id/edit` — React Router v7 handles this correctly, but ordering specific routes before parameterized ones is good practice.

**Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add routes for gacha-pool create/edit form pages"
```

---

### Task 4: Manual Smoke Test

**Step 1: Start the frontend dev server**

```bash
cd frontend && yarn start
```

**Step 2: Test the list page**

- Navigate to `/admin/gacha-pool`
- Verify characters load in the DataGrid
- Type a name in search bar — verify filtering works
- Click star filter chips — verify filtering works
- Check mobile responsiveness (browser devtools toggle device toolbar)

**Step 3: Test the create flow**

- Click "新增角色" button
- Verify navigation to `/admin/gacha-pool/new`
- Fill in all fields, paste an image URL — verify preview loads
- Click save — verify redirect back to list with success snackbar
- Verify the new character appears in the list

**Step 4: Test the edit flow**

- Click edit icon on a character row
- Verify navigation to `/admin/gacha-pool/:id/edit`
- Verify form is pre-filled with character data
- Modify a field, save
- Verify redirect back to list with updated data

**Step 5: Test delete**

- Click delete icon on a character row
- Verify confirmation dialog appears
- Confirm delete
- Verify character removed from list

**Step 6: Commit all remaining changes (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address smoke test findings for gacha-pool redesign"
```
