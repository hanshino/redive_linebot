import { useReducer } from "react";

const sendMsgReducer = (state, action) => {
  switch (action.type) {
    case "SEND_INIT":
      return { ...state, isSending: true, isError: false, isSuccess: false };
    case "SEND_SUCCESS":
      return { ...state, isSending: false, isError: false, isSuccess: true };
    case "SEND_FAIL":
      return { ...state, isSending: false, isError: true, isSuccess: false };
    default:
      throw new Error("Unknown action type");
  }
};

export const useSendMessage = () => {
  const [state, dispatch] = useReducer(sendMsgReducer, {
    isSending: false,
    isError: false,
    isSuccess: false,
  });

  const handleSend = async (text) => {
    dispatch({ type: "SEND_INIT" });
    try {
      await window.liff.sendMessages([{ type: "text", text }]);
      dispatch({ type: "SEND_SUCCESS" });
    } catch {
      dispatch({ type: "SEND_FAIL" });
    }
  };

  return [state, handleSend];
};
