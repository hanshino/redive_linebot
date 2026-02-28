import { useState, useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import {
  Grid,
  Snackbar,
  Alert,
  FormControl,
  TextField,
  Typography,
  Button,
  Avatar,
  Paper,
  CircularProgress,
  Box,
} from "@mui/material";
import { green } from "@mui/material/colors";
import { FullPageLoading } from "../../components/Loading";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function DemoArea({ imageUrl = "", template = "" }) {
  const demoData = {
    damage: 123456,
    display_name: "佑樹",
    boss_name: "要塞破壞者",
  };
  const imageRegex =
    /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
  const isValidImage = imageRegex.test(imageUrl);
  const validUrl = isValidImage ? imageUrl : "";

  return (
    <Grid
      container
      component={Paper}
      variant="outlined"
      sx={{ p: 2, "& > *": { mb: 1 } }}
      direction="column"
    >
      <Grid>
        <Typography variant="h6">效果預覽</Typography>
      </Grid>
      <Grid container alignItems="center" spacing={1}>
        <Grid>
          <Avatar src={validUrl} alt="頭像" />
        </Grid>
        <Grid>
          <Typography variant="subtitle2">
            {template.replace(/{{.*?}}/gm, (match) => {
              const key = match.replace(/[{}]/g, "").trim();
              return demoData[key] || "";
            })}
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}

function MessageForm({
  defaultImageUrl = "",
  defaultTemplate = "",
  onSubmit = () => {},
  loading = false,
}) {
  const [formData, setFormData] = useState({
    imageUrl: defaultImageUrl,
    template: defaultTemplate,
  });

  const handleChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const imageRegex =
    /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
  const isValidImage = !formData.imageUrl || imageRegex.test(formData.imageUrl);
  const isValidTemplate = formData.template.length > 0;

  return (
    <FormControl fullWidth>
      <Grid container direction="column" sx={{ "& > *": { mb: 1 } }}>
        <Grid>
          <TextField
            fullWidth
            label="樣板訊息"
            multiline
            variant="outlined"
            value={formData.template}
            error={!isValidTemplate}
            onChange={(event) => handleChange("template", event.target.value)}
          />
        </Grid>
        <Grid>
          <TextField
            fullWidth
            label="頭像"
            variant="outlined"
            value={formData.imageUrl}
            error={!isValidImage}
            onChange={(event) => handleChange("imageUrl", event.target.value)}
          />
        </Grid>
        <Grid>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() =>
                handleChange("template", `${formData.template} {{ damage }}`)
              }
            >
              傷害資訊
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() =>
                handleChange(
                  "template",
                  `${formData.template} {{{ display_name }}}`
                )
              }
            >
              玩家名稱
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() =>
                handleChange(
                  "template",
                  `${formData.template} {{ boss_name }}`
                )
              }
            >
              怪物名稱
            </Button>
          </Box>
        </Grid>
        <Grid>
          <Typography variant="caption">
            樣板訊息可使用以下標籤：
            <br />
            <code>{`{{ damage }}`}</code> - 傷害資訊
            <br />
            <code>{`{{ display_name }}`}</code> - 玩家名稱
            <br />
            <code>{`{{ boss_name }}`}</code> - 怪物名稱
          </Typography>
        </Grid>
        <Grid>
          <DemoArea imageUrl={formData.imageUrl} template={formData.template} />
        </Grid>
        <Grid container justifyContent="flex-end">
          <Box sx={{ position: "relative", m: 1 }}>
            <Button
              variant="contained"
              color="error"
              component="a"
              href="/admin/worldboss-message"
              disabled={loading}
              sx={{ mr: 1 }}
            >
              取消
            </Button>
          </Box>
          <Box sx={{ position: "relative", m: 1 }}>
            <Button
              variant="contained"
              color="primary"
              disabled={!isValidImage || !isValidTemplate || loading}
              onClick={() =>
                onSubmit({ data: formData, isValidImage, isValidTemplate })
              }
            >
              送出
            </Button>
            {loading && (
              <CircularProgress
                size={24}
                sx={{
                  color: green[500],
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  mt: "-12px",
                  ml: "-12px",
                }}
              />
            )}
          </Box>
        </Grid>
      </Grid>
    </FormControl>
  );
}

export default function AdminWorldbossMessageUpdate() {
  const { loggedIn: isLoggedIn } = useLiff();
  const { id } = useParams();
  const navigate = useNavigate();
  const [errorControl, setError] = useState({ show: false, message: "" });
  const [{ data, loading }] = useAxios(
    `/api/game/world-boss/feature-messages/${id}`
  );
  const [
    { data: updateData, loading: updateLoading, error: updateError },
    update,
  ] = useAxios(
    {
      url: `/api/game/world-boss/feature-messages/${id}`,
      method: "PUT",
    },
    { manual: true }
  );

  useEffect(() => {
    if (updateError) {
      setError({ show: true, message: updateError.message });
    }
  }, [updateError]);

  useEffect(() => {
    if (updateData && updateData.message === "success") {
      navigate("/admin/worldboss-message");
    }
  }, [updateData, navigate]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (loading) return <FullPageLoading />;

  const message = data?.data;
  if (!message) return null;
  const { icon_url, template } = message;

  const onSubmit = (formData) => {
    const {
      data: formValues = {},
      isValidImage = false,
      isValidTemplate = false,
    } = formData;
    const { template: tmpl, imageUrl } = formValues;

    if (isValidImage && isValidTemplate) {
      const payload = { template: tmpl };
      if (imageUrl) {
        payload.icon_url = imageUrl;
      }
      update({ data: payload });
    } else {
      setError({ show: true, message: "Invalid form data" });
    }
  };

  return (
    <Grid container direction="column" spacing={1}>
      <Grid>
        <MessageForm
          defaultImageUrl={icon_url}
          defaultTemplate={template}
          onSubmit={onSubmit}
          loading={updateLoading || loading}
        />
      </Grid>
      <Snackbar
        open={errorControl.show}
        autoHideDuration={6000}
        onClose={() => setError({ ...errorControl, show: false })}
      >
        <Alert
          elevation={6}
          variant="filled"
          severity="error"
          sx={{ width: "100%" }}
        >
          {errorControl.message}
        </Alert>
      </Snackbar>
    </Grid>
  );
}
