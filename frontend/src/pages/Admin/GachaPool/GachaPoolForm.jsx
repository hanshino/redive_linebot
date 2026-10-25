import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { alpha } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import HintSnackBar from "../../../components/HintSnackBar";
import LoadError from "../../../components/LoadError";
import { bottomNavSpace } from "../../../components/BottomNav";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaPoolService from "../../../services/gachaPool";
import { errorText } from "../_errors";
import { STAR_META, STAR_OPTIONS, starColors, fmtRate } from "./stars";

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
  // 整個卡池只在載入時抓一次：編輯要找角色、機率預覽要算同星等的其他角色
  const [pool, setPool] = useState([]);
  // 編輯時角色原本的星等與機率，預覽才能扣掉「舊值」
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  // 儲存成功後到換頁之間也要鎖住按鈕，避免重複送出
  const [saved, setSaved] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [errors, setErrors] = useState({});
  const navTimerRef = useRef(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchPool = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const data = await gachaPoolService.fetchData();
      setPool(
        data.map(d => ({ id: Number(d.id), star: parseInt(d.star, 10), rate: parseFloat(d.rate) }))
      );
      if (isEdit) {
        const character = data.find(d => d.id === Number(id));
        if (!character) {
          setLoadError("notfound");
          return;
        }
        const parsedRate = parseFloat(character.rate);
        const star = Number(character.star) || 3;
        setOriginal({ star, rate: isNaN(parsedRate) ? 0 : parsedRate });
        setFormData({
          name: character.name || "",
          imageUrl: character.imageUrl || "",
          star,
          rate: isNaN(parsedRate) ? "" : parsedRate,
          isPrincess: parseInt(character.isPrincess, 10) ?? 1,
          tag: character.tag || "",
        });
      }
    } catch {
      // 編輯模式載入失敗時不能顯示空白表單，否則一按儲存就會用空資料覆蓋原角色
      setLoadError("failed");
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    document.title = isEdit ? "編輯角色" : "新增角色";
    fetchPool();
  }, [isEdit, fetchPool]);

  useEffect(() => () => clearTimeout(navTimerRef.current), []);

  const handleChange = field => e => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // 改到的欄位就清掉它的錯誤，不用等下一次送出
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
    if (field === "imageUrl") setImgError(false);
  };

  const cleanUrl = url =>
    url
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .trim();

  const handleImageUrlBlur = () => {
    const cleaned = cleanUrl(formData.imageUrl);
    if (cleaned !== formData.imageUrl) {
      setFormData(prev => ({ ...prev, imageUrl: cleaned }));
    }
  };

  const validate = () => {
    const next = {};
    if (!formData.name.trim()) next.name = "請輸入角色名稱";

    const parsedRateValue = parseFloat(formData.rate);
    if (formData.rate === "" || isNaN(parsedRateValue)) next.rate = "請輸入機率";
    else if (parsedRateValue < 0) next.rate = "機率不能小於 0";

    const cleanedImageUrl = cleanUrl(formData.imageUrl);
    if (cleanedImageUrl && !cleanedImageUrl.startsWith("https://"))
      next.imageUrl = "圖片網址必須以 https:// 開頭";
    return next;
  };

  const handleSave = async () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: formData.name.trim(),
      headImage_url: cleanUrl(formData.imageUrl),
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
      setSaved(true);
      showHint(
        isEdit ? `已更新角色「${payload.name}」` : `已新增角色「${payload.name}」`,
        "success"
      );
      navTimerRef.current = setTimeout(() => navigate("/admin/gacha-pool"), 800);
    } catch (e) {
      showHint(
        errorText(e, `${isEdit ? "更新" : "新增"}角色失敗，內容還沒儲存，請檢查網路後再試一次。`),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // 這個星等目前的總機率 → 套用輸入值後的總機率
  const ratePreview = useMemo(() => {
    const star = Number(formData.star);
    const editingId = isEdit ? Number(id) : null;
    const others = pool
      .filter(p => p.star === star && p.id !== editingId)
      .reduce((sum, p) => sum + (Number(p.rate) || 0), 0);
    const ownSaved = original && original.star === star ? original.rate : 0;
    const input = parseFloat(formData.rate);
    return {
      before: others + ownSaved,
      after: others + (isNaN(input) || input < 0 ? 0 : input),
      hasInput: !isNaN(input) && input >= 0,
    };
  }, [pool, original, formData.star, formData.rate, isEdit, id]);

  if (loading) {
    return <FullPageLoading />;
  }

  if (loadError) {
    return loadError === "notfound" ? (
      <LoadError
        message="找不到這個角色，它可能已被刪除。"
        onRetry={() => navigate("/admin/gacha-pool")}
        retryText="回卡池列表"
      />
    ) : (
      <LoadError message="卡池資料載入失敗，請檢查網路後再試一次。" onRetry={fetchPool} />
    );
  }

  const starCfg = starColors(theme, formData.star);
  const starLabel = (STAR_META[formData.star] || STAR_META[1]).full;
  const busy = saving || saved;

  // 手機底部有固定導覽列，吸底儲存列要疊在它上面，內容也要多留空間
  return (
    <Box sx={{ width: "100%", maxWidth: 640, mx: "auto", pb: { xs: 22, sm: 10 } }}>
      {/* Header */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          mb: 3,
        }}
      >
        <IconButton
          aria-label="返回卡池列表"
          onClick={() => navigate("/admin/gacha-pool")}
          sx={{ bgcolor: "action.hover", width: 44, height: 44 }}
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
          background: `linear-gradient(135deg, ${starCfg.bg} 0%, transparent 100%)`,
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
              boxShadow: `0 0 0 4px ${starCfg.bg}, 0 8px 24px ${alpha(theme.palette.common.black, 0.12)}`,
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
              bgcolor: "action.hover",
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
            {starLabel}
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
          <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 700 }}>
            基本資訊
          </Typography>

          <TextField
            fullWidth
            label="角色名稱"
            value={formData.name}
            onChange={handleChange("name")}
            required
            error={Boolean(errors.name)}
            helperText={errors.name}
          />

          <TextField
            fullWidth
            label="圖片網址"
            value={formData.imageUrl}
            onChange={handleChange("imageUrl")}
            onBlur={handleImageUrlBlur}
            placeholder="https://..."
            error={Boolean(errors.imageUrl)}
            helperText={errors.imageUrl}
          />

          {/* Section: Gacha Settings */}
          <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}>
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
              {STAR_OPTIONS.map(opt => (
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
              required
              error={Boolean(errors.rate)}
              helperText={
                errors.rate ||
                `此星級總機率 ${fmtRate(ratePreview.before)} → ${fmtRate(ratePreview.after)}${ratePreview.hasInput ? "" : "（填入機率後更新）"}`
              }
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
              {princessOptions.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField fullWidth label="標籤" value={formData.tag} onChange={handleChange("tag")} />
          </Stack>
        </Stack>
      </Paper>
      {/* Sticky Save Button */}
      <Box
        sx={{
          position: "fixed",
          bottom: { xs: bottomNavSpace, sm: 0 },
          left: { xs: 0, md: 260 },
          right: 0,
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          zIndex: t => t.zIndex.appBar - 1,
          backdropFilter: "blur(8px)",
          backgroundColor: t => alpha(t.palette.background.paper, 0.92),
        }}
      >
        <Box sx={{ maxWidth: 640, mx: "auto" }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={busy}
            sx={{ py: 1.5, fontWeight: 700, fontSize: "1rem", borderRadius: 2 }}
          >
            {saved ? "已儲存，返回列表…" : saving ? "儲存中..." : isEdit ? "儲存變更" : "新增角色"}
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
