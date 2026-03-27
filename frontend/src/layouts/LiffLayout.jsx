import { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FullPageLoading } from "../components/Loading";

const LIFF_PARAMS = ["code", "state", "liffClientId", "liffRedirectUri", "liff.state"];

export default function LiffLayout() {
  const { size, "*": redirectPath } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.localStorage.setItem("liff_size", size);
    const path = redirectPath ? `/${redirectPath}` : "/";

    // Filter out LIFF OAuth params, only forward app-specific query params
    const params = new URLSearchParams(location.search);
    LIFF_PARAMS.forEach(p => params.delete(p));
    const search = params.toString();
    const target = search ? `${path}?${search}` : path;

    navigate(target, { replace: true });
  }, [size, redirectPath, location.search, navigate]);

  return <FullPageLoading />;
}
