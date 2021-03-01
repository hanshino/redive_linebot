import React from "react";
import MaterialTable from "material-table";
import TableLocal from "../../config/TableLocaliztion";
import Avatar from "@material-ui/core/Avatar";
import PropTypes from "prop-types";

const OrderTable = props => {
  const { action: dialogOpen, orders, switchFunc, sourceId, isLoggedIn } = props;
  const [state, setState] = React.useState({
    columns: [
      { title: "金鑰", field: "orderKey", hidden: true },
      { title: "指令", field: "order" },
      { title: "觸發方式", field: "touchType", lookup: { 1: "全符合", 2: "關鍵字符合" } },
      { title: "狀態", field: "status", lookup: { 1: "啟用", 0: "關閉" } },
      {
        title: "發送名",
        field: "senderName",
        render: rowData => rowData.senderName || "預設",
      },
      {
        title: "發送頭像",
        field: "senderIcon",
        // eslint-disable-next-line react/display-name
        render: rowData => {
          let icon = rowData.senderIcon || "預設";
          let name = rowData.senderName || "預設";

          return <Avatar alt={name} src={icon === "預設" ? null : icon} />;
        },
      },
    ],
    data: [],
  });

  React.useEffect(() => {
    setState({
      ...state,
      data: arrangeOrderDatas(orders),
    });
  }, [orders]);

  return (
    <MaterialTable
      title="自訂指令管理"
      columns={state.columns}
      data={state.data}
      localization={TableLocal}
      actions={[
        {
          icon: "add",
          tooltip: "新增指令",
          isFreeAction: true,
          onClick: () =>
            dialogOpen({
              order: "",
              touchType: "1",
              senderIcon: "",
              senderName: "",
              orderKey: "",
              replyDatas: [{ no: 0, messageType: "text", reply: "回覆內容" }],
            }),
        },
        rowData => ({
          icon: "edit",
          tooltip: "編輯",
          onClick: (event, rowData) => dialogOpen(rowData),
          disabled: rowData.status === 0 || !isLoggedIn,
        }),
        rowData => {
          if (rowData.status === 1) {
            return {
              icon: "delete",
              tooltip: "刪除指令",
              disabled: !isLoggedIn,
              onClick: (event, rowData) => switchFunc(sourceId, rowData.orderKey, 0),
            };
          } else if (rowData.status === 0) {
            return {
              icon: "restore",
              tooltip: "回復指令",
              disabled: !isLoggedIn,
              onClick: (event, rowData) => switchFunc(sourceId, rowData.orderKey, 1),
            };
          }
        },
      ]}
    ></MaterialTable>
  );
};

OrderTable.propTypes = {
  action: PropTypes.func.isRequired,
  orders: PropTypes.array.isRequired,
  switchFunc: PropTypes.func.isRequired,
  sourceId: PropTypes.string.isRequired,
  isLoggedIn: PropTypes.bool.isRequired,
};

/**
 * 獲取自訂指令列表
 * @param {Array} orderDatas 來源ID
 */
function arrangeOrderDatas(orderDatas) {
  var hashReplies = {};
  if (orderDatas.length === 0) return orderDatas;

  orderDatas.forEach(data => {
    hashReplies[data.orderKey] = hashReplies[data.orderKey] || [];
    hashReplies[data.orderKey].push({
      messageType: data.messageType,
      reply: data.reply,
      no: data.no,
    });
  });

  var result = Object.keys(hashReplies).map(orderKey => {
    let { cusOrder, touchType, status, senderName, senderIcon } = orderDatas.find(
      data => data.orderKey === orderKey
    );
    return {
      order: cusOrder,
      touchType,
      replyDatas: hashReplies[orderKey],
      status: status,
      orderKey,
      senderName,
      senderIcon,
    };
  });

  return result;
}

export default OrderTable;
