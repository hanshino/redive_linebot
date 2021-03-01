import React from "react";
import OrderTable from "./OrderTable";
import OrderDialog from "../../OrderDialog";
import GlobalOrderAPI from "../../../api/GlobalOrder";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import { makeStyles } from "@material-ui/core/styles";
import Snackbar from "@material-ui/core/Snackbar";
import Alert from "@material-ui/lab/Alert";
import PropTypes from "prop-types";

const useStyles = makeStyles(theme => ({
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const Order = () => {
  const classes = useStyles();
  const [dialogState, setDialog] = React.useState({
    editing: false,
    datas: {},
  });
  const [loading, setLoading] = React.useState(true);
  const [orders, setDatas] = React.useState([]);
  const [alert, setAlert] = React.useState({
    level: "success",
    open: false,
    message: "default",
  });

  const dialogOpen = datas => {
    setDialog({
      ...dialogState,
      editing: true,
      datas: datas,
    });
  };

  const dialogClose = () => setDialog({ ...dialogState, editing: false });
  const fetchData = () =>
    GlobalOrderAPI.fetchDatas()
      .then(setDatas)
      .finally(() => setLoading(false));
  const handleDelete = key =>
    GlobalOrderAPI.deleteData(key)
      .then(() => {
        setAlert({
          ...alert,
          level: "success",
          message: "成功！",
          open: true,
        });
      })
      .then(fetchData)
      .finally(() => setLoading(false));

  React.useEffect(() => {
    window.document.title = "指令管理頁面";
    fetchData();
  }, []);

  return (
    <React.Fragment>
      <OrderTable action={dialogOpen} orders={orders} handleDelete={handleDelete} />
      <OrderDialog
        open={dialogState.editing}
        onClose={dialogClose}
        exec={handleSave}
        orderDatas={dialogState.datas}
      />
      <Backdrop className={classes.backdrop} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>
      <SnackAlert {...alert} onClose={() => setAlert({ ...alert, open: false })} />
    </React.Fragment>
  );

  function handleSave(orderData) {
    var action = "";
    if (
      !Object.prototype.hasOwnProperty.call(orderData, "orderKey") ||
      orderData.orderKey.trim() === ""
    ) {
      action = "insert";
    } else {
      action = "update";
    }

    if (orderData.order === undefined || orderData.order === "") return;
    if (!Array.isArray(orderData.replyDatas)) return;
    orderData.replyDatas = orderData.replyDatas.filter(data => data.reply !== "");

    var func = null;

    if (action === "insert") {
      func = GlobalOrderAPI.insertData;
    } else if (action === "update") {
      func = GlobalOrderAPI.updateData;
    }
    setLoading(true);

    return func(orderData)
      .then(fetchData)
      .then(() =>
        setAlert({
          ...alert,
          level: "success",
          message: "成功！",
          open: true,
        })
      )
      .catch(err => {
        console.log(err);
        setLoading(false);
        setAlert({
          ...alert,
          level: "warning",
          message: "操作失敗，是否尚未登入？ 或是 網路異常",
          open: true,
        });
      });
  }
};

const SnackAlert = props => {
  return (
    <Snackbar open={props.open} autoHideDuration={6000} onClose={props.onClose}>
      <Alert elevation={6} variant="filled" onClose={props.onClose} severity={props.level}>
        {props.message}
      </Alert>
    </Snackbar>
  );
};

SnackAlert.propTypes = {
  level: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default Order;
