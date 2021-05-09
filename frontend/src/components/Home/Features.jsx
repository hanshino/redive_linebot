import React, { useContext, useState, Fragment } from "react";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import CardHeader from "@material-ui/core/CardHeader";
import IconButton from "@material-ui/core/IconButton";
import PropTypes from "prop-types";
import HowToVoteIcon from "@material-ui/icons/HowToVote";
import CheckIcon from "@material-ui/icons/Check";
import RecordVoiceOverIcon from "@material-ui/icons/RecordVoiceOver";
import LocalLibraryIcon from "@material-ui/icons/LocalLibrary";
import AdbIcon from "@material-ui/icons/Adb";
import GroupIcon from "@material-ui/icons/Group";
import MoreVertIcon from "@material-ui/icons/MoreVert";
import Dialog from "@material-ui/core/Dialog";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import { useTheme } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import Divider from "@material-ui/core/Divider";
import CloseIcon from "@material-ui/icons/Close";

const DialogContext = React.createContext({
  open: false,
  setOpen: () => {},
  features: { features: [], title: "", subtitle: "" },
  setFeatures: () => {},
});

const useStyles = makeStyles(theme => ({
  card: {
    height: "100%",
  },
  title: {
    fontSize: 14,
  },
  pos: {
    marginBottom: 12,
  },
  icon: {
    marginRight: theme.spacing(1),
  },
  closeButton: {
    position: "absolute",
    right: theme.spacing(1),
    top: theme.spacing(1),
    color: theme.palette.grey[500],
  },
  dialogTitle: {
    margin: 0,
    padding: theme.spacing(2),
  },
}));

const FeatureDatas = [
  {
    slogan: "高度客製化",
    title: "專屬指令",
    subHeader: "量身打造",
    content: "機器人學說話，最適合群組的指令，由您創造。",
    icon: HowToVoteIcon,
    subtitle:
      "使用此功能，可打造群組專用的關鍵字指令，不須特地因為遊戲的不同，而選擇不同的機器人！",
    features: [
      "指令只會在設定的群組中生效",
      "過久未觸發的指令，兩個月後清除",
      "觸發方式有兩種，敏感型觸發、完全符合觸發",
    ],
  },
  {
    slogan: "等級稱號制度",
    title: "幹話等級",
    subHeader: "最適嘴砲",
    content: "待在群組默默記錄，努力爬至那個嘴砲巔峰，蒐集所有稱號！",
    icon: RecordVoiceOverIcon,
    subtitle: "自創的等級制度，每一句話都是寶貴的經驗",
    features: [
      "群組中才進行累積",
      "成員越多，經驗加成越多",
      "5分鐘結算一次",
      "根據頻率(?)經驗計算會有差異",
    ],
  },
  {
    slogan: "群組管理系統",
    title: "管理員福音",
    subHeader: "強化群組",
    content:
      "處理群組所有數據，數據介面化顯示，稽查幽靈仔、發送歡迎訊息、Discord訊息轉發...等你挖掘！",
    icon: GroupIcon,
    subtitle: "群組的客製化設定，讓你的群組跟別人與眾不同",
    features: [
      "每個月1號數據歸0",
      "針對不同群組型態，會有不同的群組評語",
      "自從布丁開始統計後，沒說過話的人不會顯示在紀錄中",
      "非臺灣用戶有可能不會被記錄",
    ],
  },
  {
    slogan: "公主連結資訊",
    title: "遊戲查詢",
    subHeader: "更新迅速",
    content: "結合各大攻略網資訊，不用再去記什麼東西該去哪查詢！",
    icon: LocalLibraryIcon,
    subtitle: "及時提供您最完整的資訊",
    features: ["情報與日版同步"],
  },
  {
    slogan: "公主戰隊系統",
    title: "公會戰秘書",
    subHeader: "功能完善",
    content: "不斷最佳化，打造不管前排後排公會都適用的，專屬於戰隊的秘書！",
    icon: AdbIcon,
    subtitle: "",
    features: [
      "簽到表只需出完三刀即可，不排刀也能使用",
      "可自由設定日版台版Boss",
      "Discord版本開發中..",
    ],
  },
];

const Features = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogFeature, setDialogFeature] = useState({ title: "", features: [], subtitle: "" });

  return (
    <DialogContext.Provider
      value={{
        open: dialogOpen,
        setOpen: setDialogOpen,
        features: dialogFeature,
        setFeatures: setDialogFeature,
      }}
    >
      <Grid container item spacing={1}>
        {FeatureDatas.map((data, index) => (
          <Grid xs={12} sm={3} item key={index}>
            <FeatureCard {...data} />
          </Grid>
        ))}
        <FeatureDialog />
      </Grid>
    </DialogContext.Provider>
  );
};

const FeatureCard = props => {
  const classes = useStyles();
  const { setFeatures, setOpen } = useContext(DialogContext);
  const { slogan, title, subHeader, content, features, subtitle } = props;
  const CusIcon = props.icon;

  const handleMoreClick = () => {
    setFeatures({ features, subtitle, title });
    setOpen(true);
  };

  return (
    <Card className={classes.card}>
      <CardHeader
        avatar={<CheckIcon color="primary" />}
        title={slogan}
        action={
          <IconButton aria-label="settings" onClick={handleMoreClick}>
            <MoreVertIcon />
          </IconButton>
        }
      />
      <CardContent>
        <Typography variant="h5" component="h2">
          <CusIcon className={classes.icon} />
          {title}
        </Typography>
        <Typography className={classes.pos} color="textSecondary">
          {subHeader}
        </Typography>
        <Typography variant="body2" component="p">
          {content}
        </Typography>
      </CardContent>
    </Card>
  );
};

FeatureCard.propTypes = {
  slogan: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  subHeader: PropTypes.string.isRequired,
  content: PropTypes.string.isRequired,
  icon: PropTypes.object.isRequired,
  features: PropTypes.array.isRequired,
  subtitle: PropTypes.string.isRequired,
};

const FeatureDialog = () => {
  const classes = useStyles();
  const { open, setOpen, features } = useContext(DialogContext);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { title, subtitle, features: jouhou } = features;

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <div>
      <Dialog
        fullScreen={fullScreen}
        open={open}
        onClose={handleClose}
        aria-labelledby="responsive-dialog-title"
      >
        <DialogTitle className={classes.dialogTitle}>
          {title}
          <IconButton aria-label="close" className={classes.closeButton} onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText>
            <Typography variant="caption">{subtitle}</Typography>
          </DialogContentText>
          <Typography variant="body1">目前可公開情報..</Typography>
          <List>
            {jouhou.map((str, index) => (
              <Fragment key={index}>
                <ListItem>
                  <ListItemText primary={`${index + 1}. ${str}`} />
                </ListItem>
                <Divider />
              </Fragment>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            關閉
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default Features;
