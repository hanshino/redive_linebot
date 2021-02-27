import React, { useEffect, useState } from "react";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import makeStyles from "@material-ui/core/styles/makeStyles";
import { Button } from "@material-ui/core";
import { useParams } from "react-router-dom";
import { Alert, AlertTitle } from "@material-ui/lab";

const SaberTypes = [
  { title: "正式刀", value: "1" },
  { title: "補償刀", value: "2" },
  { title: "凱留刀", value: "3" },
];

const useStyles = makeStyles(theme => ({
  gridBox: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const SendMessage = props => {
  const { liff } = window;
  const { week, boss, type, damage, comment } = props;

  let message = `.gbs ${week} ${boss}`;

  message += type ? ` --type=${type}` : "";
  message += damage ? ` --damage=${damage}` : "";
  message += comment ? ` --comment=${comment}` : "";

  return liff
    .sendMessages([
      {
        type: "text",
        text: message,
      },
    ])
    .then(liff.closeWindow);
};

const BattleSignPanel = () => {
  let { week, boss } = useParams();
  const classes = useStyles();
  const [state, setState] = useState({
    week: week || 1,
    boss: boss || 1,
    type: "1",
    damage: "",
    comment: "",
  });
  const { liff } = window;
  useEffect(() => {
    window.document.title = "自訂報名內容";
  }, []);

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

  if (!liff.isInClient()) {
    return (
      <Grid conatiner className={classes.gridBox}>
        <Grid item xs={12}>
          <Alert severity="error">此功能只能在智慧型裝置上使用！</Alert>
        </Grid>
      </Grid>
    );
  }

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
        <Grid item xs={12} sm={3}>
          <TextField
            label="預計傷害"
            fullWidth
            type="number"
            variant="outlined"
            value={state.damage}
            onChange={handleDamage}
          />
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
          <Button fullWidth variant="contained" color="primary" onClick={() => SendMessage(state)}>
            送出
          </Button>
        </Grid>
      </Grid>
    </React.Fragment>
  );
};

export default BattleSignPanel;
