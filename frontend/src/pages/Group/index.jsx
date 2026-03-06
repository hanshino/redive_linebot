import { useEffect } from "react";
import useAxios from "axios-hooks";
import { Box, Typography, Grid, Skeleton, Card, Alert } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import AlertLogin from "../../components/AlertLogin";
import GroupCard from "../../components/GroupCard";

function SkeletonCard() {
  return (
    <Card>
      <Skeleton variant="rectangular" height={140} animation="wave" />
      <Box sx={{ p: 2 }}>
        <Skeleton width="60%" height={32} animation="wave" />
        <Skeleton width="30%" height={20} animation="wave" sx={{ mt: 1 }} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, px: 2, pb: 2, flexWrap: "wrap" }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" width={90} height={30} animation="wave" />
        ))}
      </Box>
    </Card>
  );
}

function EmptyState() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
        color: "text.secondary",
      }}
    >
      <GroupsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.4 }} />
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        目前沒有加入任何群組
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        將布丁機器人加入 LINE 群組後，即可在此管理
      </Typography>
    </Box>
  );
}

export default function GroupList() {
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;

  const [{ data, loading, error }, refetch] = useAxios(
    { url: "/api/guilds" },
    { manual: true },
  );

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          我的群組
        </Typography>
        <Typography variant="body2" color="text.secondary">
          管理你所屬的 LINE 群組
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" action={
          <Typography
            component="button"
            variant="body2"
            onClick={() => refetch()}
            sx={{
              background: "none",
              border: "none",
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            重試
          </Typography>
        }>
          載入群組資料失敗，請稍後再試
        </Alert>
      )}

      <Grid container spacing={2}>
        {loading
          ? [1, 2, 3].map((i) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                <SkeletonCard />
              </Grid>
            ))
          : (data || []).map((group) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.groupId}>
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
    </Box>
  );
}
