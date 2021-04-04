import React from "react";
import Alert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";

export default function AlertLogin() {
  return (
    <Alert severity="warning">
      <AlertTitle>Oops!你好像還沒登入！</AlertTitle>
      進行任何操作前，請先點擊右上角的登入！
    </Alert>
  );
}
