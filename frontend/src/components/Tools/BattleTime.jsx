import React, { useRef, useState, useMemo } from "react";
import TextField from "@material-ui/core/TextField";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import ButtonGroup from "@material-ui/core/ButtonGroup";
import Zoom from "@material-ui/core/Zoom";
import Timeline from "@material-ui/lab/Timeline";
import TimelineItem from "@material-ui/lab/TimelineItem";
import TimelineSeparator from "@material-ui/lab/TimelineSeparator";
import TimelineConnector from "@material-ui/lab/TimelineConnector";
import TimelineContent from "@material-ui/lab/TimelineContent";
import TimelineDot from "@material-ui/lab/TimelineDot";
import TimelineOppositeContent from "@material-ui/lab/TimelineOppositeContent";
import Slider from "@material-ui/core/Slider";
import Input from "@material-ui/core/Input";
import TimelapseIcon from "@material-ui/icons/Timelapse";
import RestoreIcon from "@material-ui/icons/Restore";
import DehazeIcon from "@material-ui/icons/Dehaze";
import ShareIcon from "@material-ui/icons/Share";
import SendIcon from "@material-ui/icons/Send";
import PropTypes from "prop-types";
import makeStyles from "@material-ui/core/styles/makeStyles";
import blue from "@material-ui/core/colors/blue";
import { green } from "@material-ui/core/colors";
import { useSendMessage } from "../../hooks/liff";

const useStyles = makeStyles(theme => ({
  gridRoot: {
    "& > *": {
      marginBottom: theme.spacing(2),
    },
  },
  expiredTimeline: {
    backgroundColor: theme.palette.error.main,
  },
  buttonGroup: {
    color: theme.palette.grey[500],
  },
}));

