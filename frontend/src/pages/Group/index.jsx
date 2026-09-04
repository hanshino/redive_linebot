import { useEffect } from "react";
import useAxios from "axios-hooks";
import {
  Box,
  Container,
  Stack,
  Typography,
  Grid,
  Skeleton,
  Card,
  CardContent,
  Alert,
  Button,
} from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import AlertLogin from "../../components/AlertLogin";
import GroupCard, { MEDIA_ASPECT_RATIO } from "../../components/GroupCard";
import useLiff from "../../context/useLiff";

const GRID_SIZE = { xs: 12, sm: 6, md: 4 };

function SkeletonCard() {
  return (
    <Card variant="outlined">
      <Skeleton
        variant="rectangular"
        animation="wave"
        sx={{ width: "100%", height: "auto", aspectRatio: MEDIA_ASPECT_RATIO }}
      />
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Skeleton width="60%" height={28} animation="wave" />
        <Skeleton width="30%" height={24} animation="wave" sx={{ mt: 1 }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 1,
            mt: 2,
          }}
        >
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={36} animation="wave" />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card variant="outlined">
      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          py: 8,
          color: "text.secondary",
        }}
      >
        <GroupsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.4 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          目前沒有加入任何群組
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          將布丁機器人加入 LINE 群組後，即可在此管理
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function GroupList() {
  const { loggedIn: isLoggedIn } = useLiff();

  const [{ data, loading, error }, refetch] = useAxios({ url: "/api/guilds" }, { manual: true });

  useEffect(() => {
    document.title = "我的群組";
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      refetch();
    }
  }, [isLoggedIn, refetch]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 1 }}>
      <Stack spacing={2.5}>
        <Stack spacing={0.25}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            我的群組
          </Typography>
          <Typography variant="body2" color="text.secondary">
            管理你所屬的 LINE 群組
          </Typography>
        </Stack>

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                重試
              </Button>
            }
          >
            載入群組資料失敗，請稍後再試
          </Alert>
        )}

        {/* 卡片少於一整列時置中，避免一張卡孤零零留在左上角 */}
        <Grid container spacing={2.5} sx={{ justifyContent: "center" }}>
          {loading
            ? [1, 2, 3].map(i => (
                <Grid size={GRID_SIZE} key={i}>
                  <SkeletonCard />
                </Grid>
              ))
            : (data || []).map(group => (
                <Grid size={GRID_SIZE} key={group.groupId}>
                  <GroupCard
                    groupId={group.groupId}
                    groupName={group.groupName}
                    pictureUrl={group.pictureUrl}
                    count={group.count}
                  />
                </Grid>
              ))}
        </Grid>

        {!loading && !error && data?.length === 0 && <EmptyState />}
      </Stack>
    </Container>
  );
}
