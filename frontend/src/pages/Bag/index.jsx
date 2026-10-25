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
  Button,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockIcon from "@mui/icons-material/Lock";
import DiamondIcon from "@mui/icons-material/Diamond";
import CollectionsIcon from "@mui/icons-material/Collections";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import useLiff from "../../context/useLiff";

/* ---------- CollectionBanner ---------- */
const chipOnBanner = {
  bgcolor: theme => alpha(theme.palette.primary.contrastText, 0.2),
  color: "primary.contrastText",
};

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
        <CatchingPokemonIcon
          aria-hidden="true"
          sx={{ fontSize: 48, color: theme => alpha(theme.palette.primary.contrastText, 0.8) }}
        />
        <Box sx={{ color: "primary.contrastText", minWidth: 0, flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            轉蛋包包
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", my: 1.5 }}>
            <Chip
              icon={<CollectionsIcon sx={{ color: "inherit !important" }} />}
              label={`${obtained} / ${total} 已收集`}
              size="small"
              sx={chipOnBanner}
            />
            {godStone != null && (
              <Chip
                icon={<DiamondIcon sx={{ color: "inherit !important" }} />}
                label={`${godStone.toLocaleString()} 女神石`}
                size="small"
                sx={chipOnBanner}
              />
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              aria-label={`收集進度 ${pct}%`}
              sx={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                bgcolor: theme => alpha(theme.palette.primary.contrastText, 0.2),
                "& .MuiLinearProgress-bar": { bgcolor: "primary.contrastText" },
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 700, flexShrink: 0 }}>
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
      }}
    >
      <Box
        sx={{
          position: "relative",
          pt: "100%",
          bgcolor: obtained ? "surface.subtle" : "surface.inset",
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
            // 只讓圖變淡；名字維持原本對比，未取得的角色才讀得到是誰
            opacity: obtained ? 1 : 0.5,
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
              bgcolor: "action.disabledBackground",
            }}
          >
            <LockIcon sx={{ color: "text.secondary", fontSize: 28 }} />
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
              bgcolor: "background.paper",
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

/* ---------- Loading skeleton ---------- */
function BagSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={44} animation="wave" />
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

// 背包裡的 itemId 999 是女神石本身，不是角色（交易所頁面也是同樣處理）。
const GOD_STONE_ITEM_ID = 999;
const isCharacter = item => item.itemId !== GOD_STONE_ITEM_ID;

/* ---------- Bag (main export) ---------- */
export default function Bag() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [tab, setTab] = useState("obtained");
  const [{ data: inventory, error: itemError }, refetchItems] = useAxios("/api/inventory", {
    manual: !isLoggedIn,
  });
  const [{ data: poolData, error: poolError }, refetchPool] = useAxios("/api/inventory/pool", {
    manual: !isLoggedIn,
  });
  // 女神石總數只是橫幅上的附帶資訊：失敗時不顯示這顆標籤，不拿 0 充數，也不擋住角色列表。
  const [{ data: godStoneData }] = useAxios("/api/inventory/total-god-stone", {
    manual: !isLoggedIn,
  });

  useEffect(() => {
    document.title = "轉蛋包包";
  }, []);

  const items = useMemo(
    () => (Array.isArray(inventory) ? inventory.filter(isCharacter) : []),
    [inventory]
  );

  const unobtainedItems = useMemo(() => {
    const obtainedItemIds = new Set(items.map(item => item.itemId));
    return (Array.isArray(poolData) ? poolData : []).filter(
      item => isCharacter(item) && !obtainedItemIds.has(item.itemId)
    );
  }, [items, poolData]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  // 失敗要跟「沒有角色」長得不一樣，不然網路斷線會顯示成「0 已取得」。
  if ((itemError && !inventory) || (poolError && !poolData)) {
    return (
      <LoadError
        message="背包載入失敗，請檢查網路後再試一次。"
        onRetry={() => {
          refetchItems().catch(() => {});
          refetchPool().catch(() => {});
        }}
      />
    );
  }

  // 還沒有資料也沒有錯誤＝仍在載入（包含請求尚未送出的那一幀）
  if (!Array.isArray(inventory) || !Array.isArray(poolData)) {
    return <BagSkeleton />;
  }

  const totalCount = items.length + unobtainedItems.length;
  const displayItems = tab === "obtained" ? items : unobtainedItems;
  const godStoneTotal = godStoneData?.total;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <CollectionBanner
        obtained={items.length}
        total={totalCount}
        godStone={Number.isFinite(Number(godStoneTotal)) ? Number(godStoneTotal) : null}
      />

      <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            mb: 2,
          }}
        >
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            角色列表
          </Typography>
          <ToggleButtonGroup
            value={tab}
            exclusive
            onChange={(_, v) => v !== null && setTab(v)}
            size="small"
            aria-label="角色列表篩選"
            sx={{
              "& .MuiToggleButton-root": {
                px: 2,
                minHeight: 44,
                fontSize: "0.8125rem",
                fontWeight: 600,
                borderRadius: "8px !important",
              },
            }}
          >
            <ToggleButton value="obtained">已取得 ({items.length})</ToggleButton>
            <ToggleButton value="unobtained">未取得 ({unobtainedItems.length})</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {/* 取得的角色可以拿去交易所賣；掛賣頁目前不支援預選角色，所以連到頁面本身 */}
        {tab === "obtained" && items.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <Button
              component={RouterLink}
              to="/trade/sell"
              variant="outlined"
              startIcon={<SellRoundedIcon />}
              sx={{ minHeight: 44 }}
            >
              掛賣角色
            </Button>
            <Button
              component={RouterLink}
              to="/trade/market"
              variant="text"
              startIcon={<StorefrontRoundedIcon />}
              sx={{ minHeight: 44 }}
            >
              前往交易所
            </Button>
          </Box>
        )}
        <CollectionGrid items={displayItems} obtained={tab === "obtained"} />
      </Paper>
    </Box>
  );
}
