import { Outlet } from "react-router-dom";
import useLiff from "../context/useLiff";
import AccessDenied from "./AccessDenied";

// 這只是導覽用的 guard，後端每個端點仍各自驗證。
// 沒權限時不再靜默導回首頁，而是明講原因（未登入再多給登入鍵）。
export default function RequireAdmin() {
  const { loggedIn, isAdmin } = useLiff();

  if (!loggedIn || !isAdmin) {
    return <AccessDenied title="需要管理員權限" />;
  }

  return <Outlet />;
}
