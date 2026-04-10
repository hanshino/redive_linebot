import { Navigate, Outlet } from "react-router-dom";
import useLiff from "../context/useLiff";

export default function RequireAdmin() {
  const { loggedIn, isAdmin } = useLiff();

  if (!loggedIn || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
