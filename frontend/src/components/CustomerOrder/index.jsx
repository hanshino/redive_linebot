import React from "react";
import OrderTable from "./OrderTable";
import OrderDialog from "../OrderDialog";
import CustomerOrderAPI from "../../api/CustomerOrder";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import Alert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";
import { makeStyles } from "@material-ui/core/styles";
import { useParams } from "react-router-dom";
import Snackbar from "@material-ui/core/Snackbar";
import PropTypes from "prop-types";

const useStyles = makeStyles(theme => ({
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const CustomerOrder = () => {
  let match = useParams();
  const { sourceId } = match;
  const isLoggedIn = window.liff.isLoggedIn();
  const classes = useStyles();
  const [dialogState, setDialog] = React.useState({
    editing: false,
    datas: {},
  });
  const [loading, setLoading] = React.useState(false);
  const [orders, setOrders] = React.useState([]);
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
  const fetchData = async () => {
    setLoading(true);
    var resp = await CustomerOrderAPI.fetchOrders(sourceId);
    setOrders(resp);
    setLoading(false);
  };

  React.useEffect(() => {
    window.document.title = "自訂指令管理頁面";
    fetchData();
  }, []);

  return (
    <React.Fragment>
      <Alert severity="info">
        <AlertTitle>注意事項</AlertTitle>
        <li>兩個月未觸發指令進行刪除</li>
        <li>相同指令、回覆，無法重複新增</li>
        <li>完全符合的指令優先觸發</li>
      </Alert>
      {isLoggedIn ? null : <Alert severity="warning">按右上登入才可進行指令的修改動作</Alert>}
      <OrderTable
        action={dialogOpen}
        orders={orders}
        switchFunc={handleModifyStatus}
        sourceId={sourceId}
        isLoggedIn={isLoggedIn}
      />
      <Backdrop className={classes.backdrop} open={loading}>
        <CircularProgress />
      </Backdrop>
      <OrderDialog
        open={dialogState.editing}
        onClose={dialogClose}
        exec={handleSave}
        orderDatas={dialogState.datas}
      />
      <SnackAlert {...alert} onClose={() => setAlert({ ...alert, open: false })} />
    </React.Fragment>
  );

  function handleModifyStatus(sourceId, orderKey, status) {
    CustomerOrderAPI.setOrderStatus(sourceId, orderKey, status)
      .then(fetchData)
      .then(() => {
        setAlert({
          ...alert,
          level: "success",
          message: "成功！",
          open: true,
        });
      });
  }

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
      func = CustomerOrderAPI.insertData;
    } else if (action === "update") {
      func = CustomerOrderAPI.updateOrder;
    }
    setLoading(true);

    return func(sourceId, orderData)
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

export default CustomerOrder;
