import { useEffect, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
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
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2, bgcolor: "background.default" }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        效果預覽
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar src={validUrl} alt="頭像" />
        <Typography variant="body2">
          {template.replace(/{{.*?}}/gm, (match) => {
            const key = match.replace(/[{}]/g, "").trim();
            return demoData[key] || "";
          })}
        </Typography>
      </Box>
    </Paper>
  );
}

function MessageForm({
  defaultImageUrl = "",
  defaultTemplate = "",
  onSubmit = () => {},
  loading = false,
}) {
  const navigate = useNavigate();
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

  const templateTags = [
    { label: "傷害資訊", value: " {{ damage }}" },
    { label: "玩家名稱", value: " {{{ display_name }}}" },
    { label: "怪物名稱", value: " {{ boss_name }}" },
  ];

  return (
    <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
      <FormControl fullWidth>
        <Stack spacing={2.5}>
          <TextField
            fullWidth
            label="樣板訊息"
            multiline
            rows={3}
            variant="outlined"
            value={formData.template}
            error={!isValidTemplate}
            helperText={!isValidTemplate ? "請輸入樣板訊息" : ""}
            onChange={(event) => handleChange("template", event.target.value)}
          />

          <TextField
            fullWidth
            label="頭像網址"
            variant="outlined"
            value={formData.imageUrl}
            error={!isValidImage}
            helperText={!isValidImage ? "請輸入有效的圖片網址 (jpg/png)" : ""}
            onChange={(event) => handleChange("imageUrl", event.target.value)}
          />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
              點擊插入樣板標籤：
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {templateTags.map((tag) => (
                <Tooltip key={tag.label} title={`插入 ${tag.value.trim()}`} arrow>
                  <Chip
                    label={tag.label}
                    variant="outlined"
                    clickable
                    onClick={() =>
                      handleChange("template", `${formData.template}${tag.value}`)
                    }
                    size="small"
                  />
                </Tooltip>
              ))}
            </Box>
          </Box>

          <DemoArea imageUrl={formData.imageUrl} template={formData.template} />

          <Divider />

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => navigate("/admin/worldboss-message")}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={!isValidImage || !isValidTemplate || loading}
              onClick={() =>
                onSubmit({ data: formData, isValidImage, isValidTemplate })
              }
            >
              {loading ? "送出中..." : "送出"}
            </Button>
          </Box>
        </Stack>
      </FormControl>
    </Paper>
  );
}

export default function AdminWorldbossMessageCreate() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();
  const [{ data, loading, error }, sendRequest] = useAxios(
    {
      url: "/api/game/world-boss/feature-messages",
      method: "POST",
    },
    { manual: true }
  );
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  useEffect(() => {
    document.title = "管理員用－新增世界王訊息";
  }, []);

  useEffect(() => {
    if (error) {
      showHint(error.message, "error");
    }
  }, [error]);

  useEffect(() => {
    if (data && data.message === "success") {
      navigate("/admin/worldboss-message");
    }
  }, [data, navigate]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const onSubmit = (formData) => {
    const {
      data: formValues = {},
      isValidImage = false,
      isValidTemplate = false,
    } = formData;
    const { template, imageUrl } = formValues;

    if (isValidImage && isValidTemplate) {
      const payload = { template };
      if (imageUrl) {
        payload.icon_url = imageUrl;
      }
      sendRequest({ data: payload });
    } else {
      showHint("Invalid form data", "error");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title="返回列表" arrow>
          <IconButton onClick={() => navigate("/admin/worldboss-message")}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          新增世界王訊息
        </Typography>
      </Box>

      <Alert severity="warning">
        請注意，此訊息建立後，將立即生效，所有玩家將會馬上注意到此訊息的內容。
      </Alert>

      <MessageForm onSubmit={onSubmit} loading={loading} />

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
