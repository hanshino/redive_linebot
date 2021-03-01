import { useReducer } from "react";

const sendMsgReducer = (state, action) => {
  switch (action.type) {
    case "SEND_INIT":
      return {
        ...state,
        isSending: true,
        isError: false,
      };
    case "SEND_SUCCESS":
      return {
        ...state,
        isSending: false,
        isError: false,
      };
    case "SEND_FAIL":
      return {
        ...state,
        isSending: false,
        isError: true,
      };
    default:
      throw new Error("None action type catch.");
  }
};

export const useSendMessage = () => {
  const [state, dispatch] = useReducer(sendMsgReducer, {
    isSending: false,
    isError: false,
  });

  const handleSend = async text => {
    dispatch({ type: "SEND_INIT" });
    let res = await window.liff
      .sendMessages([{ type: "text", text }])
      .then(() => true)
      .catch(() => false);

    if (res) dispatch({ type: "SEND_SUCCESS" });
    else dispatch({ type: "SEND_FAIL" });
  };

  return [state, handleSend];
};
