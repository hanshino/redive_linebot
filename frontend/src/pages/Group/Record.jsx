import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { get } from "lodash";
import useAxios from "axios-hooks";
import {
  Box, Grid, Typography, Paper, Card, CardHeader, CardContent, LinearProgress,
} from "@mui/material";
import {
  Flag, Forum, GroupSharp, Image, InsertEmoticon,
} from "@mui/icons-material";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from "recharts";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";

/* ---------- constants ---------- */
const PIE_COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

const genDate = (timestamp) => {
  const d = new Date(timestamp);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("/");
};

const columns = [
  { field: "rank", headerName: "#", type: "number", width: 70 },
  { field: "displayName", headerName: "暱稱", flex: 1, minWidth: 120 },
  { field: "textCnt", headerName: "文字", type: "number", width: 100 },
  { field: "imageCnt", headerName: "圖片", type: "number", width: 100 },
  { field: "stickerCnt", headerName: "貼圖", type: "number", width: 100 },
  { field: "unsendCnt", headerName: "收回", type: "number", width: 100 },
  {
    field: "lastSpeakTS",
    headerName: "最後發言時間",
    width: 150,
    renderCell: (params) => genDate(params.value),
  },
  {
    field: "joinedTS",
    headerName: "加入時間",
    width: 150,
    renderCell: (params) => genDate(params.value),
  },
];

function CustomLoadingOverlay() {
  return (
    <GridOverlay>
      <LinearProgress color="secondary" sx={{ position: "absolute", top: 0, width: "100%" }} />
    </GridOverlay>
  );
}

/* ---------- helpers ---------- */
const sumData = (rank = [], field) => rank.reduce((acc, cur) => acc + get(cur, field, 0), 0);

function genPieData({ text = 0, image = 0, sticker = 0, unsend = 0 }) {
  return [
    { name: "文字", value: text },
    { name: "圖片", value: image },
    { name: "貼圖", value: sticker },
    { name: "收回", value: unsend },
  ];
}

/* ---------- PieCard ---------- */
function PieCard({ title, subtitle, data }) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <Card sx={{ minWidth: 160, height: 330, p: 1 }}>
      <CardHeader title={title} subheader={subtitle} />
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                label
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
            暫無數據
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- GroupRecordSummary ---------- */
function GroupRecordSummary({ group, rank }) {
  const data = rank || [];
  const textCount = sumData(data, "textCnt");
  const stickerCount = sumData(data, "stickerCnt");
  const imageCount = sumData(data, "imageCnt");
  const factCount = data.length;
  const groupCount = get(group, "count", 0);

  const summaryItems = [
    { Icon: Flag, title: "群組類別", content: "聊天群" },
    { Icon: GroupSharp, title: "紀錄/群組 人數", content: `${factCount}/${groupCount}` },
    { Icon: Forum, title: "訊息次數", content: textCount },
    { Icon: Image, title: "圖片次數", content: imageCount },
    { Icon: InsertEmoticon, title: "貼圖次數", content: stickerCount },
  ];

  return (
    <Grid container spacing={2} justifyContent="center">
      {summaryItems.map((item, index) => (
        <Grid size={{ xs: 6, sm: 2 }} key={index}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <item.Icon color="action" />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                {item.title}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {item.content}
              </Typography>
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

/* ---------- MyPieCard ---------- */
function MyPieCard({ rank = [] }) {
  const userId = window.liff?.getContext?.()?.userId;
  const data = rank.find((item) => item.userId === userId);
  const pieData = genPieData({
    text: get(data, "textCnt", 0),
    image: get(data, "imageCnt", 0),
    sticker: get(data, "stickerCnt", 0),
    unsend: get(data, "unsendCnt", 0),
  });

  return <PieCard title={get(data, "displayName", "-")} subtitle="個人數據分析" data={pieData} />;
}

/* ---------- GroupPieCard ---------- */
function GroupPieCard({ rank = [] }) {
  const pieData = genPieData({
    text: sumData(rank, "textCnt"),
    image: sumData(rank, "imageCnt"),
    sticker: sumData(rank, "stickerCnt"),
    unsend: sumData(rank, "unsendCnt"),
  });

  return <PieCard title="全員" subtitle="群組數據分析" data={pieData} />;
}

/* ---------- GroupRecord (main export) ---------- */
export default function GroupRecord() {
  const { groupId } = useParams();
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;

  const [{ data: rankData, loading: rankLoading }, fetchRank] = useAxios(
    { url: `/api/Group/${groupId}/Speak/Rank` },
    { manual: true },
  );
  const [{ data: groupData, loading: groupLoading }, fetchGroup] = useAxios(
    { url: `/api/Guild/${groupId}/Summary` },
    { manual: true },
  );

  useEffect(() => {
    document.title = "群組數據管理";
  }, []);

  useEffect(() => {
    fetchRank();
    fetchGroup();
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

  const pageLoading = rankLoading || groupLoading || !rankData || !groupData;

  if (pageLoading) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="h6">群組數據 - {get(groupData, "groupName")}</Typography>
        <Typography variant="subtitle2" color="text.secondary">
          提供群組進行數據管理
        </Typography>
      </Box>

      <GroupRecordSummary group={groupData} rank={rank} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <MyPieCard rank={rank} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <GroupPieCard rank={rank} />
        </Grid>
      </Grid>

      <Paper sx={{ width: "100%", height: 500 }}>
        <DataGrid
          columns={columns}
          rows={rank}
          disableColumnFilter
          disableColumnSelector
          disableColumnMenu
          disableRowSelectionOnClick
          loading={pageLoading}
          slots={{ loadingOverlay: CustomLoadingOverlay }}
          sx={{ border: 0 }}
        />
      </Paper>
    </Box>
  );
}
