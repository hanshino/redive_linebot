import { useReducer } from "react";
import Axios from "axios";

const axios = Axios.create({
  baseURL: "/api",
});
const initialState = {
  isLoading: false,
  isSuccess: false,
  isFinish: false,
  isError: false,
  errorMessage: "",
  url: "",
  method: "get",
  requestData: null,
};

const queryReducer = (state, action) => {
  const actions = {
    FETCH_INIT: "fetch_init",
  };

  const handlers = {};

  handlers[FETCH_INIT] = initHandler;

  return handler[action.type];
};

const initHandler = state => {
  return {
    ...state,
    isLoading: false,
  };
};

export default url => {
  const [state, dispatcher] = useReducer(queryReducer, {
    isLoading,
  });
};
