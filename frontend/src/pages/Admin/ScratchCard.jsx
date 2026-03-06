import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Paper,
  Grid,
  IconButton,
  Chip,
  Skeleton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import * as scratchCardService from "../../services/scratchCard";

export default function AdminScratchCard() {
  const [cardList, setCardList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [options, setOptions] = useState([]);
  const [generateCount, setGenerateCount] = useState(1);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await scratchCardService.fetchCards();
      setCardList(data || []);
      if (data && data.length > 0) {
        setSelected(data[0]);
        setOptions([{ reward: data[0].max_reward, count: 1 }]);
      }
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "刮刮卡管理";
    fetchData();
  }, [fetchData]);

  const handleCardChange = (e) => {
    const id = parseInt(e.target.value);
    const target = cardList.find((c) => c.id === id);
    if (target) {
      setSelected(target);
    }
  };

  const handleOptionChange = (index, field, value) => {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed < 0) return;
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, [field]: parsed } : opt))
    );
  };

  const handleAddOption = () => {
    const lastReward = options.length > 0 ? options[options.length - 1].reward : 0;
    setOptions((prev) => [...prev, { reward: Math.floor(lastReward / 2), count: 1 }]);
  };

  const handleRemoveOption = (index) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const submitOptions = [...options, noneRewardOption];
    try {
      setGenerateLoading(true);
      await scratchCardService.generateCards({
        id: selected.id,
        data: submitOptions,
      });
      showHint("產生成功", "success");
    } catch {
      showHint("產生失敗", "error");
    } finally {
      setGenerateLoading(false);
    }
  };

  const pageLoading = loading || generateLoading;

  // Skeleton loading state
  if (loading && !selected) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={180} />
        <Skeleton variant="rounded" height={100} />
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (!selected) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>沒有可用的刮刮卡資料</Typography>
      </Box>
    );
  }

  const totalReward = options.reduce((acc, opt) => acc + opt.reward * opt.count, 0);
  const totalCount = options.reduce((acc, opt) => acc + opt.count, 0);

  // Auto-adjust generateCount if it's less than totalCount
  const effectiveGenerateCount = Math.max(generateCount, totalCount);

  const noneRewardOption = {
    reward: 0,
    count: effectiveGenerateCount - totalCount,
  };

  const rows = [...options, noneRewardOption].map((opt, index) => ({
    id: index,
    reward: opt.reward,
    count: opt.count,
    rate: Math.round((opt.count / effectiveGenerateCount) * 10000) / 100 + "%",
  }));

  const summaryItems = [
    { label: "單張售價", value: selected.price },
    { label: "數量", value: effectiveGenerateCount },
    { label: "總價", value: selected.price * effectiveGenerateCount },
    { label: "總獎勵", value: totalReward },
    { label: "利潤", value: selected.price * effectiveGenerateCount - totalReward },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Gradient Banner */}
      <Paper
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 3,
          px: { xs: 2.5, sm: 3 },
          py: { xs: 2, sm: 2.5 },
          minHeight: 120,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          }}
        />
        <ConfirmationNumberIcon
          sx={{ position: "relative", fontSize: 48, color: "rgba(255,255,255,0.8)" }}
        />
        <Box sx={{ position: "relative", flex: 1 }}>
          <Typography variant="h5" fontWeight={700} color="#fff">
            刮刮卡管理
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", mt: 0.5 }}>
            庫存生成
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
            <Chip
              label={`共 ${cardList.length} 種卡片`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              label={`選取：${selected.name}`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
          </Box>
        </Box>
      </Paper>

      {/* Card Selector */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          選擇卡片
        </Typography>
        <TextField
          fullWidth
          variant="outlined"
          select
          value={selected.id}
          onChange={handleCardChange}
        >
          {cardList.map((card) => (
            <MenuItem key={card.id} value={card.id}>
              {card.name}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {/* Summary */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          小計
        </Typography>
        <Grid container spacing={2}>
          {summaryItems.map(({ label, value }) => (
            <Grid key={label} size={{ xs: 6, sm: 4 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body1" fontWeight={700}>
                  {value}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Preview Table */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          獎勵預覽
        </Typography>
        <Box>
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              pb: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              獎勵
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ width: 80 }}>
              數量
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ width: 80 }}>
              中獎率
            </Typography>
          </Box>
          {/* Rows */}
          {rows.map((row, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                gap: 1,
                py: 1,
                borderBottom: index < rows.length - 1 ? "1px solid" : "none",
                borderColor: "divider",
              }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {row.reward}
              </Typography>
              <Typography variant="body2" sx={{ width: 80 }}>
                {row.count}
              </Typography>
              <Typography variant="body2" sx={{ width: 80 }}>
                {row.rate}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Generate Count */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          生成數量
        </Typography>
        <TextField
          variant="outlined"
          fullWidth
          label="數量"
          type="number"
          value={effectiveGenerateCount}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val > 0) setGenerateCount(val);
          }}
        />
      </Paper>

      {/* Options Builder */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          獎勵選項
        </Typography>
        {options.map((option, index) => {
          const isLast = index === options.length - 1;
          return (
            <Grid container spacing={1} key={index} sx={{ mb: 1 }} alignItems="center">
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="獎勵"
                  type="number"
                  value={option.reward}
                  onChange={(e) => handleOptionChange(index, "reward", e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="數量"
                  type="number"
                  value={option.count}
                  onChange={(e) => handleOptionChange(index, "count", e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 2 }}>
                <IconButton
                  onClick={() => (isLast ? handleAddOption() : handleRemoveOption(index))}
                >
                  {isLast ? <AddIcon /> : <RemoveIcon />}
                </IconButton>
              </Grid>
            </Grid>
          );
        })}
        {options.length === 0 && (
          <Button startIcon={<AddIcon />} onClick={handleAddOption}>
            新增獎勵選項
          </Button>
        )}
      </Paper>

      {/* Generate Button */}
      <Button
        variant="contained"
        fullWidth
        color="primary"
        onClick={handleSubmit}
        disabled={pageLoading}
        sx={{ borderRadius: 3, py: 1.5 }}
      >
        產生
      </Button>

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
