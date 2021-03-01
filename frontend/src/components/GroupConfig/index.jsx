import React from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import ConfigCard from "./ConfigCard";
import Container from "@material-ui/core/Container";
import GroupAPI from "../../api/Group";
import { useParams } from "react-router-dom";
import PropTypes from "prop-types";
import Alert from "@material-ui/lab/Alert";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Backdrop from "@material-ui/core/Backdrop";
import DialogTitle from "@material-ui/core/DialogTitle";
import Dialog from "@material-ui/core/Dialog";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import Avatar from "@material-ui/core/Avatar";
import SenderInput from "./SenderInput";

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
  },
  rowInput: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1),
  },
  button: {
    margin: theme.spacing(1),
    marginBottom: 0,
  },
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
  dialog: {
    minWidth: 320,
    padding: theme.spacing(2),
  },
  gridRoot: {
    margin: theme.spacing(1),
  },
  contain: {
    padding: theme.spacing(2),
  },
}));

const GroupConfig = () => {
  const classes = useStyles();
  const isLoggedIn = window.liff.isLoggedIn();
  const [loading, setLoading] = React.useState(false);
  const [info, setInfo] = React.useState({
    groupId: "",
    groupName: "",
    pictureUrl: "",
    count: 0,
  });
  const [state, setState] = React.useState({
    GroupConfigData: [],
    GroupConfig: {
      Battle: "Y",
      PrincessCharacter: "Y",
      CustomerOrder: "Y",
      GlobalOrder: "Y",
      Gacha: "Y",
      PrincessInformation: "Y",
    },
    DiscordWebhook: "",
    WelcomeMessage: "",
    Sender: { name: "", iconUrl: "" },
  });

  let match = useParams();
  const { groupId } = match;

  async function fetchData() {
    setLoading(true);
    const [GroupConfigData, Config, Info] = await Promise.all([
      GroupAPI.fetchGroupConfigData().then(res => res.data),
      GroupAPI.fetchGroupConfig(groupId).then(res => res.data),
      GroupAPI.getGroupInfo(groupId),
    ]);
    setLoading(false);

    const { GroupConfig, DiscordWebhook, WelcomeMessage, Sender } = Config;

    setInfo({
      ...info,
      ...Info,
    });

    setState({
      ...state,
      GroupConfigData: GroupConfigData,
      GroupConfig,
      DiscordWebhook,
      WelcomeMessage,
      Sender: { ...state.Sender, ...Sender },
    });
  }

  React.useEffect(() => {
    window.document.title = "群組設定";
    fetchData();
  }, []);

  return (
    <Container>
      <div className={classes.root}>
        <Grid container className={classes.contain}>
          <GuildHeadInfo {...info} />
          {isLoggedIn ? null : (
            <Grid item xs={12} sm={12}>
              <Alert severity="warning">登入後即可進行操作！</Alert>
            </Grid>
          )}
          <SenderInput {...{ isLoggedIn }} action={setSender} Sender={state.Sender} />
          <ConstMessageInput
            modifyTrigger={fetchData}
            WelcomeMessage={state.WelcomeMessage}
            isLoggedIn={isLoggedIn}
          />
          <WebhookInput
            modifyTrigger={fetchData}
            DiscordWebhook={state.DiscordWebhook}
            isLoggedIn={isLoggedIn}
          />
          <Card
            datas={state.GroupConfigData}
            config={state.GroupConfig}
            handle={writeConfig}
            isLoggedIn={isLoggedIn}
          />
        </Grid>
      </div>
      <Backdrop className={classes.backdrop} open={loading} />
    </Container>
  );

  function writeConfig(name, status) {
    return GroupAPI.switchGroupConfig(groupId, name, status ? 1 : 0);
  }

  function setSender(name, iconUrl) {
    setLoading(true);
    return GroupAPI.setSender(groupId, { name, iconUrl })
      .then(fetchData)
      .finally(() => setLoading(false));
  }
};

