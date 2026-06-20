import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  CircularProgress,
} from "@mui/material";

function toLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const empty = { code: "", start: "", end: "", reward: "" };

export default function CouponFormDialog({ open, editing, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    setForm(
      editing
        ? {
            code: editing.code,
            start: toLocal(editing.start_at),
            end: toLocal(editing.end_at),
            reward: String(editing.reward?.value ?? ""),
          }
        : empty
    );
  }, [open, editing]);

  const codeLocked = !!(editing && editing.redeemedCount > 0);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const next = {};
    if (!form.code.trim()) next.code = "必填";
    if (form.code.length > 50) next.code = "最多 50 字";
    if (!form.start) next.start = "必填";
    if (!form.end) next.end = "必填";
    if (form.start && form.end && new Date(form.end) <= new Date(form.start))
      next.end = "結束須晚於開始";
    if (!form.reward || Number(form.reward) < 1) next.reward = "需 ≥ 1";
    setErr(next);
    if (Object.keys(next).length) return;
    onSubmit({
      code: form.code.trim(),
      startAt: new Date(form.start).toISOString(),
      endAt: new Date(form.end).toISOString(),
      reward: Number(form.reward),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "編輯 coupon" : "新增 coupon"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="兌換碼"
            value={form.code}
            onChange={set("code")}
            disabled={codeLocked}
            error={!!err.code}
            helperText={err.code || (codeLocked ? "已有人領取，無法修改" : "最多 50 字")}
            inputProps={{ maxLength: 50 }}
            fullWidth
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="開始時間"
              type="datetime-local"
              value={form.start}
              onChange={set("start")}
              error={!!err.start}
              helperText={err.start}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="結束時間"
              type="datetime-local"
              value={form.end}
              onChange={set("end")}
              error={!!err.end}
              helperText={err.end}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <TextField
            label="女神石數量"
            type="number"
            value={form.reward}
            onChange={set("reward")}
            error={!!err.reward}
            helperText={err.reward}
            inputProps={{ min: 1 }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {editing ? "儲存" : "新增"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
