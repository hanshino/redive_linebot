import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import GachaPoolAPI from "../../../api/GachaPool";
import Avatar from "@material-ui/core/Avatar";
import MaterialTable from "material-table";
import TableLocal from "../../../config/TableLocaliztion";

const useStyle = makeStyles(theme => ({
  avatar: {
    height: theme.spacing(5),
    width: theme.spacing(5),
  },
}));

const PoolList = () => {
  const classes = useStyle();

  const [state, setState] = React.useState({
    columns: [
      {
        title: "頭像",
        field: "imageUrl",
        // eslint-disable-next-line react/display-name
        render: rowData => (
          <Avatar className={classes.avatar} alt={rowData.name} src={rowData.imageUrl} />
        ),
      },
      { title: "編號", field: "id", hidden: true },
      { title: "名字", field: "name" },
      {
        title: "星數",
        field: "star",
        lookup: { 1: "Rare(1)", 2: "SuperRare(2)", 3: "UltraRare(3)" },
      },
      { title: "機率", field: "rate" },
      { title: "是公主嗎", field: "isPrincess", lookup: { 1: "是公主", 0: "不是公主" } },
      { title: "標籤", field: "tag" },
    ],
    data: [],
    localization: {
      ...TableLocal,
      body: {
        ...TableLocal.body,
        addTooltip: "新增角色",
        deleteTooltip: "刪除角色",
      },
      toolbar: {
        searchPlaceholder: "輸入角色名稱",
      },
    },
  });

  async function fetchData() {
    const data = await GachaPoolAPI.fetchData();
    setState({
      ...state,
      data: data,
    });
  }

  React.useEffect(() => {
    fetchData();
  }, []);

  return (
    <MaterialTable
      title="卡池管理系統"
      columns={state.columns}
      data={genTableData(state.data)}
      localization={state.localization}
      editable={{
        onRowAdd: handleRowAdd,
        onRowUpdate: handleRowUpdate,
        onRowDelete: handleRowDelete,
      }}
    />
  );

  function handleRowUpdate(newData, oldData) {
    var poolData = state.data;

    // 單純更新網頁看到的資料
    var foundIdx = poolData.findIndex(data => data.id === oldData.id);

    poolData[foundIdx] = newData;

    setState({
      ...state,
      data: poolData,
    });

    return GachaPoolAPI.updateData(newData.id, {
      name: newData.name,
      headImage_url: newData.imageUrl,
      star: newData.star,
      rate: newData.rate,
      is_princess: newData.isPrincess,
      tag: newData.tag,
    });
  }

  function handleRowAdd(newData) {
    return GachaPoolAPI.insertData({
      name: newData.name,
      headImage_url: newData.imageUrl,
      star: newData.star,
      rate: newData.rate,
      is_princess: newData.isPrincess,
      tag: newData.tag,
    })
      .then(res => {
        if (Object.keys(res).length === 0) return GachaPoolAPI.fetchData();
      })
      .then(data => {
        setState({
          ...state,
          data: data,
        });
      });
  }

  function handleRowDelete(oldData) {
    var poolData = state.data;
    // 單純更新網頁看到的資料
    poolData = poolData.filter(data => data.id !== oldData.id);

    setState({
      ...state,
      data: poolData,
    });

    return GachaPoolAPI.deleteData(oldData.id);
  }
};

function genTableData(poolData) {
  return poolData.map(data => {
    data.rate = parseFloat(data.rate) + "%";
    data.isPrincess = parseInt(data.isPrincess);
    return data;
  });
}

export default PoolList;
