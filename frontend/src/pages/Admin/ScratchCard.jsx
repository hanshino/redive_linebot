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
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import * as scratchCardService from "../../services/scratchCard";

const previewColumns = [
  { field: "reward", headerName: "獎勵", flex: 1 },
  { field: "count", headerName: "數量", width: 120 },
  { field: "rate", headerName: "中獎率", width: 120 },
];

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

  if (loading && !selected) {
    return <FullPageLoading />;
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

  return (
    <Box sx={{ width: "100%" }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        庫存生成
      </Typography>

      {/* Card selector */}
      <TextField
        fullWidth
        variant="outlined"
        select
        value={selected.id}
        onChange={handleCardChange}
        sx={{ mb: 2 }}
      >
        {cardList.map((card) => (
          <MenuItem key={card.id} value={card.id}>
            {card.name}
          </MenuItem>
        ))}
      </TextField>

      {/* Summary */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          小計
        </Typography>
        <Typography variant="body1">單張售價：{selected.price}</Typography>
        <Typography variant="body1">數量：{effectiveGenerateCount}</Typography>
        <Typography variant="body1">總價：{selected.price * effectiveGenerateCount}</Typography>
        <Typography variant="body1">總獎勵：{totalReward}</Typography>
        <Typography variant="body1">
          利潤：{selected.price * effectiveGenerateCount - totalReward}
        </Typography>
      </Paper>

      {/* Preview DataGrid */}
      <Box sx={{ height: 300, width: "100%", mb: 2 }}>
        <DataGrid
          rows={rows}
          columns={previewColumns}
          hideFooter
          disableColumnFilter
          disableColumnMenu
          disableColumnSelector
          disableRowSelectionOnClick
        />
      </Box>

      {/* Generate count */}
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
        sx={{ mb: 2 }}
      />

      {/* Options */}
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
        <Button startIcon={<AddIcon />} onClick={handleAddOption} sx={{ mb: 2 }}>
          新增獎勵選項
        </Button>
      )}

      {/* Generate button */}
      <Button
        variant="contained"
        fullWidth
        color="primary"
        onClick={handleSubmit}
        disabled={pageLoading}
        sx={{ mt: 2 }}
      >
        產生
      </Button>

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
