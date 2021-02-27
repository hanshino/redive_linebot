import React from "react";
import PropTypes from "prop-types";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import DialogTitle from "@material-ui/core/DialogTitle";
import Dialog from "@material-ui/core/Dialog";
import FlareIcon from "@material-ui/icons/Flare";

const ActionDialog = props => {
  const ActionDatas = [{ action: "Pickup", display: "限時加倍", icon: <FlareIcon /> }];
  const { onClose, selectedValue, open } = props;
  const handleClose = () => {
    onClose(selectedValue);
  };

  const handleListItemClick = value => {
    onClose(value);
  };

  return (
    <Dialog onClose={handleClose} aria-labelledby="simple-dialog-title" open={open}>
      <DialogTitle id="simple-dialog-title">選擇要執行的功能</DialogTitle>
      <List>
        {ActionDatas.map(data => (
          <ListItem button onClick={() => handleListItemClick(data.action)} key={data.action}>
            <ListItemAvatar>{data.icon}</ListItemAvatar>
            <ListItemText primary={data.display} />
          </ListItem>
        ))}
      </List>
    </Dialog>
  );
};

ActionDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  selectedValue: PropTypes.string.isRequired,
};

export default ActionDialog;
