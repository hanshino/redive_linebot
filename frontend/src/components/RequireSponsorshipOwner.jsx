import { Navigate, Outlet } from "react-router-dom";
import useLiff from "../context/useLiff";

// 僅本人（/api/me 的 canManageSponsorship === true）可進；其他 admin 一律導離。
// 這只是導覽用的 guard，後端每個端點仍各自驗證。
export default function RequireSponsorshipOwner() {
  const { loggedIn, profile } = useLiff();

  if (!loggedIn || profile?.canManageSponsorship !== true) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
