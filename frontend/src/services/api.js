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

// Clear expired token and reload on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;
