import React from "react";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import CardHeader from "@material-ui/core/CardHeader";
import PropTypes from "prop-types";
import HowToVoteIcon from "@material-ui/icons/HowToVote";
import CheckIcon from "@material-ui/icons/Check";
import RecordVoiceOverIcon from "@material-ui/icons/RecordVoiceOver";
import LocalLibraryIcon from "@material-ui/icons/LocalLibrary";
import AdbIcon from '@material-ui/icons/Adb';
import GroupIcon from '@material-ui/icons/Group';

const useStyles = makeStyles(theme => ({
  card: {
    height: "100%"
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
}));

const FeatureDatas = [
  {
    slogan: "高度客製化",
    title: "專屬指令",
    subHeader: "量身打造",
    content: "機器人學說話，最適合群組的指令，由您創造。",
    icon: HowToVoteIcon,
  },
  {
    slogan: "等級稱號制度",
    title: "幹話等級",
    subHeader: "最適嘴砲",
    content: "待在群組默默記錄，努力爬至那個嘴砲巔峰，蒐集所有稱號！",
    icon: RecordVoiceOverIcon,
  },
  {
    slogan: "群組管理系統",
    title: "管理員福音",
    subHeader: "強化群組",
    content: "處理群組所有數據，數據介面化顯示，稽查幽靈仔、發送歡迎訊息、Discord訊息轉發...等你挖掘！",
    icon: GroupIcon,
  },
  {
    slogan: "公主連結資訊",
    title: "遊戲查詢",
    subHeader: "更新迅速",
    content: "結合各大攻略網資訊，不用再紀錄該去哪查詢！",
    icon: LocalLibraryIcon,
  },
  {
    slogan: "公主戰隊系統",
    title: "公會戰秘書",
    subHeader: "功能完善",
    content: "不斷最佳化，打造不管前排後排公會都適用的，專屬於戰隊的秘書！",
    icon: AdbIcon,
  },
];

const Features = () => {
  return (
    <Grid container item spacing={1}>
      {FeatureDatas.map((data, index) => (
        <Grid xs={12} sm={3} item key={index}>
          <FeatureCard {...data} />
        </Grid>
      ))}
    </Grid>
  );
};

const FeatureCard = props => {
  const classes = useStyles();
  const { slogan, title, subHeader, content } = props;
  const CusIcon = props.icon;
  return (
    <Card className={classes.card}>
      <CardHeader avatar={<CheckIcon color="primary" />} title={slogan} />
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
};

export default Features;
