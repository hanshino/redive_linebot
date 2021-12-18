import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import PropTypes from "prop-types";

const AlertDialog = ({
  open,
  handleClose,
  onSubmit,
  onCancel,
  title,
  description,
  submitText = "Agree",
  cancelText = "Disagree",
}) => {
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="primary">
          {cancelText}
        </Button>
        <Button onClick={onSubmit} color="primary">
          {submitText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

AlertDialog.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  submitText: PropTypes.string,
  cancelText: PropTypes.string,
};

/**
 * 協助控制提醒視窗的開啟與關閉
 */
export const useAlertDialog = () => {
  const initialState = {
    title: "",
    description: "",
    submitText: "",
    cancelText: "",
    onSubmit: () => {},
    onCancel: () => {},
  };
  const [open, setOpen] = useState(false);
  const [dialogState, setDialogState] = useState(initialState);

  const handleOpen = detail => {
    setDialogState(detail);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return [
    { open, state: dialogState },
    { handleOpen, handleClose, setDetail: setDialogState },
  ];
};

export default AlertDialog;
