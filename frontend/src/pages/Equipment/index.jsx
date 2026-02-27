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
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";
import SecurityIcon from "@mui/icons-material/Security";
import StarsIcon from "@mui/icons-material/Stars";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import { get } from "lodash";

const RARITY_COLORS = {
  common: "#808080",
  rare: "#3478FF",
  epic: "#A834FF",
  legendary: "#FF8C00",
};

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

import useLiff from "../../context/useLiff";

function EquipSlotCard({ slot, item, onClick }) {
  const isEmpty = !item;
  const rarity = item ? item.rarity : "common";
  const rarityColor = RARITY_COLORS[rarity] || "#808080";

  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        borderRadius: 3,
        border: "2px solid #E0D5C1",
        background: "linear-gradient(135deg, #FFF8F0 0%, #EDDFC4 100%)",
        transition: "box-shadow 0.2s, border-color 0.2s",
        cursor: "pointer",
        "&:hover": {
          boxShadow: "0 4px 12px rgba(93, 64, 55, 0.2)",
        },
        ...(isEmpty
          ? { borderStyle: "dashed", opacity: 0.7 }
          : { borderColor: rarityColor }),
      }}
    >
      <CardActionArea>
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
              sx={{
                width: 48,
                height: 48,
                bgcolor: "#E0D5C1",
                fontSize: 24,
              }}
            >
              {SLOT_ICONS[slot]}
            </Avatar>
          ) : (
            <Avatar
              src={item.image_url}
              alt={item.name}
              variant="rounded"
              sx={{
                width: 48,
                height: 48,
                border: `2px solid ${rarityColor}`,
              }}
            >
              {SLOT_ICONS[slot]}
            </Avatar>
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {SLOT_LABELS[slot]}
            </Typography>
            {isEmpty ? (
              <Typography variant="body2" color="text.secondary">
                點擊選擇裝備
              </Typography>
            ) : (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {item.name}
                  </Typography>
                  <Chip
                    label={item.rarity}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: "#fff",
                      bgcolor: RARITY_COLORS[item.rarity],
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: "0.8rem", color: "#795548" }}>
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
  const hasBonus = Object.values(bonuses).some((v) => v !== 0);

  if (!hasBonus) return null;

  return (
    <>
      <Divider sx={{ my: 2, bgcolor: "#E0D5C1" }} />
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 600, color: "#5D4037", mb: 1 }}
      >
        裝備加成總覽
      </Typography>
      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          background: "linear-gradient(135deg, #FFF8F0 0%, #EDDFC4 100%)",
          border: "2px solid #E0D5C1",
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
                <Typography
                  variant="body2"
                  sx={{ color: "#795548", fontWeight: 500 }}
                >
                  {ATTR_LABELS[key] || key}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: "#2E7D32" }}
                >
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
          <Typography variant="body2" color="text.secondary">
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
            >
              卸下目前裝備
            </Button>
          </Box>
        )}

        {equipmentList.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ p: 2 }}>
            沒有可用的裝備
          </Typography>
        ) : (
          <List disablePadding>
            {equipmentList.map((item) => {
              const attrs =
                typeof item.attributes === "string"
                  ? JSON.parse(item.attributes)
                  : item.attributes;
              const eqId = item.equipment_id || item.id;
              const isEquipped = equippedItem && equippedItem.id === eqId;

              return (
                <ListItem
                  key={eqId}
                  onClick={() => !isEquipped && onEquip(eqId)}
                  disabled={isEquipped || loading}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    border: "1px solid #E0D5C1",
                    cursor: isEquipped || loading ? "default" : "pointer",
                    "&:hover": {
                      bgcolor: "#FFF8F0",
                    },
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={item.image_url}
                      variant="rounded"
                      sx={{
                        border: `2px solid ${RARITY_COLORS[item.rarity]}`,
                        width: 40,
                        height: 40,
                      }}
                    >
                      {SLOT_ICONS[slot]}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <Chip
                          label={item.rarity}
                          size="small"
                          sx={{
                            bgcolor: RARITY_COLORS[item.rarity],
                            color: "#fff",
                            height: 18,
                            fontSize: "0.65rem",
                          }}
                        />
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
                  <ListItemSecondaryAction>
                    {isEquipped ? (
                      <Chip label="裝備中" size="small" color="primary" />
                    ) : (
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => onEquip(eqId)}
                        disabled={loading}
                      >
                        <Typography
                          variant="caption"
                          color="primary"
                          sx={{ fontWeight: 600 }}
                        >
                          裝備
                        </Typography>
                      </IconButton>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          關閉
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Equipment() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [snackbar, { handleOpen: showSnack, handleClose: closeSnack }] = useHintBar();

  const [{ data: myData, loading: myLoading }, fetchMyEquipment] = useAxios(
    "/api/Game/Equipment/me",
    { manual: true }
  );
  const [{ data: availableList = [], loading: availableLoading }, fetchAvailable] = useAxios(
    "/api/Game/Equipment/available",
    { manual: true }
  );
  const [{ loading: equipLoading }, doEquip] = useAxios(
    { url: "/api/Game/Equipment/equip", method: "POST" },
    { manual: true }
  );
  const [{ loading: unequipLoading }, doUnequip] = useAxios(
    { url: "/api/Game/Equipment/unequip", method: "POST" },
    { manual: true }
  );

  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    document.title = "裝備管理";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchMyEquipment();
    fetchAvailable();
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

  const filteredEquipment = useMemo(() => {
    if (!selectedSlot) return [];
    return availableList.filter((item) => item.slot === selectedSlot);
  }, [availableList, selectedSlot]);

  const handleSlotClick = useCallback((slot) => {
    setSelectedSlot(slot);
  }, []);

  const handleEquip = useCallback(
    async (equipmentId) => {
      try {
        await doEquip({ data: { equipment_id: equipmentId } });
        showSnack("裝備成功！", "success");
        setSelectedSlot(null);
        fetchMyEquipment();
        fetchAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "裝備失敗");
        showSnack(msg, "error");
      }
    },
    [doEquip, fetchMyEquipment, fetchAvailable, showSnack]
  );

  const handleUnequip = useCallback(
    async (slot) => {
      try {
        await doUnequip({ data: { slot } });
        showSnack("已卸下裝備", "success");
        setSelectedSlot(null);
        fetchMyEquipment();
        fetchAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "卸下失敗");
        showSnack(msg, "error");
      }
    },
    [doUnequip, fetchMyEquipment, fetchAvailable, showSnack]
  );

  if (!isLoggedIn) return <AlertLogin />;
  if (myLoading || availableLoading) return <FullPageLoading />;

  const actionLoading = equipLoading || unequipLoading;

  return (
    <>
      <Typography
        variant="h5"
        sx={{ fontWeight: 700, mb: 2, color: "#5D4037" }}
      >
        裝備管理
      </Typography>

      {/* Equipped Slots */}
      <Grid container spacing={2}>
        {["weapon", "armor", "accessory"].map((slot) => (
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
