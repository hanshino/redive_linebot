import React from "react";
import Paper from "@material-ui/core/Paper";
import {
  Chart,
  BarSeries,
  ArgumentAxis,
  ValueAxis,
  Title,
  ScatterSeries,
} from "@devexpress/dx-react-chart-material-ui";
import { Animation, ValueScale } from "@devexpress/dx-react-chart";
import useAxios from "axios-hooks";
import Grid from "@material-ui/core/Grid";
import PropTypes from "prop-types";
import Skeleton from "@material-ui/lab/Skeleton";
import makeStyles from "@material-ui/core/styles/makeStyles";

const useStyle = makeStyles(() => ({
  loading: {
    height: "100%",
    width: "100%",
  },
}));

const ExpLabel = props => {
  const { text } = props;
  let num = parseInt(text.replace(/,+/g, ""));
  let showText = text;

  if (num >= 1000000) {
    showText = `${num / 1000000} M`;
  } else if (num >= 1000) {
    showText = `${num / 1000} K`;
  }

  return <ValueAxis.Label {...props} text={showText} />;
};

const BarProps = props => {
  const { maxBarWidth } = props;
  console.log(maxBarWidth);
  return <BarSeries.Point {...props} maxBarWidth={20} />;
};

BarProps.propTypes = {
  maxBarWidth: PropTypes.number.isRequired,
};

ExpLabel.propTypes = {
  text: PropTypes.string.isRequired,
};

const ChatLevelChart = () => {
  const [{ data, loading }] = useAxios("/api/Chat/Level/Rank");
  const classes = useStyle();

  if (loading)
    return (
      <Grid container item xs={12} sm={12} component={Paper}>
        <Skeleton className={classes.loading} animation="wave" />
      </Grid>
    );

  let rankingDatas = data.slice(0, 51).reverse();

  return (
    <Grid item xs={12} sm={12} component={Paper}>
      <Chart data={rankingDatas} height={1024} rotated>
        <ArgumentAxis />
        <ValueScale name="experience" />
        <ValueScale name="level" modifyDomain={domain => [domain[0] - 10 && 0, data[0].level]} />
        <ValueAxis scaleName="experience" position="left" labelComponent={ExpLabel} />
        <ValueAxis scaleName="level" position="right" />
        <BarSeries
          color="#5BC236"
          scaleName="experience"
          valueField="experience"
          argumentField="displayName"
          pointComponent={BarProps}
        />
        <ScatterSeries
          color="#FFA31A"
          scaleName="level"
          valueField="level"
          argumentField="displayName"
        />
        <Title text="🏹布丁等級排行榜🔪" />
        <Animation />
      </Chart>
    </Grid>
  );
};

export default ChatLevelChart;
