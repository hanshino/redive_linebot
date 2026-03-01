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
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import HintSnackBar from "../../../components/HintSnackBar";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaPoolService from "../../../services/gachaPool";

const STAR_CONFIG = {
  1: { label: "⭐ Rare (R)", color: "#6B7280", bg: "rgba(107, 114, 128, 0.1)" },
  2: { label: "⭐⭐ SuperRare (SR)", color: "#A855F7", bg: "rgba(168, 85, 247, 0.1)" },
  3: { label: "⭐⭐⭐ UltraRare (SSR)", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
};

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
  const isDark = theme.palette.mode === "dark";
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

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
        isPrincess: parseInt(character.isPrincess, 10) || 1,
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
    if (field === "imageUrl") setImgError(false);
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

  const starCfg = STAR_CONFIG[formData.star] || STAR_CONFIG[1];

  return (
    <Box sx={{ width: "100%", maxWidth: 640, mx: "auto", pb: 10 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton
          onClick={() => navigate("/admin/gacha-pool")}
          sx={{
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" },
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isEdit ? "編輯角色" : "新增角色"}
        </Typography>
      </Stack>

      {/* Image Preview Card */}
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          p: { xs: 3, sm: 4 },
          mb: 3,
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
          background: isDark
            ? `linear-gradient(135deg, ${starCfg.bg} 0%, transparent 100%)`
            : `linear-gradient(135deg, ${starCfg.bg} 0%, rgba(255,255,255,0) 100%)`,
          transition: "background 0.3s",
        }}
      >
        {formData.imageUrl && !imgError ? (
          <Avatar
            src={formData.imageUrl}
            alt={formData.name || "角色預覽"}
            onError={() => setImgError(true)}
            sx={{
              width: 120,
              height: 120,
              border: 3,
              borderColor: starCfg.color,
              boxShadow: `0 0 0 4px ${starCfg.bg}, 0 8px 24px rgba(0,0,0,0.12)`,
            }}
          />
        ) : (
          <Box
            sx={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: 2,
              borderStyle: "dashed",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            }}
          >
            <BrokenImageIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          </Box>
        )}
        {formData.name && (
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
            {formData.name}
          </Typography>
        )}
        {formData.star && (
          <Typography variant="caption" sx={{ color: starCfg.color, fontWeight: 700, mt: 0.5 }}>
            {starCfg.label}
          </Typography>
        )}
      </Paper>

      {/* Form Card */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Stack spacing={2.5}>
          {/* Section: Basic Info */}
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700 }}>
            基本資訊
          </Typography>

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

          {/* Section: Gacha Settings */}
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}>
            轉蛋設定
          </Typography>

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
          zIndex: (t) => t.zIndex.appBar - 1,
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
            {saving ? "儲存中..." : isEdit ? "儲存變更" : "新增角色"}
          </Button>
        </Box>
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
