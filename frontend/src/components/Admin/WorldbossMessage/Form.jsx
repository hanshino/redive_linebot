import {
  Avatar,
  FormControl,
  Grid,
  makeStyles,
  Paper,
  TextField,
  Typography,
  withStyles,
} from "@material-ui/core";
import React, { useState } from "react";
import PropTypes from "prop-types";
import MuiButton from "@material-ui/core/Button";
import { Link } from "react-router-dom";
import { green } from "@material-ui/core/colors";
import { CircularProgress } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
  root: {
    "& > *": {
      marginBottom: theme.spacing(1),
    },
  },
  wrapper: {
    margin: theme.spacing(1),
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
}));

const Button = withStyles(theme => ({
  root: {
    marginRight: theme.spacing(1),
  },
}))(MuiButton);

const MessageForm = ({
  defaultImageUrl = "",
  defaultTemplate = "",
  onSubmit = () => {},
  loading = false,
}) => {
  const classes = useStyles();
  const [formData, setFormData] = useState({
    imageUrl: defaultImageUrl,
    template: defaultTemplate,
  });
  const handleChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };
  const imageRegex = /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
  const isValidImage = imageRegex.test(formData.imageUrl);
  const isValidTemplate = formData.template.length > 0;

  return (
    <FormControl fullWidth>
      <Grid container direction="column" className={classes.root}>
        <Grid item>
          <TextField
            fullWidth
            label="樣板訊息"
            multiline
            variant="outlined"
            value={formData.template}
            error={!isValidTemplate}
            onChange={event => handleChange("template", event.target.value)}
          />
        </Grid>
        <Grid item>
          <TextField
            fullWidth
            label="頭像"
            variant="outlined"
            value={formData.imageUrl}
            error={!isValidImage}
            onChange={event => handleChange("imageUrl", event.target.value)}
          />
        </Grid>
        <Grid item style={{ "& > *": { marginRight: "3px" } }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleChange("template", `${formData.template} {{ damage }}`)}
          >
            傷害資訊
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleChange("template", `${formData.template} {{ display_name }}`)}
          >
            玩家名稱
          </Button>
        </Grid>
        <Grid item>
          <Typography variant="caption">
            樣板訊息可使用以下標籤：
            <br />
            <code>{`{{ damage }}`}</code> - 傷害資訊
            <br />
            <code>{`{{ display_name }}`}</code> - 玩家名稱
          </Typography>
        </Grid>
        <Grid item>
          <DemoArea imageUrl={formData.imageUrl} template={formData.template} />
        </Grid>
        <Grid container item justifyContent="flex-end">
          {/** 按鈕控制項 */}
          <div className={classes.wrapper}>
            <Button
              variant="contained"
              color="secondary"
              style={{ backgroundColor: "#FF3434" }}
              component={Link}
              disabled={loading}
              to={"/Admin/Worldboss/Message"}
            >
              取消
            </Button>
          </div>
          <div className={classes.wrapper}>
            <Button
              variant="contained"
              color="primary"
              disabled={!isValidImage || !isValidTemplate || loading}
              onClick={() => onSubmit({ data: formData, isValidImage, isValidTemplate })}
            >
              送出
            </Button>
            {loading && <CircularProgress size={24} className={classes.buttonProgress} />}
          </div>
        </Grid>
      </Grid>
    </FormControl>
  );
};

MessageForm.propTypes = {
  defaultImageUrl: PropTypes.string,
  defaultTemplate: PropTypes.string,
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
};

const DemoArea = ({ imageUrl = "", template = "" }) => {
  const demoData = { damage: 123456, display_name: "佑樹" };
  const classes = useStyles();
  const imageRegex = /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
  const isValidImage = imageRegex.test(imageUrl);

  return (
    <Grid
      container
      component={Paper}
      style={{ padding: "1rem" }}
      variant="outlined"
      className={classes.root}
      direction="column"
    >
      <Grid item>
        <Typography variant="h6">效果預覽</Typography>
      </Grid>
      <Grid container item alignItems="center" spacing={1}>
        <Grid item>
          <Avatar src={isValidImage && imageUrl} alt={"頭像"} />
        </Grid>
        <Grid item>
          <Typography variant="subtitle2">
            {template.replace(/{{.*?}}/gm, match => {
              const key = match.replace(/[{}]/g, "").trim();
              return demoData[key] || "";
            })}
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
};

DemoArea.propTypes = {
  imageUrl: PropTypes.string,
  template: PropTypes.string,
};

export default MessageForm;
