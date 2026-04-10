import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Stack,
  Paper,
  IconButton,
  Chip,
  Autocomplete,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import HintSnackBar from "../../../components/HintSnackBar";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaBannerService from "../../../services/gachaBanner";
import * as gachaPoolService from "../../../services/gachaPool";

const TYPE_OPTIONS = [
  { value: "rate_up", label: "機率提升" },
  { value: "europe", label: "歐洲抽" },
];

const EMPTY_FORM = {
  name: "",
  type: "rate_up",
  rate_boost: 150,
  cost: 0,
  start_at: "",
  end_at: "",
  is_active: true,
  characterIds: [],
};

function toLocalDateTimeString(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function GachaBannerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const poolData = await gachaPoolService.fetchData();
      const ssrCharacters = poolData
        .filter(c => parseInt(c.star, 10) === 3)
        .map(c => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }));
      setCharacters(ssrCharacters);

      if (isEdit) {
        const banner = await gachaBannerService.fetchBanner(id);
        setFormData({
          name: banner.name || "",
          type: banner.type || "rate_up",
          rate_boost: banner.rate_boost || 0,
          cost: banner.cost || 0,
          start_at: toLocalDateTimeString(banner.start_at),
          end_at: toLocalDateTimeString(banner.end_at),
          is_active: Boolean(banner.is_active),
          characterIds: banner.characterIds || [],
        });
      }
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, showHint]);

  useEffect(() => {
    document.title = isEdit ? "編輯轉蛋活動" : "新增轉蛋活動";
    fetchInitialData();
  }, [isEdit, fetchInitialData]);

  const handleChange = field => e => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showHint("請輸入活動名稱", "warning");
      return;
    }
    if (!formData.start_at || !formData.end_at) {
      showHint("請設定活動時間", "warning");
      return;
    }
    if (new Date(formData.start_at) >= new Date(formData.end_at)) {
      showHint("結束時間必須晚於開始時間", "warning");
      return;
    }

    const payload = {
      name: formData.name,
      type: formData.type,
      rate_boost: formData.type === "rate_up" ? parseInt(formData.rate_boost, 10) : 0,
      cost: formData.type === "europe" ? parseInt(formData.cost, 10) : 0,
      start_at: new Date(formData.start_at).toISOString(),
      end_at: new Date(formData.end_at).toISOString(),
      is_active: formData.is_active,
      characterIds: formData.type === "rate_up" ? formData.characterIds : [],
    };

    try {
      setSaving(true);
      if (isEdit) {
        await gachaBannerService.updateBanner(Number(id), payload);
      } else {
        await gachaBannerService.createBanner(payload);
      }
      showHint(isEdit ? "更新成功" : "新增成功", "success");
      setTimeout(() => navigate("/admin/gacha-banner"), 800);
    } catch {
      showHint(isEdit ? "更新失敗" : "新增失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FullPageLoading />;
  }

  const selectedCharacters = characters.filter(c => formData.characterIds.includes(c.id));

  return (
    <Box sx={{ width: "100%", maxWidth: 640, mx: "auto", pb: 10 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton
          onClick={() => navigate("/admin/gacha-banner")}
          sx={{
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" },
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isEdit ? "編輯活動" : "新增活動"}
        </Typography>
      </Stack>

      {/* Form */}
      <Paper
        elevation={0}
        sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, border: 1, borderColor: "divider" }}
      >
        <Stack spacing={2.5}>
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700 }}>
            基本設定
          </Typography>

          <TextField
            fullWidth
            label="活動名稱"
            value={formData.name}
            onChange={handleChange("name")}
            required
          />

          <TextField
            fullWidth
            select
            label="活動類型"
            value={formData.type}
            onChange={handleChange("type")}
          >
            {TYPE_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {/* 時間設定 */}
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}>
            活動時間
          </Typography>

          <Stack direction={isMobile ? "column" : "row"} spacing={2}>
            <TextField
              fullWidth
              label="開始時間"
              type="datetime-local"
              value={formData.start_at}
              onChange={handleChange("start_at")}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth
              label="結束時間"
              type="datetime-local"
              value={formData.end_at}
              onChange={handleChange("end_at")}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {/* rate_up 專用欄位 */}
          {formData.type === "rate_up" && (
            <>
              <Typography
                variant="overline"
                sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}
              >
                機率提升設定
              </Typography>

              <TextField
                fullWidth
                label="機率加成基數"
                value={formData.rate_boost}
                onChange={handleChange("rate_boost")}
                type="number"
                helperText="輸入 100 → 角色機率 ×2 倍、150 → ×2.5 倍、200 → ×3 倍"
                slotProps={{ htmlInput: { min: 0, max: 1000, step: 10 } }}
              />

              <Autocomplete
                multiple
                options={characters}
                getOptionLabel={option => option.name}
                value={selectedCharacters}
                onChange={(_, newValue) =>
                  setFormData(prev => ({
                    ...prev,
                    characterIds: newValue.map(c => c.id),
                  }))
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      key={option.id}
                    />
                  ))
                }
                renderInput={params => (
                  <TextField
                    {...params}
                    label="選擇加成角色（僅 SSR）"
                    placeholder="搜尋角色名稱..."
                  />
                )}
              />
            </>
          )}

          {/* europe 專用欄位 */}
          {formData.type === "europe" && (
            <>
              <Typography
                variant="overline"
                sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}
              >
                歐洲抽設定
              </Typography>

              <TextField
                fullWidth
                label="花費女神石"
                value={formData.cost || ""}
                onChange={handleChange("cost")}
                type="number"
                placeholder="10000"
                helperText="留空則使用系統預設值（每次抽卡花費 10,000 女神石）"
                slotProps={{ htmlInput: { min: 0, step: 100 } }}
              />
            </>
          )}

          {/* 啟用開關 */}
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
              />
            }
            label="立即啟用此活動"
            sx={{ mt: 1 }}
          />
        </Stack>
      </Paper>

      {/* Sticky Save Button */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: { xs: 0, md: 260 },
          right: 0,
          p: 2,
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
          zIndex: t => t.zIndex.appBar - 1,
          backdropFilter: "blur(8px)",
          backgroundColor: isDark ? "rgba(10,26,42,0.92)" : "rgba(255,255,255,0.92)",
        }}
      >
        <Box sx={{ maxWidth: 640, mx: "auto" }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ py: 1.5, fontWeight: 700, fontSize: "1rem", borderRadius: 2, boxShadow: 3 }}
          >
            {saving ? "儲存中..." : isEdit ? "儲存變更" : "新增活動"}
          </Button>
        </Box>
      </Box>

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
