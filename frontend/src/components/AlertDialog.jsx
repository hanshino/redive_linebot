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
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      {title && <DialogTitle>{title}</DialogTitle>}
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel || onClose}>{cancelText}</Button>
        <Button onClick={onSubmit} variant="contained" autoFocus>
          {submitText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
