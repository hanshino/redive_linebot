import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Group from "../../api/Group";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import makeStyles from "@material-ui/core/styles/makeStyles";
import {
  Flag,
  Forum,
  GroupSharp,
  Image,
  InsertEmoticon,
  Refresh,
  SyncAlt,
} from "@material-ui/icons";
import PropTypes from "prop-types";
import { Card, CardActions, CardContent, CardHeader, IconButton } from "@material-ui/core";
import { Chart, Legend, PieSeries, Tooltip } from "@devexpress/dx-react-chart-material-ui";
import { Animation, EventTracker, Palette } from "@devexpress/dx-react-chart";
import MaterialTable from "material-table";
import TableLocaliztion from "../../config/TableLocaliztion";
import { schemeDark2 } from "d3-scale-chromatic";
import { Skeleton, Alert, AlertTitle } from "@material-ui/lab";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      padding: theme.spacing(1),
    },
  },
  card: {
    minWidth: 160,
  },
  statistic: {
    padding: theme.spacing(1),
    minWidth: 300,
    height: 330,
    "& > *": {
      padding: theme.spacing(1),
    },
  },
}));

const GroupRecord = () => {
  const classes = useStyles();
  const { groupId } = useParams();
  const { userId } = window.liff.getContext();
  const isLoggedIn = window.liff.isLoggedIn();
  const [{ data, loading, error }, fetchData] = useGroupRank("");

  React.useEffect(() => {
    window.document.title = "群組數據管理";
  }, []);

  React.useEffect(() => {
    if (isLoggedIn) fetchData(groupId);
  }, [groupId]);

  if (!userId || !isLoggedIn) {
    return (
      <Alert severity="error">
        <AlertTitle>錯誤！</AlertTitle>
        要查看群組數據，請先進行登入！
      </Alert>
    );
  }

  if (loading)
    return (
      <div className={classes.root}>
        <Skeleton animation="wave" variant="text" />
        <Skeleton animation={false} width={50} height={50} variant="circle" />
        <Skeleton variant="rect" height={100} />
        <Skeleton>
          <MaterialTable columns={[]} data={[]} />
        </Skeleton>
      </div>
    );
  if (error) return <h1>{error}</h1>;

  let max = 0;
  let comment = "";
  [
    { value: data.textCount, comment: "聊天群" },
    { value: data.imageCount, comment: "車群?" },
    { value: data.stickerCount, comment: "尬聊群" },
    { value: data.unsendCount, comment: "404 Not Found 群" },
  ].forEach(d => {
    if (max < d.value) {
      max = d.value;
      comment = d.comment;
    }
  });

  const CardData = [
    { CusIcon: Flag, title: "群組類別", content: comment },
    { CusIcon: GroupSharp, title: "紀錄/群組 人數", content: `${data.factCount}/${data.count}` },
    { CusIcon: Forum, title: "訊息次數", content: `${data.textCount}` },
    { CusIcon: Image, title: "圖片次數", content: `${data.imageCount}` },
    { CusIcon: InsertEmoticon, title: "貼圖次數", content: `${data.stickerCount}` },
  ];

  return (
    <React.Fragment>
      <Grid container className={classes.root} alignItems="center">
        <Grid item>
          <Typography variant="h6" component="p">
            群組數據 - {data.groupName}
          </Typography>
          <Typography variant="subtitle2" color="textSecondary" component="p">
            提供群組進行數據管理
          </Typography>
        </Grid>
        <Grid item>
          <IconButton onClick={() => fetchData(groupId)}>
            <Refresh color="action" />
          </IconButton>
        </Grid>
      </Grid>
      <Grid container className={classes.root} justifyContent="space-around">
        {CardData.map((d, i) => (
          <Grid item key={i}>
            <GridCard {...d} />
          </Grid>
        ))}
      </Grid>
      <Grid container className={classes.root}>
        <Grid item xs={12} sm={6}>
          <MessageStatistic
            groupName={data.groupName}
            statistic={[
              { type: "文字", value: data.textCount },
              { type: "圖片", value: data.imageCount },
              { type: "貼圖", value: data.stickerCount },
              { type: "收回", value: data.unsendCount },
            ]}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <MyStatistic statistic={data.rankData.find(d => d.userId == userId)} />
        </Grid>
      </Grid>
      <Grid container className={classes.root}>
        <Grid item xs={12}>
          <RecordTable data={data} />
        </Grid>
      </Grid>
    </React.Fragment>
  );
};

const RecordTable = props => {
  const { data } = props;
  const [showPercent, setShowPercent] = useState(true);
  const columns = [
    { title: "排名", field: "rank" },
    { title: "名字", field: "displayName" },
    { title: "文字", field: "textCnt", hidden: showPercent },
    {
      title: "文字(%)",
      field: "textCnt",
      hidden: !showPercent,
      render: rowData =>
        data.textCount ? Math.round((rowData.textCnt / data.textCount) * 100) + "%" : 0,
    },
    { title: "圖片", field: "imageCnt", hidden: showPercent },
    {
      title: "圖片(%)",
      field: "imageCnt",
      hidden: !showPercent,
      render: rowData =>
        data.imageCount ? Math.round((rowData.imageCnt / data.imageCount) * 100) + "%" : 0,
    },
    { title: "貼圖", field: "stickerCnt", hidden: showPercent },
    {
      title: "貼圖(%)",
      field: "stickerCnt",
      hidden: !showPercent,
      render: rowData =>
        data.stickerCount ? Math.round((rowData.stickerCnt / data.stickerCount) * 100) + "%" : 0,
    },
    { title: "收回", field: "unsendCnt" },
    { title: "上次發言", field: "lastSpeak", render: rowData => genDate(rowData.lastSpeakTS) },
    { title: "紀錄時間", field: "lastSpeak", render: rowData => genDate(rowData.joinedTS) },
  ];
  return (
    <MaterialTable
      columns={columns}
      data={data.rankData}
      title="排行"
      localization={TableLocaliztion}
      actions={[
        {
          icon: SyncAlt,
          tooltip: "切換顯示",
          isFreeAction: true,
          onClick: () => setShowPercent(!showPercent),
        },
      ]}
      options={{ headerStyle: { whiteSpace: "nowrap" }, search: false }}
    />
  );

  function genDate(timestamp) {
    let d = new Date(timestamp);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("/");
  }
};

