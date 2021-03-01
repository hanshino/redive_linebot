import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import Dialog from "@material-ui/core/Dialog";
import InputLabel from "@material-ui/core/InputLabel";
import InputAdornment from "@material-ui/core/InputAdornment";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import FormControl from "@material-ui/core/FormControl";
import DialogActions from "@material-ui/core/DialogActions";
import AddCircleOutlineIcon from "@material-ui/icons/AddCircleOutline";
import RemoveCircleOutlineIcon from "@material-ui/icons/RemoveCircleOutline";
import MessageIcon from "@material-ui/icons/Message";
import ImageIcon from "@material-ui/icons/Image";
import Grid from "@material-ui/core/Grid";
import PropTypes from "prop-types";

const DialogForm = props => {
  const { onClose, open, exec, orderDatas } = props;

  const initialState = {
    order: "",
    replyDatas: [],
    touchType: 1,
    senderName: "",
    senderIcon: "",
  };
  const [state, setState] = useState(initialState);

  React.useEffect(() => {
    let datas = JSON.parse(JSON.stringify(orderDatas));

    if (Object.keys(orderDatas).length !== 0) {
      setState({
        ...state,
        ...datas,
      });
    }
  }, [orderDatas, open]);

  const handleClose = () => {
    onClose();
    setState(initialState);
  };

  const handleSave = () => {
    exec(state);
    handleClose();
  };

  const handleOrder = event => {
    setState({
      ...state,
      order: event.target.value,
    });
  };

  const handleReply = (event, index) => {
    var replyDatas = state.replyDatas;

    replyDatas[index] = {
      no: index,
      messageType: getReplyType(event.target.value),
      reply: event.target.value,
    };

    setState({
      ...state,
      replyDatas: replyDatas,
    });
  };

  const addReply = index => {
    if (index >= 5) return;

    var replyDatas = state.replyDatas;

    replyDatas[index] = {
      no: index,
      messageType: "text",
      reply: "",
    };

    setState({
      ...state,
      replyDatas: replyDatas,
    });
  };

  const removeReply = index => {
    var replyDatas = state.replyDatas
      .filter((data, idx) => idx !== index)
      .map((data, idx) => ({ ...data, no: idx }));

    setState({
      ...state,
      replyDatas: replyDatas,
    });
  };

  const handleTouchType = event => {
    setState({
      ...state,
      touchType: event.target.value,
    });
  };

  const handleSenderName = event => {
    setState({
      ...state,
      senderName: event.target.value,
    });
  };

  const handleSenderIcon = event => {
    setState({
      ...state,
      senderIcon: event.target.value,
    });
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>指令編輯</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          id="order"
          label="指令"
          type="text"
          value={state.order}
          onChange={handleOrder}
          fullWidth
        />
        <ReplyField
          replyDatas={state.replyDatas}
          handleReply={handleReply}
          handleAddReply={addReply}
          handleRemoveReply={removeReply}
        />
        <FormControl fullWidth>
          <InputLabel id="Trigger-label">觸發方式</InputLabel>
          <Select labelId="Trigger-label" value={state.touchType} onChange={handleTouchType}>
            <MenuItem value="1">全符合</MenuItem>
            <MenuItem value="2">關鍵字符合</MenuItem>
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          id="senderName"
          label="發送人"
          type="text"
          value={state.senderName || ""}
          onChange={handleSenderName}
          fullWidth
        />
        <TextField
          margin="dense"
          id="senderIcon"
          label="發送人圖像"
          type="text"
          value={state.senderIcon || ""}
          onChange={handleSenderIcon}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          取消
        </Button>
        <Button onClick={handleSave} color="primary">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ReplyField = props => {
  const { replyDatas, handleReply, handleAddReply, handleRemoveReply } = props;

  return replyDatas.map((data, index) => (
    <Grid container spacing={1} alignItems="flex-end" key={data.no}>
      <Grid item>
        <TextField
          margin="dense"
          label="回覆內容"
          type="text"
          value={data.reply}
          onChange={event => handleReply(event, index)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {data.messageType === "image" ? <ImageIcon /> : <MessageIcon />}
              </InputAdornment>
            ),
          }}
        />
      </Grid>
      <Grid item>
        {index === 0 ? (
          <AddCircleOutlineIcon onClick={() => handleAddReply(replyDatas.length)} />
        ) : (
          <RemoveCircleOutlineIcon onClick={() => handleRemoveReply(index)} />
        )}
      </Grid>
    </Grid>
  ));
};

ReplyField.propTypes = {
  replyDatas: PropTypes.array.isRequired,
  handleReply: PropTypes.func.isRequired,
  handleAddReply: PropTypes.func.isRequired,
  handleRemoveReply: PropTypes.func.isRequired,
};

function getReplyType(reply) {
  return /^https:.*?(jpg|jpeg|tiff|png)$/i.test(reply) ? "image" : "text";
}

DialogForm.propTypes = {
  exec: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  orderDatas: PropTypes.object.isRequired,
};

export default DialogForm;
