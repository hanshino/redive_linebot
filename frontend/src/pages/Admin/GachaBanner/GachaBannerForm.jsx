import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import { alpha } from "@mui/material/styles";
import HintSnackBar from "../../../components/HintSnackBar";
import LoadError from "../../../components/LoadError";
import { bottomNavSpace } from "../../../components/BottomNav";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaBannerService from "../../../services/gachaBanner";
import * as gachaPoolService from "../../../services/gachaPool";
import { errorText } from "../_errors";
import { toLocalDateTimeString, timezoneHint } from "../_time";

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
  // 新活動預設不啟用：先設定好、確認預覽，再手動開啟，避免一存檔就對玩家生效
  is_active: false,
  characterIds: [],
};

export default function GachaBannerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [characters, setCharacters] = useState([]);
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  // 儲存成功後到換頁之間也要鎖住按鈕，避免重複送出
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const navTimerRef = useRef(null);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const [poolData, banner] = await Promise.all([
        gachaPoolService.fetchData(),
        isEdit ? gachaBannerService.fetchBanner(id) : Promise.resolve(null),
      ]);

      const ssrCharacters = poolData
        .filter(c => parseInt(c.star, 10) === 3)
        .map(c => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }));
      setCharacters(ssrCharacters);
      setPool(poolData);

      if (banner) {
        setFormData({
          name: banner.name || "",
          type: banner.type || "rate_up",
          rate_boost: banner.rate_boost ?? 0,
          cost: banner.cost || 0,
          start_at: toLocalDateTimeString(banner.start_at),
          end_at: toLocalDateTimeString(banner.end_at),
          is_active: Boolean(banner.is_active),
          characterIds: banner.characterIds || [],
        });
      }
    } catch {
      // 編輯模式載入失敗時不能顯示空白表單，否則一按儲存就會用空資料覆蓋原活動
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    document.title = isEdit ? "編輯轉蛋活動" : "新增轉蛋活動";
    fetchInitialData();
  }, [isEdit, fetchInitialData]);

  useEffect(() => () => clearTimeout(navTimerRef.current), []);

  const handleChange = field => e => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // 改到的欄位就清掉它的錯誤，不用等下一次送出
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!formData.name.trim()) next.name = "請輸入活動名稱";
    if (!formData.start_at) next.start_at = "請設定開始時間";
    if (!formData.end_at) next.end_at = "請設定結束時間";
    if (
      formData.start_at &&
      formData.end_at &&
      new Date(formData.start_at) >= new Date(formData.end_at)
    )
      next.end_at = "結束時間必須晚於開始時間";

    if (formData.type === "rate_up") {
      const boost = Number(formData.rate_boost);
      if (String(formData.rate_boost).trim() === "" || !Number.isInteger(boost) || boost < 0)
        next.rate_boost = "請輸入 0 以上的整數";
    }
    if (formData.type === "europe" && String(formData.cost).trim() !== "") {
      const cost = Number(formData.cost);
      if (!Number.isInteger(cost) || cost < 0) next.cost = "請輸入 0 以上的整數，或留空";
    }
    return next;
  };

  const handleSave = async () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      rate_boost: formData.type === "rate_up" ? Number(formData.rate_boost) : 0,
      // 留空代表使用系統預設花費，送 0
      cost: formData.type === "europe" ? Number(formData.cost) || 0 : 0,
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
      setSaved(true);
      showHint(
        isEdit ? `已更新活動「${payload.name}」` : `已新增活動「${payload.name}」`,
        "success"
      );
      navTimerRef.current = setTimeout(() => navigate("/admin/gacha-banner"), 800);
    } catch (e) {
      showHint(
        errorText(e, `${isEdit ? "更新" : "新增"}活動失敗，內容還沒儲存，請檢查網路後再試一次。`),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const ratePreview = useMemo(() => {
    if (formData.type !== "rate_up") return null;
    if (!pool || pool.length === 0) return null;

    const parseRate = r => parseFloat((r || "0").toString().replace("%", "")) || 0;
    const boost = parseFloat(formData.rate_boost) || 0;
    const multiplier = (100 + boost) / 100;
    const idSet = new Set(formData.characterIds);

    // 預設每日抽會走 filterPool(undefined) → 只留 isPrincess === "1"
    const princessPool = pool.filter(p => p.isPrincess === "1");
    const totalPre = princessPool.reduce((s, p) => s + parseRate(p.rate), 0);
    const totalPost = princessPool.reduce((s, p) => {
      const r = parseRate(p.rate);
      return s + (idSet.has(p.id) ? r * multiplier : r);
    }, 0);
    const threeStarPre = princessPool
      .filter(p => parseInt(p.star, 10) === 3)
      .reduce((s, p) => s + parseRate(p.rate), 0);
    const threeStarPost = princessPool
      .filter(p => parseInt(p.star, 10) === 3)
      .reduce((s, p) => {
        const r = parseRate(p.rate);
        return s + (idSet.has(p.id) ? r * multiplier : r);
      }, 0);

    const charactersDetail = formData.characterIds.map(cid => {
      const princessEntry = princessPool.find(p => p.id === cid);
      const fullEntry = pool.find(p => p.id === cid);
      const inPrincessPool = Boolean(princessEntry);
      const baseRate = parseRate(fullEntry && fullEntry.rate);
      const postRate = inPrincessPool ? baseRate * multiplier : 0;
      const perPull = totalPost > 0 ? postRate / totalPost : 0;
      return {
        id: cid,
        name: (fullEntry && fullEntry.name) || `#${cid}`,
        inPrincessPool,
        preRate: baseRate,
        postRate,
        perPullPct: perPull * 100,
        expectedPer10: perPull * 10,
        atLeastOnePer10Pct: (1 - Math.pow(1 - perPull, 10)) * 100,
      };
    });

    return {
      multiplier,
      characters: charactersDetail,
      totalPre,
      totalPost,
      threeStarPre,
      threeStarPost,
      threeStarPerPullPct: totalPost > 0 ? (threeStarPost / totalPost) * 100 : 0,
      expectedThreeStarPer10: totalPost > 0 ? (threeStarPost / totalPost) * 10 : 0,
    };
  }, [formData.type, formData.rate_boost, formData.characterIds, pool]);

  if (loading) {
    return <FullPageLoading />;
  }

  if (loadError) {
    return (
      <LoadError message="活動資料載入失敗，請檢查網路後再試一次。" onRetry={fetchInitialData} />
    );
  }

  const busy = saving || saved;
  const tzHint = timezoneHint();
  const selectedCharacters = characters.filter(c => formData.characterIds.includes(c.id));

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
          aria-label="返回活動列表"
          onClick={() => navigate("/admin/gacha-banner")}
          sx={{ bgcolor: "action.hover", width: 44, height: 44 }}
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
          <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 700 }}>
            基本設定
          </Typography>

          <TextField
            fullWidth
            label="活動名稱"
            value={formData.name}
            onChange={handleChange("name")}
            required
            error={Boolean(errors.name)}
            helperText={errors.name}
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
          <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}>
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
              error={Boolean(errors.start_at)}
              helperText={errors.start_at}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth
              label="結束時間"
              type="datetime-local"
              value={formData.end_at}
              onChange={handleChange("end_at")}
              required
              error={Boolean(errors.end_at)}
              helperText={errors.end_at || tzHint}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {/* rate_up 專用欄位 */}
          {formData.type === "rate_up" && (
            <>
              <Typography
                variant="subtitle2"
                sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}
              >
                機率提升設定
              </Typography>

              <TextField
                fullWidth
                label="機率加成（%）"
                value={formData.rate_boost}
                onChange={handleChange("rate_boost")}
                type="number"
                required
                error={Boolean(errors.rate_boost)}
                helperText={errors.rate_boost || "100 = 2 倍，300 = 4 倍"}
                slotProps={{ htmlInput: { min: 0, step: 10 } }}
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

              {ratePreview && ratePreview.characters.length > 0 && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "surface.subtle",
                  }}
                >
                  <Stack spacing={1.25}>
                    <Stack
                      direction="row"
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        機率預覽
                      </Typography>
                      <Chip
                        size="small"
                        label={`活動倍率 ×${ratePreview.multiplier.toFixed(2)}`}
                        color="primary"
                        variant="outlined"
                      />
                    </Stack>

                    <Divider />

                    {ratePreview.characters.map(c => (
                      <Box key={c.id}>
                        <Stack
                          direction="row"
                          sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {c.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            原本 {c.preRate.toFixed(3)}% → {c.postRate.toFixed(3)}%
                          </Typography>
                        </Stack>
                        {c.inPrincessPool ? (
                          <Stack
                            direction="row"
                            sx={{
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              mt: 0.25,
                            }}
                          >
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              單抽 {c.perPullPct.toFixed(3)}%・10 抽期望{" "}
                              {c.expectedPer10.toFixed(3)} 隻
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              10 抽至少 1 隻 {c.atLeastOnePer10Pct.toFixed(2)}%
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography variant="caption" sx={{ color: "warning.main" }}>
                            不在預設公主池，預設每日抽不會生效
                          </Typography>
                        )}
                      </Box>
                    ))}

                    <Divider />

                    <Stack
                      direction="row"
                      sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                    >
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        套用後池子單抽 3 星機率
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {ratePreview.threeStarPerPullPct.toFixed(2)}%（10 抽期望{" "}
                        {ratePreview.expectedThreeStarPer10.toFixed(2)} 隻）
                      </Typography>
                    </Stack>

                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", fontStyle: "italic" }}
                    >
                      * 以預設公主池為基準計算，實際機率為「原本機率 × (1 + 加成 ÷ 100)」
                    </Typography>
                  </Stack>
                </Box>
              )}
            </>
          )}

          {/* europe 專用欄位 */}
          {formData.type === "europe" && (
            <>
              <Typography
                variant="subtitle2"
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
                error={Boolean(errors.cost)}
                helperText={errors.cost || "留空使用預設 10,000"}
                slotProps={{ htmlInput: { min: 0, step: 100 } }}
              />
            </>
          )}

          {/* 啟用開關 */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                />
              }
              label="啟用此活動"
              sx={{ mt: 1 }}
            />
          </Box>
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
            {saved ? "已儲存，返回列表…" : saving ? "儲存中..." : isEdit ? "儲存變更" : "新增活動"}
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
