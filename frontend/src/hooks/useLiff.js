import { useReducer } from "react";
import liff from "@line/liff";
import { runLiffAction } from "../utils/liffAuth";

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

  const handleSend = async text => {
    dispatch({ type: "SEND_INIT" });
    const result = await runLiffAction(() => liff.sendMessages([{ type: "text", text }]));
    // A reauth result means the page is already redirecting to LINE login;
    // don't flash an error on the way out.
    if (result.ok) dispatch({ type: "SEND_SUCCESS" });
    else if (!result.reauth) dispatch({ type: "SEND_FAIL" });
  };

  return [state, handleSend];
};
