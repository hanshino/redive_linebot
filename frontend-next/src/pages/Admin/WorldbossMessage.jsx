import { useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";
import {
  Avatar,
  ButtonGroup,
  Grid,
  Button,
  Alert,
  Fab,
  CircularProgress,
  Skeleton,
  Box,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { green } from "@mui/material/colors";
import { Link, useNavigate } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import { isLiffLoggedIn } from "../../utils/liff";

function ControlButtons({ onDeleteComplete, value }) {
  const navigate = useNavigate();
  const [{ data = {}, loading }, doDelete] = useAxios(
    {
      url: `/api/Game/World/Boss/Feature/Message/${value}`,
      method: "DELETE",
    },
    { manual: true }
  );

  const handleDelete = () => {
    doDelete();
  };

  useEffect(() => {
    if (data.message === "success") {
      onDeleteComplete();
    }
  }, [data]);

  return (
    <Box sx={{ position: "relative", m: 1 }}>
      <ButtonGroup color="primary" variant="outlined" disabled={loading}>
        <Button onClick={() => navigate(`/admin/worldboss-message/update/${value}`)}>
          更新
        </Button>
        <Button color="primary" variant="outlined" onClick={handleDelete}>
          刪除
        </Button>
      </ButtonGroup>
      {loading && (
        <CircularProgress
          size={24}
          sx={{
            color: green[500],
            position: "absolute",
            top: "50%",
            left: "50%",
            mt: "-12px",
            ml: "-12px",
          }}
        />
      )}
    </Box>
  );
}

function genAvatar({ value }) {
  return <Avatar alt="頭像" src={value} />;
}

function DataList() {
  const [{ data = {}, error, loading }, refetch] = useAxios(
    "/api/Game/World/Boss/Feature/Message"
  );
  const { data: messageData = [] } = data;
  const columns = [
    {
      headerName: "頭像",
      field: "icon_url",
      flex: 0.5,
      renderCell: genAvatar,
    },
    { headerName: "訊息樣板", field: "template", flex: 2 },
    {
      headerName: "操作",
      field: "id",
      flex: 1.4,
      renderCell: (rawData) => (
        <ControlButtons value={rawData.value} onDeleteComplete={refetch} />
      ),
    },
  ];

  useEffect(() => {
    refetch();
  }, [window.location.pathname]);

  if (loading) {
    return <Skeleton animation="wave" variant="rectangular" width="100%" height={300} />;
  }

  if (error) {
    return <Alert severity="error">發生錯誤，請確認是否有管理權限！</Alert>;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <DataGrid
        columns={columns}
        rows={messageData}
        autoHeight
        disableColumnMenu
        disableColumnFilter
        disableColumnSelector
      />
    </Box>
  );
}

export default function AdminWorldbossMessage() {
  useEffect(() => {
    document.title = "管理員用－世界王訊息管理";
  }, []);

  if (!isLiffLoggedIn()) {
    return <AlertLogin />;
  }

  return (
    <Grid container direction="column" spacing={1}>
      <Grid>
        <Alert severity="warning">所有紀錄都會記錄作者資訊，請謹慎操作</Alert>
      </Grid>
      <Grid>
        <DataList />
      </Grid>
      <Fab
        aria-label="add"
        component={Link}
        to="/admin/worldboss-message/create"
        sx={{
          backgroundColor: "#ff6d00",
          color: "#fff",
          "&:hover": { backgroundColor: "#ff6d00", color: "#fff" },
          position: "fixed",
          bottom: "10px",
          right: "10px",
        }}
      >
        <AddIcon />
      </Fab>
    </Grid>
  );
}
