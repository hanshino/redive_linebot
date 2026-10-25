import { useEffect, useState } from "react";
import {
  Stack,
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

// 送出成功後先讓使用者看到發了什麼，再關閉 LIFF 視窗
const CLOSE_DELAY_MS = 1200;

const PrettoSlider = styled(Slider)(({ theme }) => ({
  color: theme.palette.primary.main,
  height: 8,
  "& .MuiSlider-thumb": {
    height: 24,
    width: 24,
    backgroundColor: theme.palette.background.paper,
    border: "2px solid currentColor",
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
}));

function genMessage({ week, boss, type, damage, comment }) {
  let message = `.gbs ${week} ${boss}`;

  message += type ? ` --type=${type}` : "";
  message += damage ? ` --damage=${damage}` : "";
  message += comment ? ` --comment=${comment}` : "";

  return message;
}

export default function BattleSign() {
  const [{ isError, isSuccess, isSending }, send] = useSendMessage();
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

  // 成功後顯示剛送出的指令，約 1.2 秒後才關閉視窗；isSuccess 期間送出鍵維持鎖定，避免重複發送
  useEffect(() => {
    if (!isSuccess) return;
    showHint(`已發送到聊天室：${genMessage(state)}`, "success");
    const timer = setTimeout(() => liff.closeWindow(), CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
    // 只在成功的那一刻觸發；state 變動（例如使用者繼續改欄位）不該重設計時器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  useEffect(() => {
    const querys = new window.URLSearchParams(location.search);
    const damage = querys.get("damage") || 0;

    setHotKeys([
      { title: "物理一刀", damage, comment: "物理一刀殺", type: "1" },
      { title: "法刀一刀", damage, comment: "法刀一刀殺", type: "1" },
    ]);

    setState(prev => ({ ...prev, maxDamage: parseInt(damage) }));
  }, [location.search]);

  const handleDamage = event => {
    let damage = event.target.value;
    damage = /^\d+$/.test(damage) ? parseInt(damage) : "";
    setState(prev => ({ ...prev, damage }));
  };

  const handleComment = event => {
    setState(prev => ({ ...prev, comment: event.target.value }));
  };

  const handleType = event => {
    setState(prev => ({ ...prev, type: event.target.value }));
  };

  const sending = isSending || isSuccess;

  return (
    <Stack spacing={2.5} sx={{ p: 2 }}>
      <Typography variant="h4" component="h1">
        報名面板
      </Typography>
      <Alert severity="info">
        <AlertTitle>
          {state.week} 周 {state.boss} 王
        </AlertTitle>
        請注意是否為要 <strong>報名的王</strong> 以及 <strong>周次</strong>
      </Alert>

      <Stack spacing={1}>
        <Typography variant="body1">快速鍵</Typography>
        <ButtonGroup variant="text" color="primary" aria-label="快速填入">
          {Hotkeys.map(hotkey => (
            <Button
              key={hotkey.title}
              sx={{ minHeight: 44 }}
              onClick={() =>
                setState(prev => ({
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
      </Stack>

      <Stack spacing={2}>
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
          {SaberTypes.map(data => (
            <option key={data.value} value={data.value}>
              {data.title}
            </option>
          ))}
        </TextField>
        <Stack spacing={1}>
          <TextField
            label="預計傷害"
            fullWidth
            type="number"
            variant="outlined"
            value={state.damage}
            onChange={handleDamage}
          />
          <PrettoSlider
            aria-label="預計傷害"
            min={0}
            max={state.maxDamage}
            disabled={!(state.maxDamage > 0)}
            step={Math.floor(state.maxDamage / 100) || 1}
            value={parseInt(state.damage) || 0}
            onChange={(event, value) => setState(prev => ({ ...prev, damage: value.toString() }))}
          />
        </Stack>
        <TextField
          label="備註留言"
          fullWidth
          variant="outlined"
          value={state.comment}
          onChange={handleComment}
        />
        <CopyToClipboard text={genMessage(state)}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            disabled={sending}
            onClick={() => send(genMessage(state))}
            sx={{ minHeight: 48 }}
          >
            {isSuccess ? "已送出" : isSending ? "送出中…" : "送出"}
          </Button>
        </CopyToClipboard>
      </Stack>
      <HintSnackBar {...hintState} onClose={closeHint} />
    </Stack>
  );
}
