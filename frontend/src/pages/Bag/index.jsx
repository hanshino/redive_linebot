import { useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Chip,
  Skeleton,
  Card,
  CardContent,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
} from "@mui/material";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockIcon from "@mui/icons-material/Lock";
import DiamondIcon from "@mui/icons-material/Diamond";
import CollectionsIcon from "@mui/icons-material/Collections";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

/* ---------- CollectionBanner ---------- */
function CollectionBanner({ obtained, total, godStone }) {
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;

  return (
    <Paper
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          flexWrap: "wrap",
        }}
      >
        <CatchingPokemonIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0, flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            轉蛋包包
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85, mb: 1.5 }}>
            你的角色收藏庫
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
            <Chip
              icon={<CollectionsIcon sx={{ color: "inherit !important" }} />}
              label={`${obtained} / ${total} 已收集`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<DiamondIcon sx={{ color: "inherit !important" }} />}
              label={`${(godStone ?? 0).toLocaleString()} 女神石`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                bgcolor: "rgba(255,255,255,0.2)",
                "& .MuiLinearProgress-bar": { bgcolor: "#fff" },
              }}
            />
            <Typography variant="caption" sx={{ color: "#fff", fontWeight: 700, flexShrink: 0 }}>
              {pct}%
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

/* ---------- CharacterCard ---------- */
function CharacterCard({ item, obtained }) {
  return (
    <Card
      sx={{
        height: "100%",
        position: "relative",
        opacity: obtained ? 1 : 0.5,
        transition: "opacity 0.2s",
      }}
    >
      <Box
        sx={{
          position: "relative",
          pt: "100%",
          bgcolor: obtained ? "grey.100" : "grey.200",
          overflow: "hidden",
        }}
      >
        <Avatar
          variant="rounded"
          src={item.headImage}
          alt={item.name}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            borderRadius: 0,
          }}
        />
        {!obtained && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(0,0,0,0.3)",
            }}
          >
            <LockIcon sx={{ color: "rgba(255,255,255,0.7)", fontSize: 28 }} />
          </Box>
        )}
        {obtained && (
          <CheckCircleIcon
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              fontSize: 18,
              color: "success.main",
              bgcolor: "#fff",
              borderRadius: "50%",
            }}
          />
        )}
      </Box>
      <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            display: "block",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </Typography>
      </CardContent>
    </Card>
  );
}

/* ---------- CollectionGrid ---------- */
function CollectionGrid({ items, obtained }) {
  if (items.length === 0) {
    return (
      <Paper sx={{ p: { xs: 4, sm: 5 }, textAlign: "center", borderRadius: 3 }}>
        <CatchingPokemonIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          {obtained ? "尚未取得任何角色" : "已收集全部角色！"}
        </Typography>
      </Paper>
    );
  }

  return (
    <Grid container spacing={1.5}>
      {items.map(item => (
        <Grid size={{ xs: 4, sm: 3, md: 2 }} key={item.itemId}>
          <CharacterCard item={item} obtained={obtained} />
        </Grid>
      ))}
    </Grid>
  );
}

/* ---------- StatsCards ---------- */
function StatsCards({ obtained, unobtained }) {
  const stats = [
    {
      label: "已取得",
      count: obtained.length,
      color: "success.main",
      icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
    },
    {
      label: "未取得",
      count: unobtained.length,
      color: "text.secondary",
      icon: <LockIcon sx={{ fontSize: 20 }} />,
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map(stat => (
        <Grid size={{ xs: 6 }} key={stat.label}>
          <Card>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 2,
                "&:last-child": { pb: 2 },
              }}
            >
              <Avatar sx={{ width: 36, height: 36, bgcolor: "transparent", color: stat.color }}>
                {stat.icon}
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {stat.count}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  {stat.label}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

/* ---------- Loading skeleton ---------- */
function BagSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 6 }}>
          <Skeleton variant="rounded" height={64} animation="wave" />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Skeleton variant="rounded" height={64} animation="wave" />
        </Grid>
      </Grid>
      <Skeleton variant="rounded" height={40} animation="wave" />
      <Grid container spacing={1.5}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Grid size={{ xs: 4, sm: 3, md: 2 }} key={i}>
            <Skeleton variant="rounded" height={120} animation="wave" />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/* ---------- Bag (main export) ---------- */
export default function Bag() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [tab, setTab] = useState("obtained");
  const [{ data: items = [], loading: itemLoading }] = useAxios("/api/inventory", {
    manual: !isLoggedIn,
  });
  const [{ data: pool = [], loading: poolLoading }] = useAxios("/api/inventory/pool", {
    manual: !isLoggedIn,
  });
  const [{ data: godStoneData, loading: godStoneLoading }] = useAxios(
    "/api/inventory/total-god-stone",
    {
      manual: !isLoggedIn,
    }
  );

  useEffect(() => {
    document.title = "轉蛋包包";
  }, []);

  const unobtainedItems = useMemo(() => {
    const obtainedItemIds = items.map(item => item.itemId);
    return pool.filter(item => !obtainedItemIds.includes(item.itemId));
  }, [items, pool]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = itemLoading || poolLoading || godStoneLoading;

  if (pageLoading) {
    return <BagSkeleton />;
  }

  const totalCount = items.length + unobtainedItems.length;
  const displayItems = tab === "obtained" ? items : unobtainedItems;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <CollectionBanner obtained={items.length} total={totalCount} godStone={godStoneData?.total} />

      <StatsCards obtained={items} unobtained={unobtainedItems} />

      <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            角色列表
          </Typography>
          <ToggleButtonGroup
            value={tab}
            exclusive
            onChange={(_, v) => v !== null && setTab(v)}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                px: 2,
                py: 0.5,
                fontSize: "0.8rem",
                fontWeight: 600,
                borderRadius: "8px !important",
              },
            }}
          >
            <ToggleButton value="obtained">已取得 ({items.length})</ToggleButton>
            <ToggleButton value="unobtained">未取得 ({unobtainedItems.length})</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <CollectionGrid items={displayItems} obtained={tab === "obtained"} />
      </Paper>
    </Box>
  );
}
