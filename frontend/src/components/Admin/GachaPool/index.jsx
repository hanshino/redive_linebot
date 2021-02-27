import React from "react";
import PoolList from "./PoolList";
import ActionDialog from "./ActionDialog";
import Grid from "@material-ui/core/Grid";
import Button from "@material-ui/core/Button";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
  Action: {
    margin: theme.spacing(3),
  },
}));

const GachaPool = () => {
  const classes = useStyles();
  const [open, setOpen] = React.useState(false);
  const [selectedAction, setSelectedAction] = React.useState("");

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = action => {
    setOpen(false);
    setSelectedAction(action);
  };

  React.useEffect(() => {
    window.document.title = "卡池管理頁面";
  });

  return (
    <React.Fragment>
      <Grid container className={classes.Action}>
        <Grid item>
          <Button variant="contained" color="primary" onClick={handleClickOpen}>
            功能選單
          </Button>
        </Grid>
      </Grid>
      <PoolList />
      <ActionDialog selectedValue={selectedAction} open={open} onClose={handleClose} />
    </React.Fragment>
  );
};

export default GachaPool;
