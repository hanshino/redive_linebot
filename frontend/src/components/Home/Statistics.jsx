import React, { useEffect, useState } from "react";
import axios from "axios";
import PropTypes from "prop-types";
import LibraryBooksIcon from "@material-ui/icons/LibraryBooks";
import Typography from "@material-ui/core/Typography";
import PeopleIcon from "@material-ui/icons/People";
import TextsmsIcon from "@material-ui/icons/Textsms";
import InsertEmoticonIcon from "@material-ui/icons/InsertEmoticon";
import DirectionsRunIcon from "@material-ui/icons/DirectionsRun";
import CommentIcon from "@material-ui/icons/Comment";
import Paper from "@material-ui/core/Paper";
import DashboardIcon from "@material-ui/icons/Dashboard";
import makeStyles from "@material-ui/core/styles/makeStyles";
import Grid from "@material-ui/core/Grid";
import Skeleton from "@material-ui/lab/Skeleton";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
  statistics: {
    padding: theme.spacing(1),
  },
  card: {
    minWidth: 160,
  },
  loading: {
    width: "100%",
  },
}));

const Statistics = () => {
  const classes = useStyles();
  const { data, loading } = useStatistics();
  return (
    <Grid
      className={classes.statistics}
      spacing={1}
      item
      container
      component={Paper}
      variant="outlined"
    >
      <Grid container item alignItems="center" spacing={1}>
        <Grid item>
          <DashboardIcon color="primary" fontSize="small" />
        </Grid>
        <Grid item>
          <Typography variant="h5">儀表板</Typography>
        </Grid>
      </Grid>
      <Grid container item justify="space-around" spacing={1}>
        {loading ? (
          <Skeleton className={classes.loading} animation="wave" />
        ) : (
          data.map(d => (
            <Grid item key={d.title}>
              <GridCard {...d} />
            </Grid>
          ))
        )}
      </Grid>
      <Grid container item direction="row-reverse">
        <Typography variant="subtitle1" color="textSecondary">
          {new Date().toString()}
        </Typography>
      </Grid>
    </Grid>
  );
};

const GridCard = ({ title, value, icon }) => {
  const classes = useStyles();
  const MyIcon = icon;
  return (
    <Grid container direction="row" spacing={1} className={classes.card}>
      <Grid item xs={2}>
        <MyIcon />
      </Grid>
      <Grid container item xs={10} direction="column" spacing={1}>
        <Grid item>
          <Typography variant="subtitle1" color="textSecondary">
            {title}
          </Typography>
        </Grid>
        <Grid item>
          <Typography variant="subtitle2">{value}</Typography>
        </Grid>
      </Grid>
    </Grid>
  );
};

GridCard.propTypes = {
  icon: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  value: PropTypes.any.isRequired,
};

const refData = [
  { title: "自訂指令", attribute: "CustomerOrderCount", icon: LibraryBooksIcon },
  { title: "群組數", attribute: "GuildCount", icon: PeopleIcon },
  { title: "訊息紀錄", attribute: "TotalSpeakTimes", icon: TextsmsIcon },
  { title: "用戶數", attribute: "UserCount", icon: InsertEmoticonIcon },
  { title: "線上人數", attribute: "onlineCount", icon: DirectionsRunIcon },
  { title: "即時訊息數", attribute: "speakTimes", icon: CommentIcon },
];

const useStatistics = () => {
  const [rawData, setRawData] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios
      .get("/api/Pudding/Statistics")
      .then(res => res.data)
      .then(resp => setRawData(resp))
      .finally(() => setLoading(false));
  }, []);

  const data =
    Object.keys(rawData).length === 0
      ? []
      : refData.map(d => ({
          ...d,
          value: rawData[d.attribute],
        }));

  return { data, loading };
};

export default Statistics;
