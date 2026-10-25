import { useState, useEffect, useMemo, useCallback } from "react";
import useAxios from "axios-hooks";
import {
  Typography,
  Grid,
  Card,
  CardActionArea,
  Avatar,
  Chip,
  Box,
  Divider,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import GavelIcon from "@mui/icons-material/Gavel";
import SecurityIcon from "@mui/icons-material/Security";
import StarsIcon from "@mui/icons-material/Stars";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import { get } from "lodash";

// 裝備稀有度沿用成就稀有度的語意色（theme.palette.rarity[0..3]，深淺模式各自調過），
// 後端存的是英文 enum，顯示一律走 theme 裡的中文 label，不要直接把 item.rarity 印給玩家。
const RARITY_INDEX = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

const rarityOf = (theme, rarity) => theme.palette.rarity[RARITY_INDEX[rarity] ?? 0];

const SLOT_LABELS = {
  weapon: "武器",
  armor: "防具",
  accessory: "飾品",
};

const SLOT_ICONS = {
  weapon: <GavelIcon />,
  armor: <SecurityIcon />,
  accessory: <StarsIcon />,
};

const ATTR_LABELS = {
  atk_percent: "攻擊力",
  crit_rate: "暴擊率",
  cost_reduction: "體力消耗",
  exp_bonus: "經驗值",
  gold_bonus: "金幣",
};

const formatAttrValue = (key, value) => {
  if (key === "atk_percent") return `+${value}%`;
  if (key === "crit_rate") return `+${value}%`;
  if (key === "cost_reduction") return `-${value}`;
  if (key === "exp_bonus") return `+${value}`;
  if (key === "gold_bonus") return `+${value}`;
  return `${value}`;
};

// 稀有度標籤：底色淡、字用稀有度主色，兩種模式的對比都已經在 theme 裡調過。
function RarityChip({ rarity, sx }) {
  const theme = useTheme();
  const r = rarityOf(theme, rarity);

  return (
    <Chip
      label={r.label}
      size="small"
      sx={{
        height: 22,
        fontSize: "0.75rem",
        fontWeight: 600,
        color: r.main,
        bgcolor: r.bg,
        border: `1px solid ${alpha(r.main, 0.4)}`,
        ...sx,
      }}
    />
  );
}

function EquipSlotCard({ slot, item, onClick }) {
  const isEmpty = !item;

  return (
    <Card
      elevation={0}
      sx={theme => ({
        borderRadius: 3,
        border: "2px solid",
        // 空欄位用暖色（焦糖）的淡邊，有裝備時換成稀有度顏色
        borderColor: isEmpty
          ? alpha(theme.palette.secondary.main, 0.35)
          : rarityOf(theme, item.rarity).main,
        bgcolor: "surface.subtle",
        transition: "box-shadow 0.2s, border-color 0.2s",
        ...(isEmpty ? { borderStyle: "dashed" } : {}),
      })}
    >
      <CardActionArea
        onClick={onClick}
        aria-label={
          isEmpty
            ? `${SLOT_LABELS[slot]}：未裝備，點擊選擇裝備`
            : `${SLOT_LABELS[slot]}：${item.name}，點擊更換`
        }
        sx={{ minHeight: 72 }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            p: 1.5,
            gap: 1.5,
          }}
        >
          {isEmpty ? (
            <Avatar
              sx={theme => ({
                width: 48,
                height: 48,
                bgcolor: alpha(theme.palette.secondary.main, 0.14),
                color: "secondary.main",
                fontSize: 24,
              })}
            >
              {SLOT_ICONS[slot]}
            </Avatar>
          ) : (
            <Avatar
              src={item.image_url}
              alt={item.name}
              variant="rounded"
              sx={theme => ({
                width: 48,
                height: 48,
                border: `2px solid ${rarityOf(theme, item.rarity).main}`,
              })}
            >
              {SLOT_ICONS[slot]}
            </Avatar>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              {SLOT_LABELS[slot]}
            </Typography>
            {isEmpty ? (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                }}
              >
                點擊選擇裝備
              </Typography>
            ) : (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {item.name}
                  </Typography>
                  <RarityChip rarity={item.rarity} />
                </Box>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                  {item.attributes &&
                    Object.entries(item.attributes)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${ATTR_LABELS[k] || k} ${formatAttrValue(k, v)}`)
                      .join(" / ")}
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}

function BonusSummary({ bonuses }) {
  const hasBonus = Object.values(bonuses).some(v => v !== 0);

  if (!hasBonus) return null;

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 1 }}>
        裝備加成總覽
      </Typography>
      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          bgcolor: "surface.subtle",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <CardContent>
          {Object.entries(bonuses)
            .filter(([, v]) => v !== 0)
            .map(([key, value]) => (
              <Box
                key={key}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  py: 0.5,
                }}
              >
                <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                  {ATTR_LABELS[key] || key}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main" }}>
                  {formatAttrValue(key, value)}
                </Typography>
              </Box>
            ))}
        </CardContent>
      </Card>
    </>
  );
}

function EquipDialog({
  open,
  slot,
  equippedItem,
  equipmentList,
  listError,
  onRetryList,
  onEquip,
  onUnequip,
  onClose,
  loading,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {slot && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            {SLOT_ICONS[slot]}
            {SLOT_LABELS[slot]}
          </Box>
        )}
        {equippedItem && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            目前裝備：{equippedItem.name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {equippedItem && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              color="secondary"
              fullWidth
              onClick={() => onUnequip(slot)}
              disabled={loading}
              sx={{ minHeight: 44 }}
            >
              卸下目前裝備
            </Button>
          </Box>
        )}

        {listError ? (
          <LoadError message="裝備清單載入失敗，請檢查網路後再試一次。" onRetry={onRetryList} />
        ) : equipmentList.length === 0 ? (
          <Typography
            align="center"
            sx={{
              color: "text.secondary",
              p: 2,
            }}
          >
            沒有可用的裝備
          </Typography>
        ) : (
          <List disablePadding>
            {equipmentList.map(item => {
              const attrs =
                typeof item.attributes === "string" ? JSON.parse(item.attributes) : item.attributes;
              const eqId = item.equipment_id || item.id;
              const isEquipped = equippedItem && equippedItem.id === eqId;

              return (
                <ListItem key={eqId} disablePadding sx={{ mb: 0.5 }}>
                  {/* 整列就是一顆按鈕：鍵盤、讀屏與 44px 觸控區都由 ListItemButton 提供 */}
                  <ListItemButton
                    selected={Boolean(isEquipped)}
                    aria-current={isEquipped ? "true" : undefined}
                    onClick={() => !isEquipped && onEquip(eqId)}
                    disabled={loading}
                    sx={{
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      minHeight: 56,
                      gap: 0.5,
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={item.image_url}
                        variant="rounded"
                        sx={theme => ({
                          border: `2px solid ${rarityOf(theme, item.rarity).main}`,
                          width: 40,
                          height: 40,
                        })}
                      >
                        {SLOT_ICONS[slot]}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box
                          component="span"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                          <RarityChip rarity={item.rarity} sx={{ height: 20 }} />
                        </Box>
                      }
                      secondary={
                        attrs &&
                        Object.entries(attrs)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${ATTR_LABELS[k] || k} ${formatAttrValue(k, v)}`)
                          .join(" / ")
                      }
                    />
                    {isEquipped ? (
                      <Chip label="裝備中" size="small" color="primary" />
                    ) : (
                      <Typography
                        variant="body2"
                        color="primary"
                        sx={{ fontWeight: 600, flexShrink: 0 }}
                        aria-hidden="true"
                      >
                        裝備
                      </Typography>
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" sx={{ minHeight: 44 }}>
          關閉
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Equipment() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [snackbar, { handleOpen: showSnack, handleClose: closeSnack }] = useHintBar();

  const [{ data: myData, error: myError }, fetchMyEquipment] = useAxios("/api/game/equipment/me", {
    manual: true,
  });
  const [{ data: availableData, error: availableError }, fetchAvailable] = useAxios(
    "/api/game/equipment/available",
    { manual: true }
  );
  const [{ loading: equipLoading }, doEquip] = useAxios(
    { url: "/api/game/equipment/equip", method: "POST" },
    { manual: true }
  );
  const [{ loading: unequipLoading }, doUnequip] = useAxios(
    { url: "/api/game/equipment/unequip", method: "POST" },
    { manual: true }
  );

  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    document.title = "裝備管理";
  }, []);

  // 錯誤已存進 axios-hooks 的 state；這裡吞掉 rejection 避免 unhandled。
  const loadMine = useCallback(() => fetchMyEquipment().catch(() => {}), [fetchMyEquipment]);
  const loadAvailable = useCallback(() => fetchAvailable().catch(() => {}), [fetchAvailable]);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadMine();
    loadAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const equipped = get(myData, "equipped", { weapon: null, armor: null, accessory: null });
  const bonuses = get(myData, "bonuses", {
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
  });

  const availableList = useMemo(
    () => (Array.isArray(availableData) ? availableData : []),
    [availableData]
  );

  const filteredEquipment = useMemo(() => {
    if (!selectedSlot) return [];
    return availableList.filter(item => item.slot === selectedSlot);
  }, [availableList, selectedSlot]);

  const handleSlotClick = useCallback(slot => {
    setSelectedSlot(slot);
  }, []);

  const handleEquip = useCallback(
    async equipmentId => {
      try {
        await doEquip({ data: { equipment_id: equipmentId } });
        showSnack("裝備成功！", "success");
        setSelectedSlot(null);
        loadMine();
        loadAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "裝備失敗，請稍後再試一次。");
        showSnack(msg, "error");
      }
    },
    [doEquip, loadMine, loadAvailable, showSnack]
  );

  const handleUnequip = useCallback(
    async slot => {
      try {
        await doUnequip({ data: { slot } });
        showSnack("已卸下裝備", "success");
        setSelectedSlot(null);
        loadMine();
        loadAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "卸下失敗，請稍後再試一次。");
        showSnack(msg, "error");
      }
    },
    [doUnequip, loadMine, loadAvailable, showSnack]
  );

  if (!isLoggedIn) return <AlertLogin />;

  // 失敗不能畫成「全部欄位都是空的」，那會讓人以為裝備被拆光了。
  if (myError && !myData) {
    return (
      <LoadError
        message="裝備資料載入失敗，請檢查網路後再試一次。"
        onRetry={() => {
          loadMine();
          loadAvailable();
        }}
      />
    );
  }

  // 沒資料也沒錯誤＝還在載入。裝備、卸下之後的重新整理不會再回到這裡，頁面不會閃一下。
  if (!myData) return <FullPageLoading />;

  const actionLoading = equipLoading || unequipLoading;

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        裝備管理
      </Typography>

      {/* Equipped Slots */}
      <Grid container spacing={2}>
        {["weapon", "armor", "accessory"].map(slot => (
          <Grid size={{ xs: 12 }} key={slot}>
            <EquipSlotCard
              slot={slot}
              item={equipped[slot]}
              onClick={() => handleSlotClick(slot)}
            />
          </Grid>
        ))}
      </Grid>

      <BonusSummary bonuses={bonuses} />

      {/* Slot Selection Dialog */}
      <EquipDialog
        open={selectedSlot !== null}
        slot={selectedSlot}
        equippedItem={selectedSlot ? equipped[selectedSlot] : null}
        equipmentList={filteredEquipment}
        listError={Boolean(availableError) && !availableData}
        onRetryList={loadAvailable}
        onEquip={handleEquip}
        onUnequip={handleUnequip}
        onClose={() => setSelectedSlot(null)}
        loading={actionLoading}
      />

      <HintSnackBar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={closeSnack}
      />
    </>
  );
}
