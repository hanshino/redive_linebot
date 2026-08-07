import axios from "axios";

// Auth is a same-origin HttpOnly cookie; nothing token-shaped is ever held in
// JS, so there is no Authorization header to set and nothing to clear.
const api = axios.create({
  timeout: 10000,
  withCredentials: true,
});

// 403 keeps its old behaviour (bounce home). 401 only announces itself:
// LiffProvider listens and syncs its logged-out state. Redirecting or
// re-authenticating from here would race the provider's one-shot session
// exchange into a login loop.
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    if (status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } else if (status === 403) {
      window.dispatchEvent(new CustomEvent("auth:forbidden"));
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export default api;
