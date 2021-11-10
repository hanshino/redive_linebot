import React, { useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";

const WorldBoss = () => {
  const [{ data, loading }] = useAxios("/api/Game/World/Boss/Feature/Message");
  const columns = [
    { headerName: "id", field: "id" },
    { headerName: "頭像", field: "avatar" },
    { headerName: "訊息樣板", field: "template" },
  ];

  useEffect(() => {
    console.log(data);
    console.log(loading);
  }, []);

  return (
    <div style={{ height: 300, width: "100%" }}>
      <DataGrid columns={columns} rows={[]} />
    </div>
  );
};

export default WorldBoss;
