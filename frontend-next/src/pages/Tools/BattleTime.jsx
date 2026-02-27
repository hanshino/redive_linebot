import { useRef, useState, useMemo } from "react";
import {
  TextField,
  Grid,
  Typography,
  Button,
  ButtonGroup,
  Zoom,
  Slider,
  Input,
} from "@mui/material";
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from "@mui/lab";
import TimelapseIcon from "@mui/icons-material/Timelapse";
import RestoreIcon from "@mui/icons-material/Restore";
import DehazeIcon from "@mui/icons-material/Dehaze";
import ShareIcon from "@mui/icons-material/Share";
import SendIcon from "@mui/icons-material/Send";
import { blue, green } from "@mui/material/colors";
import { useSendMessage } from "../../hooks/useLiff";

const splitTimeline = (rawTimeline) => {
  const timePointReg = /(?<minute>([01]|[０１]))[:：]?(?<seconds>(\d|[０１２３４５６７８９]){2})/;
  const lines = rawTimeline.split("\n");

  const timeline = [];

  lines.forEach((line) => {
    const timePoint = timePointReg.exec(line);
    if (!timePoint) {
      return;
    }

    const { minute, seconds } = timePoint.groups;
    // Full-width to half-width conversion
    const minuteNum = parseInt(minute.normalize("NFKC"), 10);
    const secondsNum = parseInt(seconds.normalize("NFKC"), 10);

    timeline.push({
      time: timePoint[0],
      text: line.replace(timePoint[0], "").trim(),
      minute: minuteNum,
      seconds: secondsNum,
    });
  });

  return timeline;
};

const calculateNewTimeline = (timeline, remainTime) => {
  const offsetTime = 90 - remainTime;
  return timeline.map(({ minute, seconds, text }) => {
    const totalTime = minute * 60 + seconds;
    const finalTime = offsetTime ? totalTime - offsetTime : totalTime;
    const finalMinute = Math.floor(finalTime / 60);
    const finalSeconds = finalTime % 60;

    return {
      minute: finalMinute,
      seconds: finalSeconds,
      text,
    };
  });
};