const BattleTime = () => {
  const [timeline, setTimeline] = useState([]);
  const [step, setStep] = useState(0);
  const [remainTime, setRemainTime] = useState(90);
  const [showType, setShowType] = useState("timeline");
  const classes = useStyles();

  const onSubmit = timeline => {
    if (timeline.length === 0) {
      return;
    }
    setStep(1);
    setTimeline(timeline);
  };

  const onClear = () => {
    setStep(0);
    setTimeline([]);
  };

  return (
    <Grid container direction="column" className={classes.gridRoot}>
      <Grid item>
        <Typography variant="h5">補償刀轉換</Typography>
        <Typography variant="body1">補償刀轉換，請輸入補償刀的時間，轉換為補償刀的時間</Typography>
      </Grid>
      <Zoom in={step === 0}>
        <div hidden={step !== 0}>
          {step === 0 && (
            <Grid container item>
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
              item
              direction="column"
              alignItems="center"
              className={classes.gridRoot}
            >
              <ControlRemainTime onChange={setRemainTime} remainTime={remainTime} />
              <Grid item>
                <ActionPannel
                  changeType={setShowType}
                  timeline={cacluteNewTimeline(timeline, remainTime)}
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
};

const TimelineInput = ({ onSubmit, onClear }) => {
  const inputEl = useRef(null);

  const handleClear = () => {
    inputEl.current.value = "";
    onClear();
  };

  return (
    <Grid container direction="column" spacing={2}>
      <Grid item>
        <TextField
          inputRef={inputEl}
          multiline
          label="刀軸"
          variant="outlined"
          rows={20}
          fullWidth
        />
      </Grid>
      <Grid item>
        <Grid container direction="row-reverse" spacing={2}>
          <Grid item>
            <Button
              onClick={() => onSubmit(splitTimeline(inputEl.current.value))}
              variant="contained"
              color="primary"
            >
              轉換
            </Button>
          </Grid>
          <Grid item>
            <Button onClick={handleClear} variant="contained" color="primary">
              清除
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};

TimelineInput.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

const ControlRemainTime = ({ onChange, remainTime }) => {
  let remainMinutes = Math.floor(remainTime / 60);
  let remainSeconds = remainTime % 60;

  const handleChange = (event, newValue) => {
    if (newValue < 0) {
      newValue = 0;
    } else if (newValue > 90) {
      newValue = 90;
    }
    onChange(newValue);
  };

  return (
    <Grid container item direction="column">
      <Grid item>
        <Typography gutterBottom variant="h6">
          剩餘時間：{remainMinutes}分{remainSeconds}秒
        </Typography>
      </Grid>
      <Grid container spacing={2} alignItems="center">
        <Grid item>
          <RestoreIcon />
        </Grid>
        <Grid item xs>
          <Slider
            min={0}
            max={90}
            defaultValue={90}
            step={1}
            onChangeCommitted={(event, number) => onChange(number)}
          />
        </Grid>
        <Grid item>
          <Input
            value={remainTime}
            margin="dense"
            onChange={event => handleChange(event, event.target.value)}
            inputProps={{
              step: 1,
              min: 0,
              max: 90,
              type: "number",
              "aria-labelledby": "input-slider",
            }}
          />
        </Grid>
      </Grid>
    </Grid>
  );
};

ControlRemainTime.propTypes = {
  onChange: PropTypes.func.isRequired,
  remainTime: PropTypes.number.isRequired,
};

const BattleTimeline = ({ timeline, remainTime }) => {
  const offsetTime = 90 - remainTime;
  const props = {};

  if (offsetTime) {
    props.offsetTime = offsetTime;
  }

  return (
    <Grid item>
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
};

BattleTimeline.propTypes = {
  timeline: PropTypes.array.isRequired,
  remainTime: PropTypes.number.isRequired,
};

const BattleTimelineItem = ({ minute, seconds, content, offsetTime }) => {
  const classes = useStyles();
  const totalTime = minute * 60 + seconds;
  const finalTime = offsetTime ? totalTime - offsetTime : totalTime;
  const finalMinute = Math.floor(finalTime / 60);
  const finalSeconds = finalTime % 60;

  if (finalTime < 0) {
    return (
      <TimelineItem>
        <TimelineOppositeContent>
          <Typography color="textSecondary">0:00</Typography>
          {offsetTime && (
            <Typography color="error" variant="caption">
              (-{offsetTime})
            </Typography>
          )}
        </TimelineOppositeContent>
        <TimelineSeparator>
          <TimelineDot className={classes.expiredTimeline} />
          <TimelineConnector className={classes.expiredTimeline} />
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
        <Typography color="textSecondary">
          {finalMinute}:{`0${finalSeconds}`.substr(-2)}
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
};

BattleTimelineItem.propTypes = {
  minute: PropTypes.number.isRequired,
  seconds: PropTypes.number.isRequired,
  content: PropTypes.string.isRequired,
  offsetTime: PropTypes.number,
};

const BattleTimelineText = ({ timeline, remainTime }) => {
  const offsetTime = 90 - remainTime;
  const newTimeline = cacluteNewTimeline(timeline, remainTime);
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
    [newTimeline, offsetTime]
  );
  return <Grid item>{text}</Grid>;
};

BattleTimelineText.propTypes = {
  timeline: PropTypes.array.isRequired,
  remainTime: PropTypes.number.isRequired,
};

const cacluteNewTimeline = (timeline, remainTime) => {
  const offsetTime = 90 - remainTime;
  const newTimeline = timeline.map(({ minute, seconds, text }) => {
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
  return newTimeline;
};

const ActionPannel = ({ changeType, timeline }) => {
  const classes = useStyles();
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

    console.log(lines);

    send(lines.join("\n"));
  };

  return (
    <ButtonGroup className={classes.buttonGroup} size="medium">
      <Button onClick={() => changeType("timeline")}>
        <TimelapseIcon style={{ color: blue[500] }} />
      </Button>
      <Button onClick={() => changeType("text")}>
        <DehazeIcon style={{ color: blue[500] }} />
      </Button>
      <Button>
        <ShareIcon style={{ color: blue[500] }} />
      </Button>
      <Button onClick={handleSendLine}>
        發送到LINE
        <SendIcon style={{ color: green[500], marginLeft: "2px" }} />
      </Button>
    </ButtonGroup>
  );
};

ActionPannel.propTypes = {
  changeType: PropTypes.func.isRequired,
  timeline: PropTypes.array.isRequired,
};

const splitTimeline = rawTimeline => {
  const timePointReg = /(?<minute>([01]|[０１]))[:：]?(?<seconds>(\d|[０１２３４５６７８９]){2})/;
  const lines = rawTimeline.split("\n");

  const timeline = [];

  lines.forEach(line => {
    const timePoint = timePointReg.exec(line);
    if (!timePoint) {
      return;
    }

    const { minute, seconds } = timePoint.groups;
    // 全形轉換，轉換成半形
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

export default BattleTime;
