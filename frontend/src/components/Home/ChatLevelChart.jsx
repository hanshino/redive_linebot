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

ExpLabel.propTypes = {
  text: PropTypes.string.isRequired,
};

const ChatLevelChart = () => {
  const [{ data, loading }] = useAxios("/api/Chat/Level/Rank");

  if (loading) return <p>loading...</p>;

  let rankingDatas = data.slice(1, 51).reverse();

  return (
    <Grid item xs={12} sm={12} component={Paper}>
      <Chart data={rankingDatas} height={1024} rotated>
        <ArgumentAxis />
        <ValueScale name="experience" />
        <ValueScale name="level" modifyDomain={domain => [domain[0] - 10, data[0].level]} />
        <ValueAxis scaleName="experience" position="left" labelComponent={ExpLabel} />
        <ValueAxis scaleName="level" position="right" />
        <BarSeries
          color="#5BC236"
          scaleName="experience"
          valueField="experience"
          argumentField="displayName"
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
