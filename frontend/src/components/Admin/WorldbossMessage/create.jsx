import { Grid } from "@material-ui/core";
import React, { useState } from "react";
import MessageForm from "./Form";
import { Alert } from "@material-ui/lab";
import useAxios from "axios-hooks";
import { Snackbar } from "@material-ui/core";
import { Redirect } from "react-router";

const WorldbossMessageCreate = () => {
  const [{ data, loading }, sendRequest] = useAxios(
    {
      url: "/api/Game/World/Boss/Feature/Message",
      method: "POST",
    },
    { manual: true }
  );
  const [showError, setShowError] = useState(false);

  const onSubmit = formData => {
    const { data = {}, isValidImage = false, isValidTemplate = false } = formData;
    const { template, imageUrl } = data;
    console.log(data);

    if (isValidImage && isValidTemplate) {
      sendRequest({
        data: {
          template,
          icon_url: imageUrl,
        },
      });
    } else {
      setShowError(true);
    }
  };

  // 如果成功，就導回列表頁
  if (data && data.message === "success") {
    return <Redirect to="/Admin/Worldboss/Message" />;
  }

  return (
    <Grid container direction="column" spacing={1}>
      <Grid item>
        <Alert severity="warning">
          請注意，此訊息建立後，將立即生效，所有玩家將會馬上注意到此訊息的內容。
        </Alert>
      </Grid>
      <Grid item>
        <MessageForm onSubmit={onSubmit} loading={loading} />
      </Grid>
      <Snackbar open={showError} autoHideDuration={6000} onClose={() => setShowError(false)}>
        <Alert elevation={6} variant="filled" severity="error" style={{ width: "100%" }}>
          請檢查內容是否有錯誤！
        </Alert>
      </Snackbar>
    </Grid>
  );
};

export default WorldbossMessageCreate;
