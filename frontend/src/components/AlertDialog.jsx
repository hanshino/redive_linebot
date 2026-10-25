import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";

/**
 * 通用確認框。
 *
 * destructive：刪除、停用、撤銷這類不可逆或影響他人的操作。
 * - 確認鍵改成紅色，文字請寫動詞（「刪除」而不是「確認」）
 * - 預設焦點移到「取消」，手機上誤觸 Enter 不會直接執行
 * - description 請寫出後果（誰會受影響、能不能復原）
 *
 * busy：請求進行中，鎖住兩顆按鈕並禁止點背景或 Esc 關閉。
 */
export default function AlertDialog({
  open,
  onClose,
  onSubmit,
  onCancel,
  title,
  description,
  submitText = "確認",
  cancelText = "取消",
  disabled = false,
  destructive = false,
  busy = false,
}) {
  const locked = disabled || busy;

  return (
    <Dialog
      open={open}
      onClose={locked ? undefined : onClose}
      aria-labelledby={title ? "alert-dialog-title" : undefined}
    >
      {title && <DialogTitle id="alert-dialog-title">{title}</DialogTitle>}
      {description && (
        <DialogContent>
          <DialogContentText sx={{ whiteSpace: "pre-line" }}>{description}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 2, pb: 2, gap: 1, "& > .MuiButton-root": { minHeight: 44 } }}>
        <Button onClick={onCancel || onClose} disabled={locked} autoFocus={destructive}>
          {cancelText}
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          color={destructive ? "error" : "primary"}
          autoFocus={!destructive}
          disabled={locked}
        >
          {busy ? "處理中…" : submitText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
