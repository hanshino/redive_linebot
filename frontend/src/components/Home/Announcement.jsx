import React from "react";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import Accordion from "@material-ui/core/Accordion";
import AccordionSummary from "@material-ui/core/AccordionSummary";
import AccordionDetails from "@material-ui/core/AccordionDetails";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import { Alert, AlertTitle } from "@material-ui/lab";
import useAxios from "axios-hooks";
import makeStyles from "@material-ui/core/styles/makeStyles";
import Paper from "@material-ui/core/Paper";
import AnnouncementIcon from "@material-ui/icons/Announcement";
import Skeleton from "@material-ui/lab/Skeleton";
import PropTypes from "prop-types";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1.5),
  },
  header: {
    marginBottom: theme.spacing(1),
  },
  loading: {
    width: "100%",
  },
  heading: {
    fontSize: theme.typography.pxToRem(15),
    fontWeight: theme.typography.fontWeightRegular,
  },
}));

const Announcement = () => {
  const classes = useStyles();
  const [{ data, loading }] = useAxios("/api/Announcement/1");

  const breakingNews = data && data.length !== 0 ? data[0] : {};
  const title = (
    <Grid container item className={classes.header} alignItems="center" spacing={1}>
      <Grid item>
        <AnnouncementIcon color="error" />
      </Grid>
      <Grid item>
        <Typography variant="h5" component="h2">
          最新消息
        </Typography>
      </Grid>
    </Grid>
  );

  const otherNews =
    data && data.length > 1
      ? data.slice(1, 4).map((d, index) => (
          <Accordion key={index}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography className={classes.heading}>{d.title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">{d.content}</Typography>
            </AccordionDetails>
            <AccordionDetails>
              <Typography variant="caption" color="textSecondary">
                {new Date(d.create_time).toLocaleString()}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))
      : null;

  return (
    <Grid
      className={classes.root}
      container
      item
      direction="column"
      component={Paper}
      variant="outlined"
    >
      {title}
      <Grid item>
        {loading ? (
          <Skeleton className={classes.loading} animation="wave" />
        ) : (
          <TopNews breakingNews={breakingNews} />
        )}
      </Grid>
      <Grid item>
        {loading ? <Skeleton className={classes.loading} animation="wave" /> : otherNews}
      </Grid>
    </Grid>
  );
};

const TopNews = props => {
  const { breakingNews } = props;
  const levels = ["success", "info", "warning", "error"];

  if (Object.keys(breakingNews).length === 0) {
    breakingNews.level = "success";
    breakingNews.title = "乾淨無比";
    breakingNews.content = "這個作者很懶，什麼話都沒說～";
    breakingNews.create_time = new Date().toString();
  }

  return (
    <Alert severity={levels.indexOf(breakingNews.level) === -1 ? "warning" : breakingNews.level}>
      <AlertTitle>{breakingNews.title}</AlertTitle>
      {breakingNews.content} <br />
      <Typography variant="caption" color="textSecondary">
        {new Date(breakingNews.create_time).toLocaleString()}
      </Typography>
    </Alert>
  );
};

TopNews.propTypes = {
  breakingNews: PropTypes.object.isRequired,
};

export default Announcement;