const HeadStyles = makeStyles(theme => ({
  rootItem: {
    marginBottom: theme.spacing(2),
  },
  root: {
    padding: theme.spacing(2),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
  icon: {
    width: theme.spacing(10),
    height: theme.spacing(10),
  },
}));

const GuildHeadInfo = props => {
  const classes = HeadStyles();
  const { groupName, pictureUrl, count } = props;

  return (
    <Grid item xs={12} sm={12} component={Paper} className={classes.rootItem}>
      <Grid container className={classes.root}>
        <Grid item>
          <Avatar
            variant="square"
            className={classes.icon}
            alt={groupName}
            {...(pictureUrl ? { src: pictureUrl } : null)}
          />
        </Grid>
        <Grid item>
          <Typography variant="subtitle1">
            群組名稱 <b>{groupName}</b>
          </Typography>
          <Typography variant="subtitle1">
            群組人數 <b>{count}</b>
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
};

GuildHeadInfo.propTypes = {
  groupId: PropTypes.string.isRequired,
  groupName: PropTypes.string.isRequired,
  pictureUrl: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
};

const WebhookInput = props => {
  let match = useParams();
  const { groupId } = match;
  const { DiscordWebhook, modifyTrigger, isLoggedIn } = props;
  const classes = useStyles();
  const [webhook, setWebhook] = React.useState(DiscordWebhook);
  const [testBlock, setBlock] = React.useState(false);

  React.useEffect(() => {
    setWebhook(DiscordWebhook);
  }, [DiscordWebhook]);

  const handleSave = () => {
    GroupAPI.setDiscordWebhook(groupId, webhook).then(modifyTrigger);
  };

  const handleRemove = () => {
    GroupAPI.removeDiscordWebhook(groupId, webhook).then(modifyTrigger);
  };

  const handleTest = () => {
    setBlock(true);
    GroupAPI.testDiscordWebhook(webhook);
    setTimeout(() => setBlock(false), 10000);
  };

  return (
    <Grid item xs={12} sm={12} className={classes.rowInput} component={Paper}>
      <Grid container className={classes.contain}>
        <Grid item xs={12} sm={12}>
          <Typography variant="h5" component="h2">
            Discord Webhook 綁定
          </Typography>
          <Typography variant="body2" component="p">
            可將 Line 訊息，即時轉發至 Discord 指定頻道
          </Typography>
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField
            label="Discord Webhook"
            fullWidth
            disabled={!isLoggedIn}
            value={webhook}
            onChange={event => setWebhook(event.target.value)}
          />
        </Grid>
        <Grid item xs={4} sm={1}>
          <Button className={classes.button} disabled={testBlock} onClick={handleTest}>
            測試
          </Button>
        </Grid>
        <Grid item xs={4} sm={1}>
          <Button
            className={classes.button}
            disabled={!isLoggedIn}
            color="primary"
            onClick={handleSave}
          >
            連結
          </Button>
        </Grid>
        <Grid item xs={4} sm={1}>
          <Button
            className={classes.button}
            disabled={!isLoggedIn}
            color="secondary"
            onClick={handleRemove}
          >
            解除
          </Button>
        </Grid>
      </Grid>
    </Grid>
  );
};

WebhookInput.propTypes = {
  DiscordWebhook: PropTypes.string.isRequired,
  modifyTrigger: PropTypes.func.isRequired,
  isLoggedIn: PropTypes.bool.isRequired,
};

const ConstMessageInput = props => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const classes = useStyles();
  let match = useParams();
  const { groupId } = match;
  const { WelcomeMessage, modifyTrigger, isLoggedIn } = props;
  const [open, setOpen] = React.useState(false);
  const [constMessage, setMessage] = React.useState("");

  const handleClickUsername = () => {
    setMessage(`${constMessage} {UserName}`);
  };

  const handleClickGroupname = () => {
    setMessage(`${constMessage} {GroupName}`);
  };

  const handleSave = () => {
    setOpen(false);
    GroupAPI.setWelcomeMessage(groupId, constMessage).then(modifyTrigger);
  };

  React.useEffect(() => {
    setMessage(WelcomeMessage);
  }, [WelcomeMessage]);

  return (
    <React.Fragment>
      <Grid item xs={12} className={classes.rowInput} component={Paper}>
        <Grid container className={classes.contain}>
          <Grid item xs={12}>
            <Typography variant="h5" component="h2">
              {"加入歡迎訊息"}
            </Typography>
            <Typography variant="body2" component="p">
              {"可設定新成員加入發送特定訊息。"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={10}>
            <TextField
              label="歡迎訊息"
              disabled
              variant="filled"
              fullWidth
              multiline
              value={constMessage}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              className={classes.button}
              color="primary"
              onClick={() => setOpen(true)}
              disabled={!isLoggedIn}
            >
              {"編輯"}
            </Button>
          </Grid>
        </Grid>
      </Grid>
      <Dialog
        fullScreen={fullScreen}
        className={classes.dialog}
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
      >
        <DialogTitle>加入歡迎訊息</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={12}>
              <TextField
                label="訊息"
                fullWidth
                value={constMessage}
                onChange={event => setMessage(event.target.value)}
                multiline
                rows={4}
              />
            </Grid>
            <Grid item>
              <Button variant="contained" color="primary" onClick={handleClickUsername}>
                使用者名稱
              </Button>
            </Grid>
            <Grid item>
              <Button variant="contained" color="primary" onClick={handleClickGroupname}>
                群組名稱
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button color="primary" onClick={handleSave}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
};

ConstMessageInput.propTypes = {
  WelcomeMessage: PropTypes.string.isRequired,
  modifyTrigger: PropTypes.func.isRequired,
  isLoggedIn: PropTypes.bool.isRequired,
};

const Card = props => {
  const { datas, config, handle, isLoggedIn } = props;
  const classes = useStyles();

  var chunks = [];

  datas.forEach((data, index) => {
    chunks[parseInt(index / 3)] = chunks[parseInt(index / 3)] || [];
    chunks[parseInt(index / 3)].push(data);
  });

  return (
    <Grid container className={classes.gridRoot}>
      {datas.map(data => {
        return (
          <Grid item xs={12} sm={4} key={data.name} className={classes.contain}>
            <ConfigCard
              {...data}
              status={config[data.name]}
              handle={handle}
              isLoggedIn={isLoggedIn}
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

Card.propTypes = {
  datas: PropTypes.array,
  config: PropTypes.object,
  handle: PropTypes.func,
  isLoggedIn: PropTypes.bool,
};

export default GroupConfig;
