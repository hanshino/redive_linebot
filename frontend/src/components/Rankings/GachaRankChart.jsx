import React from "react";
import useAxios from "axios-hooks";
import Paper from "@material-ui/core/Paper";
import {
  Chart,
  BarSeries,
  Title,
  ArgumentAxis,
  ValueAxis,
} from "@devexpress/dx-react-chart-material-ui";
import { Animation } from "@devexpress/dx-react-chart";
import Grid from "@material-ui/core/Grid";
import PropTypes from "prop-types";
import { makeStyles } from "@material-ui/core/styles";
import Skeleton from "@material-ui/lab/Skeleton";

const useStyle = makeStyles(() => ({
  PaperChart: {
    width: "100%",
  },
}));

const GachaRankChart = () => {
  const [{ data, loading }] = useAxios("/api/Gacha/Rank/1");
  const classes = useStyle();

  return (
    <Grid container item xs={12} sm={12} component={Paper}>
      {loading ? (
        <Skeleton className={classes.PaperChart} animation="wave" />
      ) : (
        <EuropeRank rankData={data} />
      )}
    </Grid>
  );
};

const EuropeRank = props => {
  const classes = useStyle();
  const { rankData } = props;

  return (
    <Chart data={rankData} rotated className={classes.PaperChart}>
      <ArgumentAxis />
      <ValueAxis max={7} showLine showTicks />

      <BarSeries valueField="cnt" argumentField="displayName" />
      <Title text="🥇轉蛋蒐集排行🏆" />
      <Animation />
    </Chart>
  );
};

EuropeRank.propTypes = {
  rankData: PropTypes.array.isRequired,
};

export default GachaRankChart;
