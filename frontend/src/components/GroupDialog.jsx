import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import CloseIcon from "@material-ui/icons/Close";
import Slide from "@material-ui/core/Slide";
import Grid from "@material-ui/core/Grid";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import CardActions from "@material-ui/core/CardActions";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import GroupAPI from "../api/Group";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
  },
  appBar: {
    position: "relative",
  },
  title: {
    marginLeft: theme.spacing(2),
    flex: 1,
  },
  item: {
    padding: theme.spacing(1),
  },
}));

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function GroupDialog(props) {
  const classes = useStyles();
  const [summarys, setSummarys] = useState([]);

  const { open, onClose } = props;

  useEffect(() => {
    GroupAPI.fetchGroupSummarys().then(setSummarys);
  }, []);

  return (
    <div>
      <Dialog fullScreen open={open} onClose={onClose} TransitionComponent={Transition}>
        <AppBar className={classes.appBar}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" className={classes.title}>
              {"群組列表"}
            </Typography>
          </Toolbar>
        </AppBar>
        <Grid container className={classes.root}>
          {summarys.map(summary => (
            <Grid item key={summary.groupId} sm={4} xs={12} className={classes.item}>
              <GroupCard
                name={summary.groupName}
                icon={summary.pictureUrl}
                id={summary.groupId}
                close={onClose}
              />
            </Grid>
          ))}
        </Grid>
      </Dialog>
    </div>
  );
}

GroupDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

const GroupCard = props => {
  const { id, name, icon, close } = props;

  return (
    <Card>
      <CardHeader title={name} avatar={<Avatar src={icon} />} subheader={id} />
      <CardActions>
        <Button size="small" component={Link} to={`/Group/${id}/Record`} onClick={close}>
          {"說話排行"}
        </Button>
        <Button size="small" component={Link} to={`/Source/${id}/Customer/Orders`} onClick={close}>
          {"自訂指令"}
        </Button>
        <Button size="small" component={Link} to={`/Group/${id}/Battle`} onClick={close}>
          {"群組戰隊"}
        </Button>
        <Button size="small" component={Link} to={`/Group/${id}/Config`} onClick={close}>
          {"設定"}
        </Button>
      </CardActions>
    </Card>
  );
};

GroupCard.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  close: PropTypes.func.isRequired,
};
