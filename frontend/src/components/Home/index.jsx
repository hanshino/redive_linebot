import React, { useState, useEffect } from "react";
import Paper from "@material-ui/core/Paper";
import {
  Chart,
  BarSeries,
  Title,
  ArgumentAxis,
  ValueAxis,
} from "@devexpress/dx-react-chart-material-ui";
import { Animation } from "@devexpress/dx-react-chart";
import StatisticsAPI from "../../api/Statistics";
import Grid from "@material-ui/core/Grid";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import CardContent from "@material-ui/core/CardContent";
import CardActionArea from "@material-ui/core/CardActionArea";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import HomeIcon from "@material-ui/icons/Home";
import PersonIcon from "@material-ui/icons/Person";
import SmsIcon from "@material-ui/icons/Sms";
import MessageIcon from "@material-ui/icons/Message";
import StarIcon from "@material-ui/icons/Star";
import DirectionsRunIcon from "@material-ui/icons/DirectionsRun";
import Alert from "@material-ui/lab/Alert";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import PropTypes from "prop-types";

const useStyle = makeStyles(theme => ({
  BoardCard: {
    minWidth: 250,
    margin: theme.spacing(1),
    [theme.breakpoints.down("sm")]: {
      minWidth: theme.breakpoints.values,
    },
  },

  PaperChart: {
    margin: theme.spacing(1),
  },

  Information: {
    margin: theme.spacing(1),
  },

  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const Home = () => {
  const classes = useStyle();
  const isLoggedIn = window.liff.isLoggedIn();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    GuildCount: 0,
    UserCount: 0,
    CustomerOrderCount: 0,
    TotalSpeakTimes: 0,
    onlineCount: 0,
    speakTimes: 0,
    CollectedCount: 0,
    Rank: 0,
    MyGuildCount: 0,
    MySpeakTimes: 0,
  });

  let passTS = new Date().getTime() - 60 * 1000;
  let passDate = new Date(passTS);
  let strDate = [
    ("0" + passDate.getHours()).substr(-2),
    ("0" + passDate.getMinutes()).substr(-2),
    "00",
  ].join(":");

  const CardData = [
    {
      title: "即時線上人數",
      value: data.onlineCount,
      icon: <DirectionsRunIcon />,
      updateDate: strDate,
    },
    { title: "即時訊息數", value: data.speakTimes, icon: <SmsIcon />, updateDate: strDate },
    { title: "伺服器群組數", value: data.GuildCount, icon: <HomeIcon /> },
    { title: "伺服器用戶數", value: data.UserCount, icon: <PersonIcon /> },
    { title: "伺服器自訂指令數", value: data.CustomerOrderCount, icon: <MessageIcon /> },
    { title: "伺服器總訊息數", value: data.TotalSpeakTimes, icon: <SmsIcon /> },
  ];

  if (isLoggedIn) {
    CardData.unshift({
      title: "我的訊息次數",
      value: data.MySpeakTimes,
      icon: <SmsIcon />,
    });
    CardData.unshift({
      title: "我的群組數",
      value: data.MyGuildCount,
      icon: <HomeIcon />,
    });
    CardData.unshift({
      title: "轉蛋蒐集數量",
      value: data.CollectedCount,
      icon: <StarIcon />,
    });
    CardData.unshift({
      title: "轉蛋蒐集排行",
      value: data.Rank,
      icon: <StarIcon />,
    });
    CardData.unshift({
      title: "等級",
      value: "Lv ??",
      icon: <StarIcon />,
    });
  }

  const fetchStatistics = async () => {
    var resp = await StatisticsAPI.getLineBotData();
    var userResp = {};
    if (isLoggedIn) {
      userResp = await fetchUserStatistics();
    }
    setData({
      ...data,
      ...resp,
      ...userResp,
    });
  };

  const fetchUserStatistics = async () => {
    var { GachaData, GuildData } = await StatisticsAPI.getUserData();
    return {
      ...GachaData,
      MyGuildCount: GuildData.cnt,
      MySpeakTimes: GuildData.times,
    };
  };

  useEffect(() => {
    fetchStatistics().then(() => setLoading(false));
    window.document.title = "布丁首頁 - 儀表板";
    var intervalId = setInterval(() => fetchStatistics(), 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <React.Fragment>
      <Grid container justify="center">
        {isLoggedIn ? null : (
          <Grid item sm={12} xs={12}>
            <Alert className={classes.Information} severity="warning">
              請按右上登入以取得更多資訊！
            </Alert>
          </Grid>
        )}
        {CardData.map(data => (
          <Grid item key={data.title}>
            <BoardCard {...data} />
          </Grid>
        ))}
        <Grid item xs={12} sm={12}>
          <EuropeRank />
        </Grid>
      </Grid>
      <Backdrop className={classes.backdrop} open={loading}>
        <CircularProgress />
      </Backdrop>
    </React.Fragment>
  );
};

const BoardCard = props => {
  const classes = useStyle();
  const { title, value, icon, updateDate, action } = props;
  let date = new Date();
  let showValue = "";

  if (/^\d+$/.test(value.toString())) {
    showValue = unitNumber(value.toString());
  } else {
    showValue = value;
  }

  return (
    <Card className={classes.BoardCard}>
      <CardActionArea onClick={action}>
        <CardHeader
          avatar={icon}
          title={title}
          subheader={
            updateDate || [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("/")
          }
        />
        <CardContent>
          <Typography variant="h3" component="h3">
            {showValue}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

BoardCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.object,
  action: PropTypes.func,
  updateDate: PropTypes.string,
};

function unitNumber(strNumber) {
  if (strNumber.length > 4) {
    return (parseInt(strNumber) / 10000).toFixed(1) + "萬";
  }

  return strNumber;
}

const EuropeRank = () => {
  const classes = useStyle();
  const [rankData, setRankData] = useState([]);

  useEffect(() => {
    StatisticsAPI.getEruopeRankData().then(data => {
      data.reverse();
      setRankData(data);
    });
  }, []);

  return (
    <Paper className={classes.PaperChart}>
      <Chart data={rankData} rotated>
        <ArgumentAxis />
        <ValueAxis max={7} showLine showTicks />

        <BarSeries valueField="cnt" argumentField="displayName" />
        <Title text="轉蛋蒐集排行" />
        <Animation />
      </Chart>
    </Paper>
  );
};

export default Home;
