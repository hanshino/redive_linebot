import React, { useState, useEffect, useMemo, useCallback } from "react";
import useAxios from "axios-hooks";
import { makeStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardActionArea from "@material-ui/core/CardActionArea";
import Avatar from "@material-ui/core/Avatar";
import Chip from "@material-ui/core/Chip";
import Box from "@material-ui/core/Box";
import Divider from "@material-ui/core/Divider";
import Snackbar from "@material-ui/core/Snackbar";
import Alert from "@material-ui/lab/Alert";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import IconButton from "@material-ui/core/IconButton";
import GavelIcon from "@material-ui/icons/Gavel";
import SecurityIcon from "@material-ui/icons/Security";
import StarsIcon from "@material-ui/icons/Stars";
import AlertLogin from "../AlertLogin";
import { DotsLoading } from "../Loading";
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

const useStyles = makeStyles(theme => ({
  pageTitle: {
    fontWeight: 700,
    marginBottom: theme.spacing(2),
    color: "#5D4037",
  },
  sectionTitle: {
    fontWeight: 600,
    color: "#5D4037",
    marginBottom: theme.spacing(1),
  },
  slotCard: {
    borderRadius: 12,
    border: "2px solid #E0D5C1",
    background: "linear-gradient(135deg, #FFF8F0 0%, #EDDFC4 100%)",
    transition: "box-shadow 0.2s, border-color 0.2s",
    cursor: "pointer",
    "&:hover": {
      boxShadow: "0 4px 12px rgba(93, 64, 55, 0.2)",
    },
  },
  slotCardEquipped: {
    borderColor: props => RARITY_COLORS[props.rarity] || "#E0D5C1",
  },
  slotEmpty: {
    borderStyle: "dashed",
    opacity: 0.7,
  },
  slotContent: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(1.5),
    gap: theme.spacing(1.5),
  },
  equipAvatar: {
    width: 48,
    height: 48,
    backgroundColor: "#E0D5C1",
    fontSize: 24,
  },
  equipAvatarImage: {
    width: 48,
    height: 48,
    border: props => `2px solid ${RARITY_COLORS[props.rarity] || "#808080"}`,
  },
  equipName: {
    fontWeight: 600,
    fontSize: "0.95rem",
  },
  rarityChip: {
    height: 20,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#fff",
  },
  attrText: {
    fontSize: "0.8rem",
    color: "#795548",
  },
  bonusCard: {
    borderRadius: 12,
    background: "linear-gradient(135deg, #FFF8F0 0%, #EDDFC4 100%)",
    border: "2px solid #E0D5C1",
  },
  bonusItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: theme.spacing(0.5, 0),
  },
  bonusLabel: {
    color: "#795548",
    fontWeight: 500,
  },
  bonusValue: {
    fontWeight: 700,
    color: "#5D4037",
  },
  bonusValuePositive: {
    fontWeight: 700,
    color: "#2E7D32",
  },
  dialogEquipItem: {
    borderRadius: 8,
    marginBottom: theme.spacing(0.5),
    border: "1px solid #E0D5C1",
    "&:hover": {
      backgroundColor: "#FFF8F0",
    },
  },
  sectionDivider: {
    margin: theme.spacing(2, 0),
    backgroundColor: "#E0D5C1",
  },
}));

const { liff } = window;