function TimelineInput({ onSubmit, onClear }) {
  const inputEl = useRef(null);

  const handleClear = () => {
    inputEl.current.value = "";
    onClear();
  };

  return (
    <Grid container direction="column" spacing={2}>
      <Grid>
        <TextField
          inputRef={inputEl}
          multiline
          label="刀軸"
          variant="outlined"
          rows={20}
          fullWidth
        />
      </Grid>
      <Grid>
        <Grid container direction="row-reverse" spacing={2}>
          <Grid>
            <Button
              onClick={() => onSubmit(splitTimeline(inputEl.current.value))}
              variant="contained"
              color="primary"
            >
              轉換
            </Button>
          </Grid>
          <Grid>
            <Button onClick={handleClear} variant="contained" color="primary">
              清除
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}

function ControlRemainTime({ onChange, remainTime }) {
  const remainMinutes = Math.floor(remainTime / 60);
  const remainSeconds = remainTime % 60;

  const handleChange = (event, newValue) => {
    let val = typeof newValue === "string" ? parseInt(newValue) : newValue;
    if (val < 0) val = 0;
    else if (val > 90) val = 90;
    onChange(val);
  };

  return (
    <Grid container direction="column">
      <Grid>
        <Typography gutterBottom variant="h6">
          剩餘時間：{remainMinutes}分{remainSeconds}秒
        </Typography>
      </Grid>
      <Grid container spacing={2} alignItems="center">
        <Grid>
          <RestoreIcon />
        </Grid>
        <Grid size={{ xs: true }}>
          <Slider
            min={0}
            max={90}
            defaultValue={90}
            step={1}
            onChangeCommitted={(event, number) => onChange(number)}
          />
        </Grid>
        <Grid>
          <Input
            value={remainTime}
            margin="dense"
            onChange={(event) => handleChange(event, event.target.value)}
            slotProps={{
              input: {
                step: 1,
                min: 0,
                max: 90,
                type: "number",
                "aria-labelledby": "input-slider",
              },
            }}
          />
        </Grid>
      </Grid>
    </Grid>
  );
}

function BattleTimelineItem({ minute, seconds, content, offsetTime }) {
  const totalTime = minute * 60 + seconds;
  const finalTime = offsetTime ? totalTime - offsetTime : totalTime;
  const finalMinute = Math.floor(finalTime / 60);
  const finalSeconds = finalTime % 60;

  if (finalTime < 0) {
    return (
      <TimelineItem>
        <TimelineOppositeContent>
          <Typography color="text.secondary">0:00</Typography>
          {offsetTime && (
            <Typography color="error" variant="caption">
              (-{offsetTime})
            </Typography>
          )}
        </TimelineOppositeContent>
        <TimelineSeparator>
          <TimelineDot sx={{ bgcolor: "error.main" }} />
          <TimelineConnector sx={{ bgcolor: "error.main" }} />
        </TimelineSeparator>
        <TimelineContent>
          <Typography variant="body2">{content}</Typography>
        </TimelineContent>
      </TimelineItem>
    );
  }

  return (
    <TimelineItem>
      <TimelineOppositeContent>
        <Typography color="text.secondary">
          {finalMinute}:{`0${finalSeconds}`.slice(-2)}
        </Typography>
        {offsetTime && (
          <Typography color="error" variant="caption">
            (-{offsetTime})
          </Typography>
        )}
      </TimelineOppositeContent>
      <TimelineSeparator>
        <TimelineDot color="primary" />
        <TimelineConnector />
      </TimelineSeparator>
      <TimelineContent>
        <Typography variant="body2">{content}</Typography>
      </TimelineContent>
    </TimelineItem>
  );
}

function BattleTimeline({ timeline, remainTime }) {
  const offsetTime = 90 - remainTime;
  const props = {};

  if (offsetTime) {
    props.offsetTime = offsetTime;
  }

  return (
    <Grid>
      <Timeline>
        {timeline.map(({ minute, seconds, text }, index) => (
          <BattleTimelineItem
            key={index}
            minute={minute}
            seconds={seconds}
            content={text}
            {...props}
          />
        ))}
      </Timeline>
    </Grid>
  );
}

function BattleTimelineText({ timeline, remainTime }) {
  const newTimeline = calculateNewTimeline(timeline, remainTime);
  const text = useMemo(
    () =>
      newTimeline.map(({ minute, seconds, text }, index) => {
        let line;

        if (minute < 0 || seconds < 0) {
          line = `0:00 ${text}`;
        } else {
          line = `${minute}:${seconds < 10 ? `0${seconds}` : seconds} ${text}`;
        }

        return (
          <Typography key={index} variant="body2">
            {line}
          </Typography>
        );
      }),
    [newTimeline],
  );
  return <Grid>{text}</Grid>;
}

function ActionPannel({ changeType, timeline }) {
  const [, send] = useSendMessage();

  const handleSendLine = () => {
    const lines = timeline.map(({ minute, seconds, text }) => {
      let line;

      if (minute < 0 || seconds < 0) {
        line = `0:00 ${text}`;
      } else {
        line = `${minute}:${seconds < 10 ? `0${seconds}` : seconds} ${text}`;
      }

      return line;
    });

    send(lines.join("\n"));
  };

  return (
    <ButtonGroup sx={{ color: "grey.500" }} size="medium">
      <Button onClick={() => changeType("timeline")}>
        <TimelapseIcon sx={{ color: blue[500] }} />
      </Button>
      <Button onClick={() => changeType("text")}>
        <DehazeIcon sx={{ color: blue[500] }} />
      </Button>
      <Button>
        <ShareIcon sx={{ color: blue[500] }} />
      </Button>
      <Button onClick={handleSendLine}>
        發送到LINE
        <SendIcon sx={{ color: green[500], ml: "2px" }} />
      </Button>
    </ButtonGroup>
  );
}

export default function BattleTime() {
  const [timeline, setTimeline] = useState([]);
  const [step, setStep] = useState(0);
  const [remainTime, setRemainTime] = useState(90);
  const [showType, setShowType] = useState("timeline");

  const onSubmit = (tl) => {
    if (tl.length === 0) {
      return;
    }
    setStep(1);
    setTimeline(tl);
  };

  const onClear = () => {
    setStep(0);
    setTimeline([]);
  };

  return (
    <Grid container direction="column" sx={{ "& > *": { mb: 2 } }}>
      <Grid>
        <Typography variant="h5">補償刀轉換</Typography>
        <Typography variant="body1">
          補償刀轉換，請輸入補償刀的時間，轉換為補償刀的時間
        </Typography>
      </Grid>
      <Zoom in={step === 0}>
        <div hidden={step !== 0}>
          {step === 0 && (
            <Grid container>
              <TimelineInput onSubmit={onSubmit} onClear={onClear} />
            </Grid>
          )}
        </div>
      </Zoom>
      <Zoom in={step === 1} style={{ transitionDelay: step === 1 ? "500ms" : "0ms" }}>
        <div hidden={step !== 1}>
          {step === 1 && (
            <Grid
              container
              direction="column"
              alignItems="center"
              sx={{ "& > *": { mb: 2 } }}
            >
              <ControlRemainTime onChange={setRemainTime} remainTime={remainTime} />
              <Grid>
                <ActionPannel
                  changeType={setShowType}
                  timeline={calculateNewTimeline(timeline, remainTime)}
                />
              </Grid>
              <Zoom in={showType === "timeline"}>
                <div hidden={showType !== "timeline"}>
                  <BattleTimeline timeline={timeline} remainTime={remainTime} />
                </div>
              </Zoom>
              <Zoom in={showType === "text"}>
                <div hidden={showType !== "text"}>
                  <BattleTimelineText timeline={timeline} remainTime={remainTime} />
                </div>
              </Zoom>
            </Grid>
          )}
        </div>
      </Zoom>
    </Grid>
  );
}
