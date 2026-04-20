import { useState, useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
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
  Skeleton,
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
  const imageRegex = /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
  const isValidImage = imageRegex.test(imageUrl);
  const validUrl = isValidImage ? imageUrl : "";

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "background.default" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        效果預覽
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar src={validUrl} alt="頭像" />
        <Typography variant="body2">
          {template.replace(/{{.*?}}/gm, match => {
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

  const imageRegex = /^https?:\/\/(?:[a-z-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpe?g|png)$/;
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
            onChange={event => handleChange("template", event.target.value)}
          />

          <TextField
            fullWidth
            label="頭像網址"
            variant="outlined"
            value={formData.imageUrl}
            error={!isValidImage}
            helperText={!isValidImage ? "請輸入有效的圖片網址 (jpg/png)" : ""}
            onChange={event => handleChange("imageUrl", event.target.value)}
          />

          <Box>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                mb: 1,
                display: "block",
              }}
            >
              點擊插入樣板標籤：
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {templateTags.map(tag => (
                <Tooltip key={tag.label} title={`插入 ${tag.value.trim()}`} arrow>
                  <Chip
                    label={tag.label}
                    variant="outlined"
                    clickable
                    onClick={() => handleChange("template", `${formData.template}${tag.value}`)}
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
              onClick={() => onSubmit({ data: formData, isValidImage, isValidTemplate })}
            >
              {loading ? "更新中..." : "更新"}
            </Button>
          </Box>
        </Stack>
      </FormControl>
    </Paper>
  );
}

export default function AdminWorldbossMessageUpdate() {
  const { loggedIn: isLoggedIn } = useLiff();
  const { id } = useParams();
  const navigate = useNavigate();
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [{ data, loading }] = useAxios(`/api/game/world-boss/feature-messages/${id}`);
  const [{ data: updateData, loading: updateLoading, error: updateError }, update] = useAxios(
    {
      url: `/api/game/world-boss/feature-messages/${id}`,
      method: "PUT",
    },
    { manual: true }
  );

  useEffect(() => {
    document.title = "管理員用－編輯世界王訊息";
  }, []);

  useEffect(() => {
    if (updateError) {
      showHint(updateError.message, "error");
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

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="rounded" width={200} height={32} />
        </Box>
        <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
          <Stack spacing={2.5}>
            <Skeleton variant="rounded" height={96} />
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={80} />
          </Stack>
        </Paper>
      </Box>
    );
  }

  const message = data?.data;
  if (!message) return null;
  const { icon_url, template } = message;

  const onSubmit = formData => {
    const { data: formValues = {}, isValidImage = false, isValidTemplate = false } = formData;
    const { template: tmpl, imageUrl } = formValues;

    if (isValidImage && isValidTemplate) {
      const payload = { template: tmpl };
      if (imageUrl) {
        payload.icon_url = imageUrl;
      }
      update({ data: payload });
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
          編輯世界王訊息
        </Typography>
      </Box>

      <MessageForm
        defaultImageUrl={icon_url}
        defaultTemplate={template}
        onSubmit={onSubmit}
        loading={updateLoading || loading}
      />

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