const Equipment = () => {
  const classes = useStyles({});
  const isLoggedIn = useMemo(() => liff.isLoggedIn(), []);

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
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

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
    return availableList.filter(item => item.slot === selectedSlot);
  }, [availableList, selectedSlot]);

  const handleSlotClick = useCallback(slot => {
    setSelectedSlot(slot);
  }, []);

  const handleEquip = useCallback(
    async equipmentId => {
      try {
        await doEquip({ data: { equipment_id: equipmentId } });
        setSnackbar({ open: true, message: "裝備成功！", severity: "success" });
        setSelectedSlot(null);
        fetchMyEquipment();
        fetchAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "裝備失敗");
        setSnackbar({ open: true, message: msg, severity: "error" });
      }
    },
    [doEquip, fetchMyEquipment, fetchAvailable]
  );

  const handleUnequip = useCallback(
    async slot => {
      try {
        await doUnequip({ data: { slot } });
        setSnackbar({ open: true, message: "已卸下裝備", severity: "success" });
        setSelectedSlot(null);
        fetchMyEquipment();
        fetchAvailable();
      } catch (e) {
        const msg = get(e, "response.data.message", "卸下失敗");
        setSnackbar({ open: true, message: msg, severity: "error" });
      }
    },
    [doUnequip, fetchMyEquipment, fetchAvailable]
  );

  const handleCloseSnackbar = () => setSnackbar(prev => ({ ...prev, open: false }));

  if (!isLoggedIn) return <AlertLogin />;
  if (myLoading || availableLoading) return <DotsLoading />;

  const actionLoading = equipLoading || unequipLoading;

  return (
    <>
      <Typography variant="h5" className={classes.pageTitle}>
        裝備管理
      </Typography>

      {/* Equipped Slots */}
      <Grid container spacing={2}>
        {["weapon", "armor", "accessory"].map(slot => (
          <Grid item xs={12} key={slot}>
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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert elevation={6} variant="filled" severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

const EquipSlotCard = ({ slot, item, onClick }) => {
  const classes = useStyles({ rarity: item ? item.rarity : "common" });
  const isEmpty = !item;

  return (
    <Card
      className={`${classes.slotCard} ${isEmpty ? classes.slotEmpty : ""}`}
      elevation={0}
      onClick={onClick}
    >
      <CardActionArea>
        <Box className={classes.slotContent}>
          {isEmpty ? (
            <Avatar className={classes.equipAvatar}>{SLOT_ICONS[slot]}</Avatar>
          ) : (
            <Avatar
              src={item.image_url}
              alt={item.name}
              className={classes.equipAvatarImage}
              variant="rounded"
            >
              {SLOT_ICONS[slot]}
            </Avatar>
          )}
          <Box flex={1}>
            <Typography variant="caption" color="textSecondary">
              {SLOT_LABELS[slot]}
            </Typography>
            {isEmpty ? (
              <Typography variant="body2" color="textSecondary">
                點擊選擇裝備
              </Typography>
            ) : (
              <>
                <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                  <Typography className={classes.equipName}>{item.name}</Typography>
                  <Chip
                    label={item.rarity}
                    size="small"
                    className={classes.rarityChip}
                    style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
                  />
                </Box>
                <Typography className={classes.attrText}>
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
};

const BonusSummary = ({ bonuses }) => {
  const classes = useStyles({});
  const hasBonus = Object.values(bonuses).some(v => v !== 0);

  if (!hasBonus) return null;

  return (
    <>
      <Divider className={classes.sectionDivider} />
      <Typography variant="subtitle1" className={classes.sectionTitle}>
        裝備加成總覽
      </Typography>
      <Card className={classes.bonusCard} elevation={0}>
        <CardContent>
          {Object.entries(bonuses)
            .filter(([, v]) => v !== 0)
            .map(([key, value]) => (
              <Box key={key} className={classes.bonusItem}>
                <Typography variant="body2" className={classes.bonusLabel}>
                  {ATTR_LABELS[key] || key}
                </Typography>
                <Typography variant="body2" className={classes.bonusValuePositive}>
                  {formatAttrValue(key, value)}
                </Typography>
              </Box>
            ))}
        </CardContent>
      </Card>
    </>
  );
};

const EquipDialog = ({
  open,
  slot,
  equippedItem,
  equipmentList,
  onEquip,
  onUnequip,
  onClose,
  loading,
}) => {
  const classes = useStyles({});

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {slot && (
          <Box display="flex" alignItems="center" style={{ gap: 6 }}>
            {SLOT_ICONS[slot]}
            {SLOT_LABELS[slot]}
          </Box>
        )}
        {equippedItem && (
          <Typography variant="body2" color="textSecondary">
            目前裝備：{equippedItem.name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {equippedItem && (
          <Box mb={2}>
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
          <Typography color="textSecondary" align="center" style={{ padding: 16 }}>
            沒有可用的裝備
          </Typography>
        ) : (
          <List disablePadding>
            {equipmentList.map(item => {
              const attrs =
                typeof item.attributes === "string"
                  ? JSON.parse(item.attributes)
                  : item.attributes;
              const eqId = item.equipment_id || item.id;
              const isEquipped = equippedItem && equippedItem.id === eqId;

              return (
                <ListItem
                  key={eqId}
                  className={classes.dialogEquipItem}
                  button
                  onClick={() => !isEquipped && onEquip(eqId)}
                  disabled={isEquipped || loading}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={item.image_url}
                      variant="rounded"
                      style={{
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
                      <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <Chip
                          label={item.rarity}
                          size="small"
                          style={{
                            backgroundColor: RARITY_COLORS[item.rarity],
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
                        <Typography variant="caption" color="primary" style={{ fontWeight: 600 }}>
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
};

export default Equipment;
