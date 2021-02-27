import React from "react";
import {io as webSocket} from "socket.io/client-dist/socket.io";
import SourceList from "./SourceList";
import ContentDialog from "./ContentDialog";

const Message = () => {
  const [events, setEvents] = React.useState([]);
  const [dialogState, setDialog] = React.useState({
    open: false,
    data: [],
    currId: null,
  });

  React.useEffect(() => {
    window.document.title = "管理員後台訊息管理";
    let socket = webSocket("/Admin/Messages", {
      query: {
        token: window.liff.getAccessToken(),
        something: "test",
      },
    });

    socket.on("newEvent", event => handleEvent(event));
    socket.on("error", alert);
  }, []);

  React.useEffect(() => {
    if (dialogState.open && dialogState.currId) {
      setDialog({
        ...dialogState,
        data: genDialogData(dialogState.currId),
      });
    }
  }, [events]);

  const handleEvent = event => {
    setEvents(events => [...events, event]);
  };

  const handleOpen = sourceId => {
    setDialog({
      open: true,
      data: genDialogData(sourceId),
      currId: sourceId,
    });
  };

  const handleClose = () => {
    setDialog({
      open: false,
      data: [],
      currId: null,
    });
  };

  const genDialogData = sourceId => {
    var sourceType = "";
    switch (sourceId[0]) {
      case "C":
        sourceType = "group";
        break;
      case "R":
        sourceType = "room";
        break;
      case "U":
      default:
        sourceType = "user";
        break;
    }

    return events.filter(
      event => event.source[`${sourceType}Id`] === sourceId && event.source.type === sourceType
    );
  };

  return (
    <React.Fragment>
      <SourceList events={events} handleOpen={handleOpen} />
      <ContentDialog open={dialogState.open} datas={dialogState.data} handleClose={handleClose} />
    </React.Fragment>
  );
};

export default Message;
