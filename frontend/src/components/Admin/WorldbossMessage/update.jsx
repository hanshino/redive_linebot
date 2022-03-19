import React, { useState, useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams } from "react-router-dom";
import MessageForm from "./Form";
import { Grid } from "@material-ui/core";
import { Snackbar } from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import { Redirect } from "react-router-dom";

const WorldbossMessageUpdate = () => {
  const { id } = useParams();
  const [errorControl, setError] = useState({ show: false, message: "" });
  const [{ data, loading }] = useAxios(`/api/Game/World/Boss/Feature/Message/${id}`);
  const [{ data: updateData, loading: updateLoading, error: updateError }, update] = useAxios(
    {
      url: `/api/Game/World/Boss/Feature/Message/${id}`,
      method: "PUT",
    },
    { manual: true }
  );

  const onSubmit = formData => {
    const { data = {}, isValidImage = false, isValidTemplate = false } = formData;
    const { template, imageUrl } = data;

    if (isValidImage && isValidTemplate) {
      const payload = { template };
      if (imageUrl) {
        payload.icon_url = imageUrl;
      }
      update({
        data: payload,
      });
    } else {
      setError({ show: true, message: "Invalid form data" });
    }
  };

  useEffect(() => {
    if (updateError) {
      setError({ show: true, message: updateError.message });
    }
  }, [updateError]);

  if (loading) return <div>Loading...</div>;

  // 如果成功，就導回列表頁
  if (updateData && updateData.message === "success") {
    return <Redirect to="/Admin/WorldbossMessage" />;
  }

  const message = data?.data;
  const { icon_url, template } = message;

  return (
    <Grid container direction="column" spacing={1}>
      <Grid item>
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
        <Alert elevation={6} variant="filled" severity="error" style={{ width: "100%" }}>
          {errorControl.message}
        </Alert>
      </Snackbar>
    </Grid>
  );
};

export default WorldbossMessageUpdate;
