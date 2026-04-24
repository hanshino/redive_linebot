import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";

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
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      {title && <DialogTitle>{title}</DialogTitle>}
      <DialogContent>
        <DialogContentText sx={{ whiteSpace: "pre-line" }}>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel || onClose} disabled={disabled}>
          {cancelText}
        </Button>
        <Button onClick={onSubmit} variant="contained" autoFocus disabled={disabled}>
          {submitText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