RecordTable.propTypes = {
  data: PropTypes.array.isRequired,
};

const MyStatistic = props => {
  const classes = useStyles();
  const { statistic } = props;
  if (!statistic) return <Skeleton variant="rect" className={classes.statistic} />;
  const datas = [
    { title: "文字", value: statistic.textCnt, comment: "是個廢話偏多的人捏~" },
    { title: "圖片", value: statistic.imageCnt, comment: "廢圖大師兼流量吞噬者" },
    { title: "貼圖", value: statistic.stickerCnt, comment: "貼圖尬聊，乙！" },
    { title: "收回", value: statistic.unsendCnt, comment: "開車王peko?" },
  ];

  let max = 0;
  let comment = "";

  datas.forEach(data => {
    if (max < data.value) {
      comment = data.comment;
      max = data.value;
    }
  });

  return (
    <Card className={classes.statistic}>
      <CardHeader title={statistic.displayName} subheader="個人訊息分佈" />
      <CardContent>
        <Chart data={datas} height={200}>
          <Palette scheme={schemeDark2} />
          <PieSeries valueField="value" argumentField="title" innerRadius={0.6} />
          <Legend />
          <EventTracker />
          <Tooltip />
          <Animation />
        </Chart>
      </CardContent>
      <CardActions>
        <Typography variant="subtitle2" color="textSecondary">
          {comment}
        </Typography>
      </CardActions>
    </Card>
  );
};

MyStatistic.propTypes = {
  statistic: PropTypes.object.isRequired,
};

const MessageStatistic = props => {
  const classes = useStyles();
  const { statistic, groupName } = props;
  return (
    <Card className={classes.statistic}>
      <CardHeader title={groupName} subheader="群組訊息分佈" />
      <CardContent>
        <Chart data={statistic} height={200}>
          <Palette scheme={schemeDark2} />
          <PieSeries valueField="value" argumentField="type" innerRadius={0.6} />
          <Legend />
          <EventTracker />
          <Tooltip />
          <Animation />
        </Chart>
      </CardContent>
    </Card>
  );
};

MessageStatistic.propTypes = {
  groupName: PropTypes.string.isRequired,
  statistic: PropTypes.array.isRequired,
};

const GridCard = props => {
  const { CusIcon, title, content } = props;
  const classes = useStyles();
  return (
    <Grid container direction="row" spacing={1} className={classes.card}>
      <Grid item xs={2}>
        <CusIcon />
      </Grid>
      <Grid container item xs={10} direction="column" spacing={1}>
        <Grid item>
          <Typography variant="subtitle1" color="textSecondary">
            {title}
          </Typography>
        </Grid>
        <Grid item>
          <Typography variant="subtitle2">{content}</Typography>
        </Grid>
      </Grid>
    </Grid>
  );
};

GridCard.propTypes = {
  CusIcon: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  content: PropTypes.string.isRequired,
};
/**
 * @typedef {Object} GroupData
 * @description Group Summary and Rank Data.
 * @property {String} groupName
 * @property {Number} count
 * @property {Number} factCount
 * @property {String} pictureUrl
 * @property {Array<{displayName: String, imageCnt: Number, joinedTS: Number}>} rankData
 */
/**
 * @param {String} id
 * @returns {Array<{data: GroupData, loading: Boolean, error: String}, Function>}
 */
const useGroupRank = id => {
  const [data, setData] = useState({ rankData: [] });
  const [groupId, setGroupId] = useState(id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [goFetch, setFetch] = useState(1);

  const refresh = groupId => {
    setFetch(old => old + 1);
    setGroupId(groupId);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!groupId) return;
        setLoading(true);
        setError("");
        let [rankResult, groupInfo] = await Promise.all([
          Group.fetchGroupSpeakRank(groupId),
          Group.getGroupInfo(groupId),
        ]);

        let count = {
          factCount: rankResult.length,
          imageCount: 0,
          textCount: 0,
          stickerCount: 0,
          unsendCount: 0,
        };

        rankResult.forEach(d => {
          count.imageCount += d.imageCnt;
          count.textCount += d.textCnt;
          count.unsendCount += d.unsendCnt;
          count.stickerCount += d.stickerCnt;
        });

        setData({ ...groupInfo, ...count, rankData: rankResult });
      } catch (e) {
        setError(e);
      }
      setLoading(false);
    };

    fetchData();
  }, [groupId, goFetch]);

  return [{ data, loading, error }, refresh];
};

export default GroupRecord;
