import React from "react";
import PropTypes from "prop-types";
import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import CardActions from "@material-ui/core/CardActions";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";
import Avatar from "@material-ui/core/Avatar";

const useStyles = makeStyles(theme => ({
  root: {
    minWidth: 200,
  },
  avatar: {
    width: theme.spacing(7),
    height: theme.spacing(7),
  },
  grid: {
    margin: theme.spacing(2),
  },
}));

const SourceList = props => {
  const classes = useStyles();
  const { events, handleOpen } = props;

  const SourceDatas = genSourceDatas(events);

  return (
    <Grid container spacing={2} className={classes.grid}>
      {Object.keys(SourceDatas).map((key, index) => (
        <Grid item key={index}>
          <SourceCard source={SourceDatas[key]} action={handleOpen} />
        </Grid>
      ))}
    </Grid>
  );
};

function genSourceDatas(events) {
  const result = {};

  events.forEach(event => {
    const { groupId, userId, roomId } = event.source;
    const sourceId = groupId || roomId || userId;

    result[sourceId] = result[sourceId] || {};
    result[sourceId] = event.source;
  });

  return result;
}

const SourceCard = props => {
  const { source, action } = props;
  const classes = useStyles();
  var from = "",
    avatar = "",
    title = "",
    id = source[`${source.type}Id`];

  switch (source.type) {
    case "group":
      title = source.groupName;
      from = "群組";
      avatar = source.groupUrl;
      break;
    case "user":
      title = source.displayName;
      from = "個人";
      avatar = source.pictureUrl;
      break;
    case "room":
      title = source.displayName;
      from = "房間";
      avatar = source.pictureUrl;
      break;
    default:
      title = "預設";
      from = "預設";
      avatar = "預設";
  }

  return (
    <Card className={classes.root} variant="outlined">
      <CardHeader
        avatar={<Avatar className={classes.avatar} src={avatar} alt={source.type} />}
        title={title}
        subheader={from}
      />
      <CardActions>
        <Button size="small" onClick={() => action(id)}>
          詳細
        </Button>
      </CardActions>
    </Card>
  );
};

SourceCard.propTypes = {
  source: PropTypes.object.isRequired,
  action: PropTypes.func.isRequired,
};

SourceList.propTypes = {
  events: PropTypes.array.isRequired,
  handleOpen: PropTypes.func.isRequired,
};

export default SourceList;
