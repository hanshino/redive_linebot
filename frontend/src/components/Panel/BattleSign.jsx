import React, { useEffect, useState } from "react";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import makeStyles from "@material-ui/core/styles/makeStyles";
import withStyles from "@material-ui/core/styles/withStyles";
import { Button, ButtonGroup } from "@material-ui/core";
import { useParams, useLocation } from "react-router-dom";
import { Alert, AlertTitle } from "@material-ui/lab";
import Slider from "@material-ui/core/Slider";
import { useSendMessage } from "../../hooks/liff";
import { CopyToClipboard } from "react-copy-to-clipboard";
import Snackbar from "@material-ui/core/Snackbar";

const SaberTypes = [
  { title: "正式刀", value: "1" },
  { title: "補償刀", value: "2" },
  { title: "凱留刀", value: "3" },
];

const PrettoSlider = withStyles({
  root: {
    color: "#af5277",
    height: 8,
  },
  thumb: {
    height: 24,
    width: 24,
    backgroundColor: "#fff",
    border: "2px solid currentColor",
    marginTop: -8,
    marginLeft: -12,
    "&:focus, &:hover, &$active": {
      boxShadow: "inherit",
    },
  },
  active: {},
  valueLabel: {
    left: "calc(-50% + 4px)",
  },
  track: {
    height: 8,
    borderRadius: 4,
  },
  rail: {
    height: 8,
    borderRadius: 4,
  },
})(Slider);

const useStyles = makeStyles(theme => ({
  gridBox: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const BattleSign = () => {
  const [{ isError, isSuccess }, send] = useSendMessage();
  let { week, boss } = useParams();
  const location = useLocation();
  const classes = useStyles();
  const [state, setState] = useState({
    week: week || 1,
    boss: boss || 1,
    type: "1",
    damage: "",
    comment: "",
    maxDamage: 0,
  });
  const [alert, setAlert] = useState({ open: false, message: "" });
  const [Hotkeys, setHotKeys] = useState([]);

  useEffect(() => {
    window.document.title = "自訂報名內容";
  }, []);

  useEffect(() => {
    if (!isError) return;

    setAlert({ open: true, message: "發送失敗，不過幫你複製起來了！可直接到LINE貼上！" });
  }, [isError]);

  useEffect(() => {
    if (!isSuccess) return;
    window.liff.closeWindow();
  }, [isSuccess]);

  useEffect(() => {
    const querys = new window.URLSearchParams(location.search);
    let damage = querys.get("damage") || 0;

    setHotKeys([
      { title: "物理一刀", damage, comment: "物理一刀殺", type: "1" },
      { title: "法刀一刀", damage, comment: "法隊一刀殺", type: "1" },
    ]);

    setState({ ...state, maxDamage: parseInt(damage) });
  }, [location.search]);

  const alertClose = () => {
    setAlert({ ...alert, open: false, message: "" });
  };

  const handleDamage = event => {
    let damage = event.target.value;
    damage = /^\d+$/.test(damage) ? parseInt(damage) : "";
    setState({ ...state, damage });
  };

  const handleComment = event => {
    setState({ ...state, comment: event.target.value });
  };

  const handleType = event => {
    setState({ ...state, type: event.target.value });
  };

  return (
    <React.Fragment>
      <Grid container className={classes.gridBox}>
        <Grid item xs={12}>
          <Typography variant="h4" component="p">
            報名面版
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Alert severity="info">
            <AlertTitle>
              {state.week} 周 {state.boss} 王
            </AlertTitle>
            請注意是否為要 <strong>報名的王</strong> 以及 <strong>周次</strong>
          </Alert>
        </Grid>
      </Grid>
      <Grid container className={classes.gridBox} direction="column">
        <Grid item>
          <Typography variant="body1">快速鍵</Typography>
        </Grid>
        <Grid item>
          <ButtonGroup variant="text" color="primary" aria-label="text primary button group">
            {Hotkeys.map((hotkey, index) => (
              <Button
                key={index}
                onClick={() =>
                  setState({
                    ...state,
                    damage: hotkey.damage,
                    comment: hotkey.comment,
                    type: hotkey.type,
                  })
                }
              >
                {hotkey.title}
              </Button>
            ))}
          </ButtonGroup>
        </Grid>
      </Grid>
      <Grid container className={classes.gridBox} justify="space-around">
        <Grid item xs={12} sm={3}>
          <TextField
            select
            fullWidth
            label="刀種"
            value={state.type}
            onChange={handleType}
            SelectProps={{
              native: true,
            }}
            variant="outlined"
          >
            {SaberTypes.map(data => (
              <option key={data.value} value={data.value}>
                {data.title}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid container item xs={12} sm={3} direction="column">
          <Grid item>
            <TextField
              label="預計傷害"
              fullWidth
              type="number"
              variant="outlined"
              value={state.damage}
              onChange={handleDamage}
            />
          </Grid>
          <Grid item>
            <PrettoSlider
              min={0}
              max={state.maxDamage}
              step={window.Math.floor(state.maxDamage / 100)}
              value={parseInt(state.damage)}
              onChange={(event, value) => setState({ ...state, damage: value.toString() })}
            />
          </Grid>
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            label="備註留言"
            fullWidth
            variant="outlined"
            value={state.comment}
            onChange={handleComment}
          />
        </Grid>
        <Grid item xs={12}>
          <CopyToClipboard text={genMessage(state)}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={() => send(genMessage(state))}
            >
              送出
            </Button>
          </CopyToClipboard>
        </Grid>
      </Grid>
      <Snackbar open={alert.open} autoHideDuration={6000} onClose={alertClose}>
        <Alert elevation={6} variant="filled" onClose={alertClose} severity="warning">
          {alert.message}
        </Alert>
      </Snackbar>
    </React.Fragment>
  );
};

function genMessage(props) {
  const { week, boss, type, damage, comment } = props;

  let message = `.gbs ${week} ${boss}`;

  message += type ? ` --type=${type}` : "";
  message += damage ? ` --damage=${damage}` : "";
  message += comment ? ` --comment=${comment}` : "";

  return message;
}

export default BattleSign;
