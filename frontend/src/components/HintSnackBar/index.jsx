import React from "react";
import SnackBar from "@material-ui/core/Snackbar";
import MuiAlert from "@material-ui/lab/Alert";
import PropTypes from "prop-types";

const Alert = props => {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
};

const HintSnackBar = ({ message, open, handleClose, severity }) => {
  return (
    <SnackBar
      open={open}
      autoHideDuration={3000}
      onClose={handleClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={handleClose} severity={severity}>
        {message}
      </Alert>
    </SnackBar>
  );
};

HintSnackBar.propTypes = {
  message: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  severity: PropTypes.string.isRequired,
};

export const useHintBar = () => {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [severity, setSeverity] = React.useState("success");

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpen = (message, severity) => {
    setOpen(true);
    setMessage(message);
    setSeverity(severity);
  };

  return [
    { open, message, severity },
    { handleOpen, handleClose },
  ];
};

export default HintSnackBar;
