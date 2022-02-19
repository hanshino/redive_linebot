import React, { useEffect, useMemo, useState } from "react";
import { get } from "lodash";
import PropTypes from "prop-types";
import useAxios from "axios-hooks";
import AlertLogin from "../AlertLogin";
import Grid from "@material-ui/core/Grid";
import { WhirlyLoading } from "../Loading";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, Typography } from "@material-ui/core";
import makeStyles from "@material-ui/core/styles/makeStyles";
import { Flag, Forum, GroupSharp, Image, InsertEmoticon, SyncAlt } from "@material-ui/icons";
import { Chart, Legend, PieSeries, Tooltip } from "@devexpress/dx-react-chart-material-ui";
import { Animation, EventTracker } from "@devexpress/dx-react-chart";
import MaterialTable from "material-table";
import TableLocaliztion from "../../config/TableLocaliztion";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import LinearProgress from "@material-ui/core/LinearProgress";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles(theme => ({
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

const CustomLoadingOverlay = () => {
  return (
    <GridOverlay>
      <div style={{ position: "absolute", top: 0, width: "100%" }}>
        <LinearProgress color="secondary" />
      </div>
    </GridOverlay>
  );
};

const columns = [
  {
    field: "rank",
    headerName: "#",
    type: "number",
  },
  {
    field: "displayName",
    headerName: "暱稱",
    type: "string",
  },
  {
    field: "textCnt",
    headerName: "文字",
    type: "number",
  },
  {
    field: "imageCnt",
    headerName: "圖片",
    type: "number",
  },
  {
    field: "stickerCnt",
    headerName: "貼圖",
    type: "number",
  },
  {
    field: "unsendCnt",
    headerName: "收回",
    type: "number",
  },
  {
    field: "lastSpeakTS",
    headerName: "最後發言時間",
    renderCell: params => genDate(params.value),
  },
  {
    field: "joinedTS",
    headerName: "加入時間",
    renderCell: params => genDate(params.value),
  },
];

const genDate = timestamp => {
  let d = new Date(timestamp);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("/");
};

const { liff } = window;

const GroupRecord = () => {
  const { groupId } = useParams();
  const isLoggedIn = liff.isLoggedIn();
  const [{ data: rankData, loading: rankLoading }, fetchRank] = useAxios({}, { manual: true });
  const [{ data: groupData, loading: groupLoading }, fetchGroup] = useAxios({}, { manual: true });

  useEffect(() => {
    window.document.title = "群組數據管理";
  }, []);

  useEffect(() => {
    fetchRank({
      url: `/api/Group/${groupId}/Speak/Rank`,
    });

    fetchGroup({
      url: `/api/Guild/${groupId}/Summary`,
    });

    return () => {};
  }, [groupId, fetchRank, fetchGroup]);

  const rank = useMemo(() => {
    return (rankData || []).map((data, index) => ({
      ...data,
      rank: index + 1,
      id: index,
    }));
  }, [rankData]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = rankLoading || groupLoading || !rank || !groupData;

  if (pageLoading) {
    return <WhirlyLoading />;
  }

  return (
    <Grid container direction="column" spacing={2}>
      <Grid item>
        <Typography variant="h6" component="p">
          群組數據 - {get(groupData, "groupName")}
        </Typography>
        <Typography variant="subtitle2" color="textSecondary" component="p">
          提供群組進行數據管理
        </Typography>
      </Grid>
      <GroupRecordSummary group={groupData} rank={rank} />
      <Grid container item direction="row" spacing={1}>
        <Grid item sm={6} xs={12}>
          <MyPieCard rank={rank} />
        </Grid>
        <Grid item sm={6} xs={12}>
          <GroupPieCard rank={rank} />
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <Paper style={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={rank}
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            loading={pageLoading}
            components={{
              LoadingOverlay: CustomLoadingOverlay,
            }}
          />
        </Paper>
      </Grid>
    </Grid>
  );
};

const sumData = (rank = [], field) => rank.reduce((acc, cur) => acc + get(cur, field, 0), 0);

const GroupRecordSummary = ({ group, rank }) => {
  const classes = useStyles();
  let data = rank || [];
  const [textCount, stickerCount, imageCount] = [
    sumData(data, "textCnt"),
    sumData(data, "stickerCnt"),
    sumData(data, "imageCnt"),
  ];
  const factCount = data.length;
  const groupCount = get(group, "count", 0);

  const SummaryData = [
    { CusIcon: Flag, title: "群組類別", content: "聊天群" },
    { CusIcon: GroupSharp, title: "紀錄/群組 人數", content: `${factCount}/${groupCount}` },
    { CusIcon: Forum, title: "訊息次數", content: textCount },
    { CusIcon: Image, title: "圖片次數", content: imageCount },
    { CusIcon: InsertEmoticon, title: "貼圖次數", content: stickerCount },
  ];

  return (
    <Grid container item direction="row" justifyContent="center">
      {SummaryData.map((data, index) => (
        <Grid container xs={3} item className={classes.card} key={index}>
          <Grid item xs={2}>
            <data.CusIcon />
          </Grid>
          <Grid container item xs={10} direction="column" spacing={1}>
            <Grid item>
              <Typography variant="subtitle1" color="textSecondary">
                {get(data, "title")}
              </Typography>
            </Grid>
            <Grid item>
              <Typography variant="subtitle2">{get(data, "content")}</Typography>
            </Grid>
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
};

GroupRecordSummary.propTypes = {
  group: PropTypes.object.isRequired,
  rank: PropTypes.array.isRequired,
};

const MyPieCard = ({ rank = [] }) => {
  const { userId } = liff.getContext();
  const data = rank.find(item => item.userId === userId);
  const pieData = genPieData({
    text: get(data, "textCnt", 0),
    image: get(data, "imageCnt", 0),
    sticker: get(data, "stickerCnt", 0),
    unsend: get(data, "unsendCnt", 0),
  });

  return <PieCard title={get(data, "displayName", "-")} subtitle="個人數據分析" data={pieData} />;
};

MyPieCard.propTypes = {
  rank: PropTypes.array.isRequired,
};

const GroupPieCard = ({ rank = [] }) => {
  const [textCount, stickerCount, imageCount, unsendCount] = [
    sumData(rank, "textCnt"),
    sumData(rank, "stickerCnt"),
    sumData(rank, "imageCnt"),
    sumData(rank, "unsendCnt"),
  ];

  const pieData = genPieData({
    text: textCount,
    image: imageCount,
    sticker: stickerCount,
    unsend: unsendCount,
  });

  return <PieCard title="全員" subtitle="群組數據分析" data={pieData} />;
};

const genPieData = ({ text = 0, image = 0, sticker = 0, unsend = 0 }) => {
  return [
    { title: "文字", value: text },
    { title: "圖片", value: image },
    { title: "貼圖", value: sticker },
    { title: "收回", value: unsend },
  ];
};

const PieCard = ({ title, subtitle, data }) => {
  const classes = useStyles();
  return (
    <Card className={classes.statistic}>
      <CardHeader title={title} subheader={subtitle} />
      <CardContent>
        <Chart data={data} height={200}>
          <PieSeries valueField="value" argumentField="title" innerRadius={0.6} />
          <Legend />
          <EventTracker />
          <Tooltip />
          <Animation />
        </Chart>
      </CardContent>
    </Card>
  );
};

PieCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  data: PropTypes.array.isRequired,
};

const RecordTable = props => {
  const { rank } = props;
  const [showPercent, setShowPercent] = useState(true);
  const [textCount, stickerCount, imageCount] = [
    sumData(rank, "textCnt"),
    sumData(rank, "stickerCnt"),
    sumData(rank, "imageCnt"),
  ];
  const columns = [
    { title: "排名", field: "rank" },
    { title: "名字", field: "displayName" },
    { title: "文字", field: "textCnt", hidden: showPercent },
    {
      title: "文字(%)",
      field: "textCnt",
      hidden: !showPercent,
      render: rowData => (textCount ? Math.round((rowData.textCnt / textCount) * 100) + "%" : 0),
    },
    { title: "圖片", field: "imageCnt", hidden: showPercent },
    {
      title: "圖片(%)",
      field: "imageCnt",
      hidden: !showPercent,
      render: rowData => (imageCount ? Math.round((rowData.imageCnt / imageCount) * 100) + "%" : 0),
    },
    { title: "貼圖", field: "stickerCnt", hidden: showPercent },
    {
      title: "貼圖(%)",
      field: "stickerCnt",
      hidden: !showPercent,
      render: rowData =>
        stickerCount ? Math.round((rowData.stickerCnt / stickerCount) * 100) + "%" : 0,
    },
    { title: "收回", field: "unsendCnt" },
    { title: "上次發言", field: "lastSpeak", render: rowData => genDate(rowData.lastSpeakTS) },
    { title: "紀錄時間", field: "lastSpeak", render: rowData => genDate(rowData.joinedTS) },
  ];
  return (
    <MaterialTable
      columns={columns}
      data={rank}
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
  rank: PropTypes.array.isRequired,
};

export default GroupRecord;
