import axios from "axios";

const TOKEN_KEY = "liff_access_token";

const api = axios.create({
  timeout: 10000,
});

export function setAuthToken(token) {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}

export function clearAuthToken() {
  delete api.defaults.headers.common["Authorization"];
}

// Clear expired token and redirect on 401; dispatch event and redirect on 403
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    if (status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      window.location.href = "/";
    } else if (status === 403) {
      window.dispatchEvent(new CustomEvent("auth:forbidden"));
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export default api;
