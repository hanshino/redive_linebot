import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import Pagination from "@material-ui/lab/Pagination";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import SigninTable from "./SigninTable";
import GroupAPI from "../../api/Group";
import Skeleton from "@material-ui/lab/Skeleton";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
    "& > *": {
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
  },
}));

const GroupBattle = () => {
  const classes = useStyles();
  const { groupId } = useParams();
  const [signDatas, setSignDatas] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    let result = await GroupAPI.getSignList(groupId, month);
    setSignDatas(result);
    setLoading(false);
  };

  useEffect(() => {
    window.document.title = "群組戰隊";
  }, []);

  useEffect(() => {
    fetchData();
  }, [month, groupId]);

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} sm={12} component={Paper}>
        <Grid container className={classes.root} direction="column" alignItems="center">
          <Grid item xs={12} sm={12}>
            <Typography component="p" variant="h5">
              月份
            </Typography>
          </Grid>
          <Grid item xs={12} sm={12}>
            <Pagination
              count={12}
              page={month}
              variant="outlined"
              color="primary"
              boundaryCount={1}
              siblingCount={0}
              onChange={(event, page) => setMonth(page)}
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} sm={12}>
        {loading ? <Skeleton /> : <SigninTable signDatas={signDatas} month={month} />}
      </Grid>
    </Grid>
  );
};

export default GroupBattle;
