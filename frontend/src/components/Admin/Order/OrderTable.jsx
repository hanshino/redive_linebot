import React from "react";
import MaterialTable from "material-table";
import TableLocal from "../../../config/TableLocaliztion";
import Avatar from "@material-ui/core/Avatar";
import PropTypes from "prop-types";

const OrderTable = props => {
  const { action: dialogOpen, orders, handleDelete } = props;
  const [state, setState] = React.useState({
    columns: [
      { title: "金鑰", field: "orderKey", hidden: true },
      { title: "指令", field: "order" },
      { title: "觸發方式", field: "touchType", lookup: { 1: "全符合", 2: "關鍵字符合" } },
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

          return <Avatar alt={name} src={icon} />;
        },
      },
    ],
    data: [],
  });

  React.useEffect(() => {
    setState({
      ...state,
      data: orders,
    });
  }, [orders]);

  return (
    <MaterialTable
      title="全群指令管理"
      columns={state.columns}
      data={genTableData(state.data)}
      localization={TableLocal}
      actions={[
        {
          icon: "edit",
          tooltip: "編輯",
          onClick: (event, rowData) => dialogOpen(rowData),
        },
        {
          icon: "delete",
          tooltip: "刪除指令",
          onClick: (event, rowData) => handleDelete(rowData.orderKey),
        },
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
      ]}
    ></MaterialTable>
  );
};

function genTableData(rowDatas) {
  return rowDatas;
}

OrderTable.propTypes = {
  action: PropTypes.func.isRequired,
  orders: PropTypes.array.isRequired,
  handleDelete: PropTypes.func.isRequired,
};

export default OrderTable;
