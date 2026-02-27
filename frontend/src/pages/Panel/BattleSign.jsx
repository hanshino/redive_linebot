import { useEffect, useState } from "react";
import {
  Grid,
  Typography,
  TextField,
  Button,
  ButtonGroup,
  Alert,
  AlertTitle,
  Slider,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { useParams, useLocation } from "react-router-dom";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useSendMessage } from "../../hooks/useLiff";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import liff from "@line/liff";

const SaberTypes = [
  { title: "正式刀", value: "1" },
  { title: "補償刀", value: "2" },
  { title: "凱留刀", value: "3" },
];

const PrettoSlider = styled(Slider)({
  color: "#af5277",
  height: 8,
  "& .MuiSlider-thumb": {
    height: 24,
    width: 24,
    backgroundColor: "#fff",
    border: "2px solid currentColor",
    marginTop: -8,
    marginLeft: -12,
    "&:focus, &:hover, &.Mui-active": {
      boxShadow: "inherit",
    },
  },
  "& .MuiSlider-track": {
    height: 8,
    borderRadius: 4,
  },
  "& .MuiSlider-rail": {
    height: 8,
    borderRadius: 4,
  },
  "& .MuiSlider-valueLabel": {
    left: "calc(-50% + 4px)",
  },
});

function genMessage({ week, boss, type, damage, comment }) {
  let message = `.gbs ${week} ${boss}`;

  message += type ? ` --type=${type}` : "";
  message += damage ? ` --damage=${damage}` : "";
  message += comment ? ` --comment=${comment}` : "";

  return message;
}

export default function BattleSign() {
  const [{ isError, isSuccess }, send] = useSendMessage();
  const { week, boss } = useParams();
  const location = useLocation();
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [state, setState] = useState({
    week: week || 1,
    boss: boss || 1,
    type: "1",
    damage: "",
    comment: "",
    maxDamage: 0,
  });
  const [Hotkeys, setHotKeys] = useState([]);

  useEffect(() => {
    window.document.title = "自訂報名內容";
  }, []);

  useEffect(() => {
    if (!isError) return;
    showHint("發送失敗，不過幫你複製起來了！可直接到LINE貼上！", "warning");
  }, [isError, showHint]);

  useEffect(() => {
    if (!isSuccess) return;
    liff.closeWindow();
  }, [isSuccess]);

  useEffect(() => {
    const querys = new window.URLSearchParams(location.search);
    const damage = querys.get("damage") || 0;

    setHotKeys([
      { title: "物理一刀", damage, comment: "物理一刀殺", type: "1" },
      { title: "法刀一刀", damage, comment: "法隊一刀殺", type: "1" },
    ]);

    setState((prev) => ({ ...prev, maxDamage: parseInt(damage) }));
  }, [location.search]);

  const handleDamage = (event) => {
    let damage = event.target.value;
    damage = /^\d+$/.test(damage) ? parseInt(damage) : "";
    setState((prev) => ({ ...prev, damage }));
  };

  const handleComment = (event) => {
    setState((prev) => ({ ...prev, comment: event.target.value }));
  };

  const handleType = (event) => {
    setState((prev) => ({ ...prev, type: event.target.value }));
  };

  return (
    <>
      <Grid container sx={{ p: 1, "& > *": { m: 1 } }}>
        <Grid size={{ xs: 12 }}>
          <Typography variant="h4" component="p">
            報名面版
          </Typography>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Alert severity="info">
            <AlertTitle>
              {state.week} 周 {state.boss} 王
            </AlertTitle>
            請注意是否為要 <strong>報名的王</strong> 以及 <strong>周次</strong>
          </Alert>
        </Grid>
      </Grid>
      <Grid container direction="column" sx={{ p: 1, "& > *": { m: 1 } }}>
        <Grid>
          <Typography variant="body1">快速鍵</Typography>
        </Grid>
        <Grid>
          <ButtonGroup variant="text" color="primary" aria-label="text primary button group">
            {Hotkeys.map((hotkey, index) => (
              <Button
                key={index}
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    damage: hotkey.damage,
                    comment: hotkey.comment,
                    type: hotkey.type,
                  }))
                }
              >
                {hotkey.title}
              </Button>
            ))}
          </ButtonGroup>
        </Grid>
      </Grid>
      <Grid container justifyContent="space-around" sx={{ p: 1, "& > *": { m: 1 } }}>
        <Grid size={{ xs: 12, sm: 3 }}>
          <TextField
            select
            fullWidth
            label="刀種"
            value={state.type}
            onChange={handleType}
            slotProps={{
              select: { native: true },
            }}
            variant="outlined"
          >
            {SaberTypes.map((data) => (
              <option key={data.value} value={data.value}>
                {data.title}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid container size={{ xs: 12, sm: 3 }} direction="column">
          <Grid>
            <TextField
              label="預計傷害"
              fullWidth
              type="number"
              variant="outlined"
              value={state.damage}
              onChange={handleDamage}
            />
          </Grid>
          <Grid>
            <PrettoSlider
              min={0}
              max={state.maxDamage}
              step={Math.floor(state.maxDamage / 100) || 1}
              value={parseInt(state.damage) || 0}
              onChange={(event, value) =>
                setState((prev) => ({ ...prev, damage: value.toString() }))
              }
            />
          </Grid>
        </Grid>
        <Grid size={{ xs: 12, sm: 3 }}>
          <TextField
            label="備註留言"
            fullWidth
            variant="outlined"
            value={state.comment}
            onChange={handleComment}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
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
      <HintSnackBar {...hintState} onClose={closeHint} />
    </>
  );
}
