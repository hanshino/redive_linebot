import React, { useRef, useMemo, useState, useEffect } from "react";
import MaterialTable from "material-table";
import TableLocal from "../../../config/TableLocaliztion";
import useAxios from "axios-hooks";
import Avatar from "@material-ui/core/Avatar";
import FormControl from "@material-ui/core/FormControl";
import TextField from "@material-ui/core/TextField";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import PropTypes from "prop-types";
import HintSnackBar, { useHintBar } from "../../HintSnackBar";

const useStyles = makeStyles(theme => ({
  form: {
    padding: theme.spacing(2),
  },
}));

const GachaShop = () => {
  const [mode, setMode] = useState("list");
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();
  const [{ data, loading }, refetch] = useAxios("/api/GodStoneShop");
  const [{ data: addResponse, loading: addLoading }, create] = useAxios(
    { url: "/api/Admin/GodStoneShop/item", method: "POST" },
    {
      manual: true,
    }
  );
  const [{ data: deleteResponse, loading: deleteLoading, error: deleteError }, deleteItem] =
    useAxios(
      { method: "DELETE" },
      {
        manual: true,
      }
    );
  const [{ data: updateResponse, loading: updateLoading, error: updateError }, updateItem] =
    useAxios(
      { method: "PUT" },
      {
        manual: true,
      }
    );
  const existIds = useMemo(() => {
    if (data) {
      return data.map(item => item.itemId);
    }
    return [];
  }, [data]);
  const columns = [
    {
      title: "頭像",
      field: "headImage",
      render: rowData => <Avatar alt={rowData.name} src={rowData.headImage} />,
    },
    {
      title: "名稱",
      field: "name",
    },
    {
      title: "價格",
      field: "price",
    },
    {
      title: "大圖",
      field: "itemImage",
    },
    {
      title: "編號",
      field: "id",
      hidden: true,
    },
  ];

  const handleAdd = formData => {
    create({
      data: formData,
    });
  };

  useEffect(() => {
    // 新增後的副作用處理
    if (addLoading) return;

    if (addResponse) {
      handleOpen("新增成功", "success");
      setMode("list");
      refetch();
    }
  }, [addResponse, addLoading]);

  useEffect(() => {
    // 刪除後的副作用處理
    if (deleteLoading) return;

    if (deleteResponse) {
      handleOpen("刪除成功", "success");
      refetch();
    } else if (deleteError) {
      handleOpen("刪除失敗", "error");
    }
  }, [deleteResponse, deleteLoading]);

  useEffect(() => {
    // 更新後的副作用處理
    if (updateLoading) return;

    if (updateResponse) {
      handleOpen("更新成功", "success");
      refetch();
    } else if (updateError) {
      handleOpen("更新失敗", "error");
    }
  }, [updateResponse, updateLoading]);

  const pageLoading = loading || addLoading;

  if (mode === "create") {
    return (
      <CreateForm
        existIds={existIds}
        onSubmit={handleAdd}
        onCancel={() => setMode("list")}
        loading={pageLoading}
      />
    );
  }

  return (
    <>
      <MaterialTable
        title="女神石商店管理"
        isLoading={pageLoading}
        columns={columns}
        localization={TableLocal}
        data={data}
        actions={[
          {
            icon: "add",
            tooltip: "新增",
            isFreeAction: true,
            onClick: () => setMode("create"),
          },
          {
            icon: "delete",
            tooltip: "刪除",
            onClick: (event, rowData) => {
              deleteItem({
                url: `/api/Admin/GodStoneShop/item/${rowData.id}`,
              });
            },
          },
        ]}
        editable={{
          onRowUpdate: (newData, oldData) =>
            updateItem({
              url: `/api/Admin/GodStoneShop/item/${oldData.id}`,
              data: newData,
            }),
        }}
      />
      <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
    </>
  );
};

const CreateForm = ({ onSubmit, onCancel, existIds, loading }) => {
  const [{ data: gachaData }] = useAxios("/api/Admin/GachaPool/Data");
  const [{ data: characters }] = useAxios("/api/Princess/Character/Images");
  const classes = useStyles();
  const idRef = useRef(null);
  const imageRef = useRef(null);
  const priceRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const nameList = useMemo(() => {
    if (gachaData) {
      return gachaData.filter(item => !existIds.includes(parseInt(item.id)));
    }
    return [];
  }, [gachaData, existIds]);

  const handleChange = () => {
    const id = parseInt(idRef.current.value);
    const target = gachaData.find(item => item.id === id);
    const character = characters.find(item => item.name === target.name);

    if (character) {
      imageRef.current.value = character.image;
      setPreview(character.image);
    }
  };

  const handleSubmit = () => {
    const target = gachaData.find(item => item.id === parseInt(idRef.current.value)) || {};
    const price = parseInt(priceRef.current.value);
    const bigImage = imageRef.current.value;

    if (!bigImage || !price || !target.id) {
      alert("請填寫完整");
    }

    onSubmit({
      id: target.id,
      item_image: bigImage,
      price,
    });
  };

  return (
    <FormControl fullWidth>
      <Grid container direction="column" spacing={1} component={Paper} className={classes.form}>
        <Grid item>
          <Typography variant="h6">新增商品</Typography>
        </Grid>
        <Grid item>
          <TextField
            inputRef={idRef}
            fullWidth
            color="primary"
            id="name"
            label="名稱"
            variant="outlined"
            required
            select
            SelectProps={{ native: true }}
            onChange={handleChange}
          >
            {nameList.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid item>
          <TextField
            fullWidth
            inputRef={priceRef}
            color="primary"
            id="price"
            label="價格"
            variant="outlined"
            required
            defaultValue={500}
          />
        </Grid>
        <Grid item>
          <TextField
            fullWidth
            inputRef={imageRef}
            color="primary"
            id="image"
            label="大圖"
            variant="outlined"
            required
          />
        </Grid>
        <Grid item container spacing={2}>
          <Grid item xs={6}>
            <Button
              onClick={onCancel}
              fullWidth
              color="secondary"
              variant="contained"
              size="large"
              disabled={loading}
            >
              取消
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button
              onClick={handleSubmit}
              fullWidth
              color="primary"
              variant="contained"
              size="large"
              disabled={loading}
            >
              新增
            </Button>
          </Grid>
        </Grid>
        {preview && <Grid item xs={12} component="img" src={preview} />}
      </Grid>
    </FormControl>
  );
};

CreateForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  existIds: PropTypes.array.isRequired,
  loading: PropTypes.bool.isRequired,
};

export default GachaShop;
