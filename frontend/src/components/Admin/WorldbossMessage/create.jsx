import { Grid } from "@material-ui/core";
import React, { useEffect, useState } from "react";
import MessageForm from "./Form";
import { Alert } from "@material-ui/lab";
import useAxios from "axios-hooks";
import { Snackbar } from "@material-ui/core";
import { Redirect } from "react-router-dom";

const WorldbossMessageCreate = () => {
  const [{ data, loading, error }, sendRequest] = useAxios(
    {
      url: "/api/Game/World/Boss/Feature/Message",
      method: "POST",
    },
    { manual: true }
  );
  const [errorControl, setError] = useState({ show: false, message: "" });

  const onSubmit = formData => {
    const { data = {}, isValidImage = false, isValidTemplate = false } = formData;
    const { template, imageUrl } = data;

    if (isValidImage && isValidTemplate) {
      const payload = { template };
      if (imageUrl) {
        payload.imageUrl = imageUrl;
      }
      sendRequest({
        data: payload,
      });
    } else {
      setError({ show: true, message: "Invalid form data" });
    }
  };

  useEffect(() => {
    if (error) {
      setError({ show: true, message: error.message });
    }
  }, [error]);

  // 如果成功，就導回列表頁
  if (data && data.message === "success") {
    return <Redirect to="/Admin/WorldbossMessage" />;
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
      <Snackbar
        open={errorControl.show}
        autoHideDuration={6000}
        onClose={() => setError({ ...errorControl, show: false })}
      >
        <Alert elevation={6} variant="filled" severity="error" style={{ width: "100%" }}>
          {errorControl.message}
        </Alert>
      </Snackbar>
    </Grid>
  );
};

export default WorldbossMessageCreate;
