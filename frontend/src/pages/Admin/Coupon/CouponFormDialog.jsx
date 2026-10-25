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
import { toLocalDateTimeString as toLocal, timezoneHint } from "../_time";

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
  const set = k => e => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    // 改到的欄位就清掉它的錯誤，不用等下一次送出
    setErr(prev => ({ ...prev, [k]: undefined }));
  };
  const tzHint = timezoneHint();
  // 送出中不能關閉，避免請求還在跑時以為取消了
  const handleClose = () => {
    if (!saving) onClose();
  };

  const submit = () => {
    const next = {};
    if (!form.code.trim()) next.code = "必填";
    if (form.code.length > 50) next.code = "最多 50 字";
    if (!form.start) next.start = "必填";
    if (!form.end) next.end = "必填";
    if (form.start && form.end && new Date(form.end) <= new Date(form.start))
      next.end = "結束須晚於開始";
    if (!Number.isInteger(Number(form.reward)) || Number(form.reward) < 1)
      next.reward = "請輸入 1 以上的整數";
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
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "編輯 coupon" : "新增 coupon"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="兌換碼"
            value={form.code}
            onChange={set("code")}
            disabled={codeLocked}
            error={!!err.code}
            helperText={err.code || (codeLocked ? "已有人領取，無法修改" : undefined)}
            fullWidth
            slotProps={{
              htmlInput: { maxLength: 50 },
            }}
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
              helperText={err.end || tzHint}
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
            fullWidth
            slotProps={{
              htmlInput: { min: 1, step: 1 },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving} sx={{ minHeight: 44 }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          sx={{ minHeight: 44 }}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {saving ? "儲存中…" : editing ? "儲存" : "新增"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
